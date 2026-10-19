#!/usr/bin/env python3
"""Offline preflight for credentials and potential publisher cost paths.

Does not contact providers, execute package hooks or certify runtime traffic.
Findings contain rule/path/line only; matched values are never printed.
"""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
from urllib.parse import urlsplit

LIMIT = 8 * 1024 * 1024
SECRETS = {
    "PRIVATE_KEY": re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"),
    "GITHUB_TOKEN": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "AWS_ACCESS_ID": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "LIVE_SECRET": re.compile(r"\b(?:sk_live_|sk-proj-|sb_secret_)[A-Za-z0-9_-]{16,}\b"),
    "JWT": re.compile(r"\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b"),
}
NAMED_VALUE_PATTERN = re.compile(
    r'''(?im)["']?\b(?:token|secret|api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|password|service[_-]?role[_-]?key|client[_-]?secret|billing[_-]?account[_-]?id)["']?\s*[:=]\s*["']([^"'\r\n]+)["']'''
)
ENV_VALUE_PATTERN = re.compile(
    r"(?im)^\s*(?:[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|BILLING_ACCOUNT_ID))\s*=\s*([^\r\n#]+)"
)
URL = re.compile(r'''(?:https?|postgres(?:ql)?|rediss?|mongodb(?:\+srv)?|mysql)://[^\s<>"'`)\]}]+''')
LOCKFILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}
# Reviewed literal used only to validate local research metadata, not a request.
OFFLINE_REFERENCE_URLS = {
    "scripts/check-design.py": {"https://registry.npmjs.org/"},
    "scripts/audit-cost-security.py": {"https://registry.npmjs.org/"},
}
DOCUMENTATION_HOSTS = {
    "www.w3.org", "www.topografix.com",  # Geolocation / GPX specifications, docs only.
    "www.postgresql.org",  # Reviewed SQL documentation, not a runtime endpoint.
    "csv.js.org",  # Reviewed parser documentation only; never a runtime provider.
    "raw.githubusercontent.com", "openfontlicense.org",  # Reviewed Noto/OFL documentation only.
    "github.com", "docs.github.com", "maplibre.org", "docs.expo.dev", "nextjs.org",
    "www.rfc-editor.org", "postgis.net", "docs.protomaps.com", "nominatim.org",
    "operations.osmfoundation.org", "project-osrm.org", "supabase.com",
    "www.openstreetmap.org", "www.kogl.or.kr", "www.data.go.kr",
    "download.geofabrik.de", "opendatacommons.org", "wiki.openstreetmap.org",
    "www.vworld.kr", "map.ngii.go.kr", "www.law.go.kr",
    "business.juso.go.kr", "file.localdata.go.kr",
    "pnpm.io", "typescript-eslint.io", "vitest.dev", "prettier.io",
    "registry.npmjs.org", "nodejs.org", "www.juso.go.kr", "valhalla.github.io",
}
STANDARD_RUNNERS = {
    "ubuntu-latest", "ubuntu-22.04", "ubuntu-24.04",
    "windows-latest", "windows-2022", "windows-2025",
    "macos-latest", "macos-14", "macos-15", "macos-26",
}


def placeholder(value):
    value = value.strip().strip('"\'')
    return (not value or value.startswith(("${", "<", "process.env.", "os.environ"))
            or value.lower() in {"undefined", "null", "changeme", "replace_me", "your_key_here"})


def scan(path, data, scope):
    findings = []

    def add(rule, position=0):
        findings.append({"scope": scope, "path": path, "line": data[:position].count(b"\n") + 1, "rule": rule})

    name = PurePosixPath(path).name
    if ((name == ".env" or name.startswith(".env.")) and name not in {".env.example", ".env.template"}) or name.endswith((".pem", ".key", ".p12", ".pfx", ".keystore", ".jks")):
        add("CREDENTIAL_FILE")
    if name.startswith(("credentials", "service-account")) and name.endswith(".json"):
        add("CREDENTIAL_FILE")
    if len(data) > LIMIT:
        add("OVERSIZE_REQUIRES_REVIEW")
        return findings
    text = data.decode("utf-8", errors="replace")
    for rule, regex in SECRETS.items():
        for match in regex.finditer(text):
            add(rule, len(text[:match.start()].encode("utf-8")))
    for regex in [NAMED_VALUE_PATTERN, ENV_VALUE_PATTERN]:
        for match in regex.finditer(text):
            if not placeholder(match[1]):
                add("EMBEDDED_CREDENTIAL_OR_BILLING_ID", len(text[:match.start()].encode("utf-8")))

    documentation = path == "data/sources.json" or path.startswith("docs/") or name in {"README.md", "AGENTS.md", "LICENSE", "NOTICE", "LICENSE.md", "NOTICE.md"}
    for match in URL.finditer(text):
        try:
            url = urlsplit(match[0]); host = url.hostname or ""
        except ValueError:
            add("INVALID_URL_REQUIRES_REVIEW"); continue
        pos = len(text[:match.start()].encode("utf-8"))
        if url.username is not None or url.password is not None:
            add("URL_CREDENTIAL", pos)
        if re.search(r"(?i)(?:[?&])(?:api[_-]?key|(?:access[_-]?)?token|secret|password|signature|x-amz-signature)=", match[0]):
            add("URL_CREDENTIAL", pos)
        local = host in {"localhost", "127.0.0.1", "::1"}
        private = host.endswith((".internal", ".local"))
        try:
            ip = ipaddress.ip_address(host)
            private = private or (not ip.is_global and not local)
        except ValueError:
            pass
        if private:
            add("PRIVATE_ENDPOINT", pos)
        reserved = host.endswith(".invalid")
        if documentation and host and host not in DOCUMENTATION_HOSTS and not local and not reserved:
            add("UNREVIEWED_DOCUMENTATION_URL", pos)
        reviewed_reference = match[0] in OFFLINE_REFERENCE_URLS.get(path, set())
        namespace = "http" + "://www.topografix.com/GPX/1/1"
        namespace_line = text.splitlines()[text[:match.start()].count("\n")].strip()
        reviewed_namespace = (path in {"packages/core/src/track-formats.ts", "dist/track-formats.js"}
                              and match[0] == namespace
                              and namespace_line in {f"const GPX_NAMESPACE = '{namespace}';", f'const GPX_NAMESPACE = "{namespace}";'})
        if host and not documentation and name not in LOCKFILES and not local and not reserved and not reviewed_reference and not reviewed_namespace:
            add("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", pos)

    if name == "package.json":
        try:
            package = json.loads(text)
            for hook in ("preinstall", "install", "postinstall", "prepare"):
                if package.get("scripts", {}).get(hook):
                    add("INSTALL_HOOK_REQUIRES_REVIEW")
            if not package.get("private") and not package.get("files"):
                add("PUBLISH_ALLOWLIST_REQUIRED")
        except (ValueError, AttributeError):
            add("INVALID_PACKAGE_JSON")
    if path.startswith(".github/workflows/") and name.endswith((".yml", ".yaml")):
        runners = re.findall(r"(?m)^\s*runs-on:\s*([^\n#]+)", text)
        if not runners or any(v.strip().strip('"\'') not in STANDARD_RUNNERS for v in runners):
            add("RUNNER_REQUIRES_REVIEW")
        if re.search(r"(?i)actions/(?:cache|upload-artifact)|\bsnapshot:|\bschedule:|\bsecrets:|secrets\.", text):
            add("WORKFLOW_COST_OR_SECRET_REQUIRES_REVIEW")
    if name in {"vercel.json", "netlify.toml", "eas.json", "wrangler.toml", "wrangler.json", "Pulumi.yaml"} or name.endswith((".tf", ".tfvars")):
        add("DEPLOYMENT_BILLING_REQUIRES_REVIEW")
    if name.endswith((".tgz", ".zip", ".apk", ".ipa", ".pmtiles", ".mbtiles")):
        add("ARCHIVE_REQUIRES_SEPARATE_AUDIT")
    return findings


def audit(root, artifacts):
    findings, counts = [], {"worktree_files": 0, "index_blobs": 0, "history_blobs": 0, "history_commits": 0}

    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)

    paths = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")
    package_count = workflow_count = 0
    for path in sorted(set(filter(None, paths))):
        file = root / path
        if file.is_symlink():
            findings.append({"scope": "worktree", "path": path, "line": 1, "rule": "SYMLINK_REQUIRES_REVIEW"}); continue
        if not file.is_file():
            continue
        counts["worktree_files"] += 1
        package_count += file.name == "package.json"
        workflow_count += path.startswith(".github/workflows/") and file.suffix in {".yml", ".yaml"}
        with file.open("rb") as stream:
            findings.extend(scan(path, stream.read(LIMIT + 1), "worktree"))

    seen = set()

    def blob(path, sha, scope):
        key = (path, sha, scope)
        if key in seen:
            return
        seen.add(key); counts[scope + "_blobs"] += 1
        if int(git("cat-file", "-s", sha)) > LIMIT:
            findings.append({"scope": scope, "path": path, "line": 1, "rule": "OVERSIZE_REQUIRES_REVIEW"})
        else:
            # History is scanned for sensitive content, not obsolete executable cost policy.
            rows = scan(path, git("cat-file", "blob", sha), scope)
            if scope == "history":
                rows = [r for r in rows if r["rule"] in set(SECRETS) | {"CREDENTIAL_FILE", "EMBEDDED_CREDENTIAL_OR_BILLING_ID", "URL_CREDENTIAL", "PRIVATE_ENDPOINT"}]
            findings.extend(rows)

    for entry in filter(None, git("ls-files", "--stage", "-z").decode().split("\0")):
        metadata, path = entry.split("\t", 1); mode, sha, stage = metadata.split()
        if mode == "100644" or mode == "100755":
            blob(path, sha, "index")
        else:
            findings.append({"scope": "index", "path": path, "line": 1, "rule": "NON_FILE_REQUIRES_REVIEW"})
    commits = git("rev-list", "--all").decode().splitlines()
    counts["history_commits"] = len(commits)
    for commit in commits:
        for entry in filter(None, git("ls-tree", "-rz", "-r", commit).decode().split("\0")):
            metadata, path = entry.split("\t", 1); mode, kind, sha = metadata.split()
            if kind == "blob":
                blob(path, sha, "history")

    artifact_results = []
    for path in artifacts:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        members, total = 0, 0
        with tarfile.open(path, "r:gz") as archive:
            for member in archive:
                members += 1; total += max(member.size, 0)
                member_path = PurePosixPath(member.name)
                if members > 10000 or total > 64 * 1024 * 1024:
                    raise ValueError("Artifact exceeds audit bounds; manual review required")
                if member_path.is_absolute() or ".." in member_path.parts or not (member.isfile() or member.isdir()):
                    findings.append({"scope": "artifact", "path": member.name, "line": 1, "rule": "UNSAFE_ARCHIVE_MEMBER"}); continue
                if member.isfile():
                    file = archive.extractfile(member)
                    normalized = member.name.removeprefix("package/")
                    findings.extend(scan(normalized, file.read(LIMIT + 1), "artifact"))
        artifact_results.append({"file": path.name, "sha256": digest.hexdigest(), "members": members})

    unique = {json.dumps(row, sort_keys=True): row for row in findings}
    return {
        "status": "FAIL" if unique else "PASS_STATIC_ONLY",
        "runtime_verified": False,
        "scope": "worktree + index + blobs reachable from locally available Git refs; not reflogs, deleted refs or remote-only refs",
        "history_shallow": git("rev-parse", "--is-shallow-repository").decode().strip() == "true",
        "counts": counts, "package_manifests": package_count, "workflows": workflow_count,
        "artifacts": artifact_results,
        "findings": list(unique.values()),
        "limitations": "Heuristic scan; dynamic/encoded URLs, arbitrary secrets, remote account billing and actual network traffic require separate audit. Ignored local files are excluded unless tracked/indexed/history/artifact.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--artifact", type=Path, action="append", default=[], help="Audit an already-built npm .tgz without extracting or executing it")
    args = parser.parse_args()
    try:
        result = audit(args.root.resolve(), args.artifact)
    except (OSError, ValueError, tarfile.TarError, subprocess.CalledProcessError):
        print(json.dumps({"status": "FAIL", "runtime_verified": False, "error": "Audit could not complete; inspect inputs locally. No sensitive content printed."}))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
