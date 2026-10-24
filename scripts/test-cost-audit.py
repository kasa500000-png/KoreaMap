#!/usr/bin/env python3
"""Black-box regression scenarios; temporary repos, synthetic secrets, no network."""
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

AUDITOR = Path(__file__).with_name("audit-cost-security.py")
SPEC = importlib.util.spec_from_file_location("cost_auditor", AUDITOR)
auditor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(auditor)


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Audit Test")
        self.git("config", "user.email", "audit@example.invalid")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], stderr=subprocess.DEVNULL)

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def run_audit(self, *args):
        process = subprocess.run([sys.executable, str(AUDITOR), "--root", str(self.root), *args], text=True, capture_output=True)
        self.assertNotEqual(process.returncode, 2, process.stdout)
        report = json.loads(process.stdout)
        return process, report, {f["rule"] for f in report["findings"]}

    def test_batch_reader_preserves_exact_binary_empty_and_size_boundary(self):
        payloads = [b"", b"first\n\x00binary\xff\nlast", b"x" * auditor.LIMIT,
                    b"x" * (auditor.LIMIT + 1)]
        hashes = [subprocess.check_output(
            ["git", "-C", str(self.root), "hash-object", "-w", "--stdin"], input=data,
        ).decode().strip() for data in payloads]
        with auditor.GitBlobReader(self.root) as reader:
            processes = list(reader.processes)
            self.assertEqual(len(processes), 2)
            for sha, data in zip(hashes, payloads):
                self.assertEqual(reader.read(sha), data if len(data) <= auditor.LIMIT else None)
            self.assertEqual(reader.read(hashes[1]), payloads[1])
        self.assertTrue(all(p.poll() == 0 for p in processes))

    def test_batch_reader_missing_object_fails_and_reaps_children(self):
        reader = auditor.GitBlobReader(self.root)
        processes = list(reader.processes)
        with self.assertRaisesRegex(ValueError, "Invalid Git object response"):
            with reader:
                reader.read("0" * 40)
        self.assertTrue(all(p.poll() is not None for p in processes))
        self.assertTrue(all(p.stdin.closed and p.stdout.closed for p in processes))

    def test_batch_protocol_rejects_bad_headers_truncation_and_delimiters(self):
        sha = "a" * 40
        valid = sha.encode() + b" blob 3\n"
        for header in [b"", b"private-test-value\n", b"b" * 40 + b" blob 3\n",
                       sha.encode() + b" tree 3\n", sha.encode() + b" blob -1\n",
                       sha.encode() + b" blob 3", b"x" * 300]:
            with self.subTest(header_length=len(header)):
                process = SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(header))
                with self.assertRaises(ValueError):
                    auditor.GitBlobReader.header(process, sha)
        for body in [valid + b"ab", valid + b"abcX", sha.encode() + b" blob 4\nabcd\n"]:
            reader = object.__new__(auditor.GitBlobReader)
            reader.processes = [
                SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(valid)),
                SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(body)),
            ]
            with self.assertRaises(ValueError):
                reader.read(sha)
        process = SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(valid))
        with self.assertRaises(ValueError):
            auditor.GitBlobReader.header(process, sha + "\nHEAD")
        self.assertEqual(process.stdin.getvalue(), b"")
        body_process = SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO())
        reader = object.__new__(auditor.GitBlobReader)
        reader.processes = [SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(
            sha.encode() + b" blob " + str(auditor.LIMIT + 1).encode() + b"\n",
        )), body_process]
        self.assertIsNone(reader.read(sha))
        self.assertEqual(body_process.stdin.getvalue(), b"")

    def test_batch_reader_process_failure_cannot_report_success(self):
        process = SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(), wait=lambda timeout: 1)
        reader = object.__new__(auditor.GitBlobReader)
        reader.processes = [process]
        with self.assertRaisesRegex(ValueError, "did not complete"):
            reader.close()
        self.assertTrue(process.stdin.closed and process.stdout.closed)

    def test_batch_and_legacy_audits_match_paths_scopes_history_and_findings(self):
        # Identical blob bytes must still be evaluated under each path and scope.
        content = "https:" + "//maplibre.org/\n"
        self.write("docs/reference.md", content)
        self.write("src/provider.ts", content)
        self.write("removed.txt", "pass" + "word=" + '"synthetic-history-value"\n')
        self.git("add", ".")
        self.git("commit", "-qm", "synthetic baseline")
        self.git("rm", "removed.txt")
        self.git("commit", "-qm", "remove synthetic value")
        self.write("src/provider.ts", "local replacement\n")
        root = self.root

        class LegacyReader:
            def __init__(self, directory):
                self.directory = directory

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self, sha):
                command = ["git", "-C", str(root), "cat-file"]
                if int(subprocess.check_output([*command, "-s", sha])) > auditor.LIMIT:
                    return None
                return subprocess.check_output([*command, "blob", sha])

        actual = auditor.audit(self.root, [])
        with patch.object(auditor, "GitBlobReader", LegacyReader):
            expected = auditor.audit(self.root, [])
        self.assertEqual(actual, expected)
        self.assertTrue(any(f["path"] == "removed.txt" and f["scope"] == "history"
                            for f in actual["findings"]))
        self.assertTrue(any(f["path"] == "src/provider.ts" and f["scope"] == "index"
                            for f in actual["findings"]))

    def test_clean_local_fixture_and_public_documentation(self):
        self.write("README.md", "Reference: https://" + "maplibre.org/maplibre-gl-js/docs/\n")
        self.write("src/fixture.ts", 'export const local = "http://127.0.0.1:8080/tiles";\n')
        process, report, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.assertEqual(report["status"], "PASS_STATIC_ONLY")
        self.assertFalse(report["runtime_verified"])

    def test_repository_metadata_does_not_exempt_runtime_script_urls(self):
        repo = "https:" + "//github.com/kasa500000-png/KoreaMap"
        package = {"private": True, "homepage": repo, "bugs": {"url": repo + "/issues"},
                   "repository": {"type": "git", "url": repo + ".git", "directory": "packages/core"}}
        self.write("package.json", json.dumps(package, indent=2))
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        package["scripts"] = {"demo": "curl " + repo}
        self.write("package.json", json.dumps(package, indent=2))
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
        package.pop("scripts")
        package["other"] = {"url": repo + "/issues"}
        self.write("package.json", json.dumps(package, indent=2))
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)

    def test_android_sdk_docs_are_not_a_runtime_provider(self):
        self.write("docs/native.md", "https://" + "developer.android.com/studio\n")
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write("src/provider.ts", 'const url = "https://' + 'developer.android.com/studio";\n')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)

    def test_metadata_line_endings_preserve_runtime_url_rejection_and_line_numbers(self):
        repo = "https:" + "//github.com/kasa500000-png/KoreaMap"
        for newline in ["\n", "\r\n"]:
            with self.subTest(newline=repr(newline)):
                package = {"private": True, "bugs": {"url": repo + "/issues"}}
                target = self.root / "package.json"
                target.write_bytes(json.dumps(package, indent=2).replace("\n", newline).encode("utf-8"))
                process, _, _ = self.run_audit()
                self.assertEqual(process.returncode, 0)
                package["scripts"] = {"demo": "curl " + repo}
                text = json.dumps(package, indent=2)
                target.write_bytes(text.replace("\n", newline).encode("utf-8"))
                process, report, rules = self.run_audit()
                self.assertEqual(process.returncode, 1)
                self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
                findings = [f for f in report["findings"] if f["rule"] == "EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW"]
                self.assertEqual(len(findings), 1)
                self.assertEqual(findings[0]["line"], text[:text.index("curl ")].count("\n") + 1)

    def test_official_type_reference_docs_do_not_authorize_runtime_requests(self):
        for host in ['www.typescriptlang.org', 'reactnative.dev', 'playwright.dev', 'deb.debian.org', 'docs.oracle.com', 'www.naturalearthdata.com']:
            self.write('docs/types.md', 'https://' + host + '/docs/\n')
            self.write('packages/core/src/provider.ts', '')
            process, _, _ = self.run_audit()
            self.assertEqual(process.returncode, 0)
            self.write('packages/core/src/provider.ts', 'const endpoint = "https://' + host + '/docs/";\n')
            _, _, rules = self.run_audit()
            self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)

    def test_operator_download_exception_is_exact_and_private(self):
        url = "https" + "://download.geofabrik.de/asia/south-korea-latest.osm.pbf"
        self.write("services/tiles/src/pipeline.ts", 'const url = "' + url + '";\n')
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write("packages/core/src/remote.ts", 'const url = "' + url + '";\n')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
        self.write("packages/core/src/remote.ts", '')
        self.write("services/tiles/src/pipeline.ts", 'const url = "' + url + '?key=x";\n')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)

    def test_official_poi_probe_review_is_exact_private_and_not_a_sdk_provider(self):
        base = "https" + "://www.data.go.kr/data/"
        for source_id in ["3077854", "15045050", "15088391"]:
            url = base + source_id + "/fileData.do"
            self.write("packages/core/src/remote.ts", '')
            self.write("scripts/verify-real-poi.mjs", 'const url = "' + url + '";\n')
            process, _, _ = self.run_audit()
            self.assertEqual(process.returncode, 0)
            self.write("packages/core/src/remote.ts", 'const url = "' + url + '";\n')
            _, _, rules = self.run_audit()
            self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
            self.write("packages/core/src/remote.ts", '')
            for unreviewed in [url + '?limit=1', base + "99999999/fileData.do"]:
                self.write("scripts/verify-real-poi.mjs", 'const url = "' + unreviewed + '";\n')
                _, _, rules = self.run_audit()
                self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)

    def test_attribution_anchor_exception_cannot_enable_a_sdk_endpoint(self):
        url = "https" + "://www.openstreetmap.org/copyright"
        self.write("services/tiles/src/config.ts", '<a href="' + url + '">OSM</a>')
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write("packages/core/src/remote.ts", 'const url = "' + url + '";')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)

    def test_native_registry_preparation_review_never_authorizes_a_sdk_or_other_registry(self):
        registry = "https" + "://registry.npmjs.org/"
        files = ["scripts/verify-native-consumer.mjs", "tests/native-consumer.test.mjs"]
        for file in files:
            self.write(file, 'const registry = "' + registry + '";\n')
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write("packages/native/src/remote.ts", 'const registry = "' + registry + '";\n')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
        self.write("packages/native/src/remote.ts", '')
        for file in files:
            for unreviewed in [registry + 'unreviewed-path', registry + '?token=x', 'https' + '://publisher.test-domain.org/']:
                self.write(file, 'const registry = "' + unreviewed + '";\n')
                _, _, rules = self.run_audit()
                self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
            self.write(file, 'const registry = "' + registry + '";\n')

    def test_synthetic_token_is_detected_without_printing_value(self):
        sentinel = "gh" + "p_" + "a" * 36
        self.write("src/config.ts", 'export const value = "' + sentinel + '";\n')
        process, _, rules = self.run_audit()
        self.assertEqual(process.returncode, 1)
        self.assertIn("GITHUB_TOKEN", rules)
        self.assertNotIn(sentinel, process.stdout + process.stderr)

    def test_embedded_endpoint_and_private_url(self):
        self.write("src/provider.ts", 'export const url = "https://' + 'publisher.test-domain.org/tiles";\n')
        self.write("docs/note.md", 'http://' + '10.2.3.4/private\n')
        _, _, rules = self.run_audit()
        self.assertIn("EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW", rules)
        self.assertIn("PRIVATE_ENDPOINT", rules)

    def test_deleted_secret_in_reachable_history_is_detected(self):
        self.write(".env", ('API_' + 'SECRET') + '=' + 'synthetic-only-not-real\n')
        self.git("add", ".env"); self.git("commit", "-qm", "fixture")
        self.git("rm", "-q", ".env"); self.git("commit", "-qm", "remove fixture")
        _, report, rules = self.run_audit()
        self.assertIn("CREDENTIAL_FILE", rules)
        self.assertTrue(any(row["scope"] == "history" for row in report["findings"]))

    def test_database_connection_credentials_are_detected_without_leak(self):
        sentinel = "postgresql://" + "fixture:synthetic-only@" + "10.2.3.4/database"
        self.write("src/database.json", json.dumps({"url": sentinel}))
        process, _, rules = self.run_audit()
        self.assertIn("URL_CREDENTIAL", rules)
        self.assertIn("PRIVATE_ENDPOINT", rules)
        self.assertNotIn(sentinel, process.stdout + process.stderr)

    def test_staged_secret_not_hidden_by_clean_worktree_copy(self):
        self.write("settings.json", json.dumps({"api" + "Key": "synthetic-only-not-real"}))
        self.git("add", "settings.json")
        self.write("settings.json", "{}\n")
        _, report, rules = self.run_audit()
        self.assertIn("EMBEDDED_CREDENTIAL_OR_BILLING_ID", rules)
        self.assertTrue(any(row["scope"] == "index" for row in report["findings"]))

    def test_paid_runner_cache_and_install_hooks(self):
        self.write(".github/workflows/build.yml", "jobs:\n  build:\n    runs-on: macos-latest-xlarge\n    steps:\n      - uses: actions/cache@v4\n")
        self.write("package.json", json.dumps({"name": "audit-fixture", "scripts": {"postinstall": "node download.js"}}))
        _, _, rules = self.run_audit()
        for rule in ["RUNNER_REQUIRES_REVIEW", "WORKFLOW_COST_OR_SECRET_REQUIRES_REVIEW", "INSTALL_HOOK_REQUIRES_REVIEW", "PUBLISH_ALLOWLIST_REQUIRED"]:
            self.assertIn(rule, rules)

    def test_plain_standard_runner_has_no_static_cost_flag(self):
        self.write(".github/workflows/check.yml", "jobs:\n  check:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: python3 scripts/check-design.py\n")
        process, report, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.assertEqual(report["workflows"], 1)
        self.assertFalse(report["runtime_verified"])

    def test_npm_archive_scanned_without_extraction(self):
        artifact = self.root / "fixture.tgz"
        self.write(".gitignore", "*.tgz\n")
        with tarfile.open(artifact, "w:gz") as archive:
            payload = b'{"name":"fixture","files":["index.js"]}'
            info = tarfile.TarInfo("package/package.json"); info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
            payload = (b"API_" + b"SECRET") + b"=" + b"synthetic-only-not-real"
            info = tarfile.TarInfo("package/.env"); info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
        _, report, rules = self.run_audit("--artifact", str(artifact))
        self.assertIn("CREDENTIAL_FILE", rules)
        self.assertEqual(len(report["artifacts"]), 1)
        self.assertFalse((self.root / "package").exists())

    def test_archive_traversal_is_rejected(self):
        artifact = self.root / "fixture.tgz"
        self.write(".gitignore", "*.tgz\n")
        with tarfile.open(artifact, "w:gz") as archive:
            info = tarfile.TarInfo("../outside"); info.size = 1
            archive.addfile(info, io.BytesIO(b"x"))
        _, _, rules = self.run_audit("--artifact", str(artifact))
        self.assertIn("UNSAFE_ARCHIVE_MEMBER", rules)

    def test_font_license_documentation_does_not_allow_runtime_endpoints(self):
        url = 'https' + '://' + 'openfontlicense.org/ofl-faq/'
        self.write('docs/font-license.md', url + '\n')
        process, _, rules = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write('packages/styles/src/unreviewed.ts', 'const url = "' + url + '";\n')
        _, _, rules = self.run_audit()
        self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)

    def test_billing_settings_require_review(self):
        self.write("eas.json", "{}\n")
        _, _, rules = self.run_audit()
        self.assertIn("DEPLOYMENT_BILLING_REQUIRES_REVIEW", rules)

    def test_sql_documentation_does_not_enable_sdk_network(self):
        url = 'https' + '://' + 'www.postgresql.org/docs/18/pgtrgm.html'
        self.write('docs/search.md', url + '\n')
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write('packages/core/src/remote.ts', 'const url = "' + url + '";\n')
        _, _, rules = self.run_audit()
        self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)

    def test_gpx_namespace_is_only_a_scoped_identifier_not_an_endpoint_exception(self):
        uri = 'http' + '://' + 'www.topografix.com/GPX/1/1'
        self.write('packages/core/src/track-formats.ts', "const GPX_NAMESPACE = '" + uri + "';\n")
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write('packages/core/src/track-formats.ts', "fetch('" + uri + "');\n")
        _, _, rules = self.run_audit()
        self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)
        self.write('packages/core/src/track-formats.ts', '')
        self.write('packages/core/src/unreviewed.ts', "const GPX_NAMESPACE = '" + uri + "';\n")
        _, _, rules = self.run_audit()
        self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)

    def test_parser_documentation_does_not_enable_sdk_network(self):
        url = 'https' + '://' + 'csv.js.org/parse/options/'
        self.write('docs/parser.md', url + '\n')
        process, _, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.write('packages/data-adapters/src/remote.ts', 'const url = "' + url + '";\n')
        _, _, rules = self.run_audit()
        self.assertIn('EMBEDDED_EXTERNAL_URL_REQUIRES_REVIEW', rules)


if __name__ == "__main__":
    unittest.main()
