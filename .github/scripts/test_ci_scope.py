"""Exercise CI routing against real Git changes, including removed and renamed inputs."""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("ci_scope.py").resolve()


class CIScopeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.repo = Path(temporary.name)
        self.git("init", "-q", "-b", "main")
        self.write("engine/core.py")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.check_output(
            [
                "git",
                "-c",
                "user.name=CI",
                "-c",
                "user.email=ci@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "core.hooksPath=/dev/null",
                *args,
            ],
            cwd=self.repo,
            text=True,
        ).strip()

    def write(self, name):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture\n")

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-qm", "fixture")
        return self.git("rev-parse", "HEAD")

    def scope(self, event="pull_request", base=None):
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=self.repo,
            capture_output=True,
            check=False,
            text=True,
            env={
                **os.environ,
                "GITHUB_EVENT_NAME": event,
                "BASE_SHA": self.base if base is None else base,
                "HEAD_SHA": self.git("rev-parse", "HEAD"),
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_frontend_and_documentation_skip_engine(self):
        for path in [
            "app/src/App.css",
            "app/src/lib/puzzles.ts",
            "app/package-lock.json",
            "docs/notes.md",
            "README.md",
        ]:
            self.write(path)
        self.commit()
        self.assertEqual(self.scope(), "engine=false")

    def test_shared_content_engine_workflow_and_unknown_changes_require_engine(self):
        for path in [
            "schema/puzzle.schema.json",
            "conformance/case.json",
            "app/public/puzzles/day.json",
            "engine/core.py",
            ".github/workflows/ci.yml",
            "unknown.toml",
        ]:
            with self.subTest(path=path):
                self.base = self.git("rev-parse", "HEAD")
                self.write(path)
                if path == "engine/core.py":
                    (self.repo / path).write_text("changed\n")
                self.commit()
                self.assertEqual(self.scope(), "engine=true")

    def test_isolated_leaderboard_backend_skips_puzzle_engine(self):
        self.write("backend/leaderboard/migrations/001_leaderboards.sql")
        self.commit()
        self.assertEqual(self.scope(), "engine=false")
        self.assertEqual(self.scope(event="push"), "engine=true")

    def test_removed_or_renamed_engine_inputs_cannot_hide_under_app(self):
        (self.repo / "app").mkdir()
        self.git("mv", "engine/core.py", "app/core.py")
        self.commit()
        self.assertEqual(self.scope(), "engine=true")

    def test_pr_checks_all_commits_and_the_tested_merge(self):
        self.write("engine/second.py")
        self.commit()
        self.write("app/App.css")
        self.commit()
        self.assertEqual(self.scope(), "engine=true")
        self.git("checkout", "-qb", "feature", self.base)
        self.write("app/feature.ts")
        self.commit()
        self.git("checkout", "-q", "main")
        self.base = self.git("rev-parse", "HEAD")
        self.git("merge", "--no-ff", "-qm", "merge", "feature")
        self.assertEqual(self.scope(), "engine=false")

    def test_main_push_keeps_full_validation_even_after_frontend_only_changes(self):
        self.write("app/App.css")
        self.commit()
        self.assertEqual(self.scope(event="push"), "engine=true")

    def test_manual_unknown_events_and_missing_history_run_full_checks(self):
        for event, base in [
            ("workflow_dispatch", self.base),
            ("schedule", self.base),
            ("push", "0" * 40),
            ("push", ""),
            ("pull_request", "missing"),
        ]:
            with self.subTest(event=event, base=base):
                self.assertEqual(self.scope(event=event, base=base), "engine=true")


if __name__ == "__main__":
    unittest.main()
