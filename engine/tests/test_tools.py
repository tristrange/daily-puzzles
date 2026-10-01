"""Tests for the daily-publishing and verification tools."""

from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from datetime import date, timedelta
from pathlib import Path

from tools import publish, verify

from queens_engine import PuzzleType, parse_puzzle


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

        # Two puzzles for today and two for tomorrow's lead day.
        assert lines.count("publish ") == 4
        assert today.isoformat() in lines
        assert (tmp_path / f"{today.isoformat()}.json").exists() is False

    def test_a_day_is_skipped_per_puzzle_not_wholesale(self, tmp_path: Path) -> None:
        """A committed Queens board must not stop its Star Battle companion
        from being filled in, which is what makes this safe to run against a
        directory that was published before companions existed."""
        today = date.today()
        queens = today.isoformat()
        (tmp_path / f"{queens}.json").write_text("{}", encoding="utf-8")

        lines = "\n".join(_run_publish(tmp_path, today, 0))

        assert f"skip   {queens} (already published)" in lines
        assert f"publish {queens}-star" in lines

    def test_publishes_both_puzzles_of_a_day(self, tmp_path: Path) -> None:
        today = date.today()

        _run_publish(tmp_path, today, 0, dry_run=False)

        queens = json.loads((tmp_path / f"{today.isoformat()}.json").read_text(encoding="utf-8"))
        star = json.loads((tmp_path / f"{today.isoformat()}-star.json").read_text(encoding="utf-8"))
        assert queens["type"] == "queens"
        assert queens["id"] == today.isoformat()
        assert star["type"] == "star-battle"
        # The companion's id carries the suffix, so a solve recorded against one
        # of the day cannot be taken as a solve of the other.
        assert star["id"] == f"{today.isoformat()}-star"
        assert parse_puzzle(star).board.puzzle_type is PuzzleType.STAR_BATTLE

    def test_star_boards_report_no_difficulty(self, tmp_path: Path) -> None:
        """A star board is unique but not logic-gated, so it has no score to
        report; printing one would mean something weaker than the same number on
        a Queens board."""
        today = date.today()

        lines = _run_publish(tmp_path, today, 0, dry_run=False)

        scored = [line for line in lines if " score " in line]
        unrated = [line for line in lines if "(unique, not logic-gated)" in line]
        assert len(scored) == 1
        assert len(unrated) == 1
        assert "score" not in unrated[0]

    def test_rerunning_publishes_nothing_new(self, tmp_path: Path) -> None:
        today = date.today()

        _run_publish(tmp_path, today, 0, dry_run=False)
        before = {p.name: p.read_text(encoding="utf-8") for p in tmp_path.glob("*.json")}
        # No --start, so the window resumes after the last committed day, which
        # is past the lead horizon: there is nothing left to do.
        again = _run_publish(tmp_path, None, 0, dry_run=False)

        assert "publish " not in "\n".join(again)
        after = {p.name: p.read_text(encoding="utf-8") for p in tmp_path.glob("*.json")}
        assert after == before

    def test_resumes_at_the_half_published_day_rather_than_past_it(self, tmp_path: Path) -> None:
        # The scheduled run passes no --start. If the newest committed day has
        # only one of its two puzzles, resuming after the newest day steps over
        # the gap and the missing companion is never filled in.
        today = date.today()
        yesterday = today - timedelta(days=1)
        _run_publish(tmp_path, yesterday, 0, dry_run=False)
        # A run that died between the day's two puzzles.
        (tmp_path / f"{today.isoformat()}-star.json").unlink()

        lines = _run_publish(tmp_path, None, 0, dry_run=False)

        # Exactly the one file that was missing, and nothing else touched.
        assert [line for line in lines if line.startswith("publish ")] == [
            f"publish {today.isoformat()}-star"
        ]
        assert (tmp_path / f"{today.isoformat()}-star.json").exists()
        assert (tmp_path / f"{today.isoformat()}.json").exists()

    def test_rerun_resumes_from_the_last_committed_day(self, tmp_path: Path) -> None:
        today = date.today()
        _run_publish(tmp_path, today, 0, dry_run=False)

        lines = _run_publish(tmp_path, None, 3, dry_run=True)

        queued = [line for line in lines if line.startswith("publish ")]
        # Nothing is republished, and the window picks up at the day after,
        # offering each day's two puzzles together.
        assert queued == [
            f"publish {(today + timedelta(days=offset)).isoformat()}{suffix} (dry run)"
            for offset in (1, 2, 3)
            for suffix in ("", "-star")
        ]


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


def _run_publish(
    out_dir: Path, start: date | None, lead: int, *, dry_run: bool = True
) -> list[str]:

    args = ["--out", str(out_dir), "--lead", str(lead)]
    if dry_run:
        args.append("--dry-run")
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
