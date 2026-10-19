#!/usr/bin/env python3
"""Black-box regression scenarios; temporary repos, synthetic secrets, no network."""
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

AUDITOR = Path(__file__).with_name("audit-cost-security.py")


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

    def test_clean_local_fixture_and_public_documentation(self):
        self.write("README.md", "Reference: https://" + "maplibre.org/maplibre-gl-js/docs/\n")
        self.write("src/fixture.ts", 'export const local = "http://127.0.0.1:8080/tiles";\n')
        process, report, _ = self.run_audit()
        self.assertEqual(process.returncode, 0)
        self.assertEqual(report["status"], "PASS_STATIC_ONLY")
        self.assertFalse(report["runtime_verified"])

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
