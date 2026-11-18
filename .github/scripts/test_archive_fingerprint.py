"""Exercise the archive cache key against worktrees before and after publishing."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from archive_fingerprint import fingerprint


class ArchiveFingerprintTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.repo = Path(temporary.name)
        self.git("init", "-q")
        self.write("app/public/puzzles/2026-11-20.json")
        self.write("engine/src/queens_engine/generator.py")
        self.git("add", ".")

    def git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True)

    def write(self, name, content="fixture\n"):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_new_untracked_puzzle_changes_key_but_staging_does_not(self):
        original = fingerprint(self.repo)
        self.write("app/public/puzzles/2026-11-21.json")
        published = fingerprint(self.repo)
        self.assertNotEqual(published, original)
        self.git("add", ".")
        self.assertEqual(fingerprint(self.repo), published)

    def test_renaming_an_identical_puzzle_changes_key(self):
        original = fingerprint(self.repo)
        self.git("mv", "app/public/puzzles/2026-11-20.json", "app/public/puzzles/2026-11-21.json")
        self.assertNotEqual(fingerprint(self.repo), original)

    def test_verifier_inputs_change_key(self):
        for path in (
            "app/public/puzzles/2026-11-20.json",
            "engine/src/queens_engine/generator.py",
            "engine/src/queens_engine/data/vocabulary.txt",
            "engine/tools/verify.py",
            "engine/sitecustomize.py",
            "engine/uv.lock",
            "engine/.python-version",
            "schema/puzzle.schema.json",
            "conformance/id-cases/manifest.json",
            ".github/actions/verify-archive/action.yml",
        ):
            with self.subTest(path=path):
                previous = fingerprint(self.repo)
                self.write(path, "changed\n")
                self.assertNotEqual(fingerprint(self.repo), previous)

    def test_unrelated_app_changes_do_not_change_key(self):
        original = fingerprint(self.repo)
        self.write("app/src/App.css")
        self.write("engine/tests/fixtures/hint-baseline.json")
        self.git("add", ".")
        self.assertEqual(fingerprint(self.repo), original)

    def test_runner_and_uv_changes_change_key(self):
        with patch.dict(os.environ, {"ImageVersion": "1", "ARCHIVE_UV_VERSION": "1"}):
            original = fingerprint(self.repo)
        with patch.dict(os.environ, {"ImageVersion": "2", "ARCHIVE_UV_VERSION": "1"}):
            self.assertNotEqual(fingerprint(self.repo), original)
        with patch.dict(os.environ, {"ImageVersion": "1", "ARCHIVE_UV_VERSION": "2"}):
            self.assertNotEqual(fingerprint(self.repo), original)
