"""Tests for the daily-publishing and verification tools."""

from __future__ import annotations

import io
from contextlib import redirect_stdout
from datetime import date, timedelta
from pathlib import Path

from tools import publish, verify


class TestPublishWindow:
    def test_existing_dates_are_skipped(self, tmp_path: Path) -> None:
        today = date.today()
        existing = today.isoformat()
        (tmp_path / f"{existing}.json").write_text("{}", encoding="utf-8")

        lines = "\n".join(_run_publish(tmp_path, today, 1))

        assert f"skip   {existing} (already published)" in lines
        assert f"publish {(today + timedelta(days=1)).isoformat()}" in lines
        assert sorted(p.name for p in tmp_path.glob("*.json")) == [f"{existing}.json"]

    def test_empty_directory_starts_today(self, tmp_path: Path) -> None:
        today = date.today()

        lines = "\n".join(_run_publish(tmp_path, None, 1))

        assert lines.count("publish ") == 2
        assert today.isoformat() in lines
        assert (tmp_path / f"{today.isoformat()}.json").exists() is False


class TestVerify:
    def test_flags_a_broken_puzzle_file(self, tmp_path: Path) -> None:
        (tmp_path / "2026-05-11.json").write_text("{not json", encoding="utf-8")

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 1

    def test_skips_non_date_files(self, tmp_path: Path) -> None:
        (tmp_path / "notes.txt").write_text("hi", encoding="utf-8")

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 0
        assert "0 puzzles verified" in _capture_verify(tmp_path)


def _run_publish(out_dir: Path, start: date | None, lead: int) -> list[str]:

    args = ["--out", str(out_dir), "--dry-run", "--lead", str(lead)]
    if start is not None:
        args += ["--start", start.isoformat()]
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        exit_code = publish.main(args)
    assert exit_code == 0
    return buffer.getvalue().splitlines()


def _capture_verify(out_dir: Path) -> str:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        verify.main(["--dir", str(out_dir)])
    return buffer.getvalue()
