import io
import json
import os
from pathlib import Path
import tempfile
import textwrap
import unittest
from unittest.mock import patch
from urllib.parse import urlparse

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/deploy-paradev-staging.yml"
SOURCE = WORKFLOW.read_text()
GUARD = textwrap.dedent(SOURCE.split("<<'PYTHON'\n", 1)[1].split("          PYTHON", 1)[0])
TARGETS = (
    ("API", "prj_MmAnFWXbST3HSeLr313KNqZ00Pve", "api-paradev", "api.stage.paradev.com", "apps/api"),
    ("WEB", "prj_7XZEFgKHMki81K1bTCl0JCG4lToQ", "web-paradev", "app.stage.paradev.com", "apps/web"),
)


class GuardTest(unittest.TestCase):
    def run_guard(self, mode, command, mismatch=False, variable_mismatch=False):
        calls = []
        aliases = {}

        def request(req, timeout):
            path = urlparse(req.full_url).path
            calls.append((req.get_method(), path))
            for kind, project, name, host, root in TARGETS:
                if path == f"/v9/projects/{project}":
                    return io.BytesIO(json.dumps(dict(id=project, name="wrong" if mismatch else name, accountId="team", rootDirectory=root)).encode())
                if path == f"/v9/projects/{project}/domains/{host}":
                    self.assertEqual(mode, "stage", "Final preparation must not require domain ownership")
                    return io.BytesIO(json.dumps(dict(name=host, verified=True)).encode())
                if path == f"/v13/deployments/{kind.lower()}.vercel.app":
                    return io.BytesIO(json.dumps(dict(id=f"dpl_{kind}", projectId=project, readyState="READY", target="production")).encode())
                if path == f"/v4/aliases/{host}":
                    return io.BytesIO(json.dumps(dict(projectId=project, deploymentId=aliases.get(host, "old"))).encode())
                if path == f"/v2/deployments/dpl_{kind}/aliases":
                    aliases[host] = f"dpl_{kind}"
                    return io.BytesIO(b"{}")
            self.fail(f"Unexpected request {path}")

        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory, "summary")
            for kind, *_ in TARGETS:
                Path(directory, f"paradev-{kind.lower()}-url").write_text(f"https://{kind.lower()}.vercel.app")
            env = dict(DEPLOY_MODE=mode, VERCEL_TOKEN="fake", VERCEL_ORG_ID="team", RUNNER_TEMP=directory, GITHUB_SHA="reviewed-sha", GITHUB_STEP_SUMMARY=str(summary))
            env.update({f"VERCEL_PARADEV_{kind}_PROJECT_ID": "wrong" if variable_mismatch else project for kind, project, *_ in TARGETS})
            with patch.dict(os.environ, env, clear=True), patch("sys.argv", ["guard", command]), patch("urllib.request.urlopen", request):
                try:
                    exec(compile(GUARD, "guard", "exec"), {})
                except SystemExit as error:
                    if error.code not in (0, None):
                        return calls, str(error), ""
            return calls, None, summary.read_text() if summary.exists() else ""

    def test_final_report_has_only_ids_urls_sha_and_no_domain_requests_or_writes(self):
        calls, error, summary = self.run_guard("prepare-final", "report")
        self.assertIsNone(error)
        self.assertTrue(all(method == "GET" and "/domains/" not in path and "/aliases" not in path for method, path in calls))
        self.assertEqual(summary, "API: dpl_API https://api.vercel.app\n\nWEB: dpl_WEB https://web.vercel.app\n\nCommit: reviewed-sha\n")

    def test_final_cannot_assign_alias_even_with_wrong_command(self):
        calls, error, _ = self.run_guard("prepare-final", "alias")
        self.assertEqual(calls, [])
        self.assertIn("cannot assign aliases", error)

    def test_stage_still_checks_ownership_and_assigns_both_stage_aliases(self):
        calls, error, _ = self.run_guard("stage", "alias")
        self.assertIsNone(error)
        self.assertEqual(sum(method == "POST" for method, _ in calls), 2)
        for _, project, _, host, _ in TARGETS:
            self.assertIn(("GET", f"/v9/projects/{project}/domains/{host}"), calls)

    def test_project_mismatch_stops_preparation_before_deployment(self):
        for mode in ("stage", "prepare-final"):
            for variable_mismatch in (False, True):
                calls, error, _ = self.run_guard(mode, "check", mismatch=True, variable_mismatch=variable_mismatch)
                self.assertIsNotNone(error)
                self.assertFalse(any("deployments" in path or method != "GET" for method, path in calls))

    def test_fixed_modes_static_env_and_skip_domain(self):
        self.assertIn("default: stage\n        options:\n          - stage\n          - prepare-final", SOURCE)
        self.assertEqual(SOURCE.count("vercel deploy --prod --skip-domain"), 2)
        self.assertEqual(SOURCE.count("DOMAIN_MOVE_ENABLED: \"false\""), 2)
        for var, final, stage, count in (
            ("BROWSER_API_URL", "https://api.paradev.com", "https://api.stage.paradev.com", 2),
            ("NEXT_PUBLIC_API_URL", "https://api.paradev.com", "https://api.stage.paradev.com", 1),
            ("NEXT_PUBLIC_WEB_URL", "https://app.paradev.com", "https://app.stage.paradev.com", 2),
            ("NEXT_PUBLIC_COOKIE_DOMAIN", "paradev.com", "stage.paradev.com", 2),
        ):
            self.assertEqual(SOURCE.count(f"{var}: ${{{{ inputs.mode == 'prepare-final' && '{final}' || '{stage}' }}}}"), count)
        self.assertIn("NEXT_PUBLIC_API_URL: https://api.superset.sh", SOURCE)
        self.assertIn("if: inputs.mode == 'stage'", SOURCE)
        self.assertIn("if: inputs.mode == 'prepare-final'", SOURCE)
        self.assertNotIn("db:migrate", SOURCE)
        self.assertNotIn("wrangler deploy", SOURCE)
        self.assertNotIn("vercel alias", SOURCE)


if __name__ == "__main__":
    unittest.main()
