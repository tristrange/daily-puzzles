"""Tests for the daily-publishing and verification tools."""

from __future__ import annotations

import io
import json
from collections.abc import Generator
from contextlib import contextmanager, redirect_stdout
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from tools import publish, verify
from tools.generate import seed_from_date

from queens_engine import (
    MIN_LEVEL,
    RAMP_ATTEMPTS,
    RAMP_START,
    DifficultyTarget,
    GenerationConfig,
    PuzzleType,
    dumps_puzzle,
    generate_puzzle,
    generate_ramped,
    parse_puzzle,
)

#: The board size windowing tests publish at. 5x5 is the fastest thing the
#: generator makes and none of these tests care about the size. The companion
#: keeps its real 8x8: Star Battle is only feasible at 8x8 and 9x9, so there is
#: nothing smaller to pin it to.
SMALL_SIZE = 5


@contextmanager
def cheap_publish() -> Generator[None]:
    """Run `publish` on a tiny board, so windowing tests stay quick.

    The ramp makes a real publish expensive on purpose: a 9x9 Friday searches for a
    band it hits only about one time in twelve, so a real run costs seconds. That
    is right for the daily pipeline and wrong for a test whose subject is *which
    days get filled in*. Generation is pinned to the smallest board instead; the
    ramp is covered on its own terms in `test_ramp.py`.
    """

    def always_small(_day: date) -> DifficultyTarget:
        return DifficultyTarget(size=SMALL_SIZE, level=MIN_LEVEL)

    with patch.object(publish, "target_for", side_effect=always_small):
        yield


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


def _write_queens(tmp_path: Path, day: str) -> Path:
    """A real pre-ramp Queens board in canonical form, so replay and the ramp pass.

    Pre-ramp dates carry no band and skip the ramp check, leaving the canonical
    form as the only thing under test.
    """
    puzzle = generate_puzzle(
        seed=seed_from_date(day),
        puzzle_id=day,
        config=GenerationConfig(size=SMALL_SIZE, puzzle_type=PuzzleType.QUEENS),
    )
    path = tmp_path / f"{day}.json"
    path.write_text(dumps_puzzle(puzzle), encoding="utf-8")
    return path


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

    def test_accepts_a_canonically_written_file(self, tmp_path: Path) -> None:
        """The counterpart to the test below, so the check is not simply always-fail."""
        _write_queens(tmp_path, "2026-05-11")

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 0
        assert "1 puzzles verified" in _capture_verify(tmp_path)

    def test_rejects_a_file_that_replays_but_is_not_canonical(self, tmp_path: Path) -> None:
        """Identical puzzle, reformatted bytes.

        The seed still regenerates the same board, so every replay check passes
        and the archive is quietly no longer byte-stable. That is the property the
        next schema migration will rely on, and one committed file was already in
        this state.
        """
        path = _write_queens(tmp_path, "2026-05-11")
        path.write_text(json.dumps(json.loads(path.read_text()), indent=2), encoding="utf-8")

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 1
        assert "not in canonical form" in _capture_verify(tmp_path)


class TestVerifyRamp:
    """The ramp check has to fail verification, not merely note a problem.

    A mismatch that only prints a label lets the daily pipeline commit and deploy
    a board that breaks the week, which is exactly what the check is for.

    Boards are generated rather than hand-written so `verify_replay` passes and
    the ramp check is the only thing under test. `verify_replay` also compares the
    recorded band against the board, so a relabelled file would fail there first
    and prove nothing about the ramp.
    """

    # Two days inside the ramp whose targets are the cheapest to build: Monday
    # wants 7x7 and Tuesday 8x8, both at Medium. A 9x9 day is avoided on purpose,
    # since its band search is the slowest thing in the suite and none of these
    # rules are size-specific.
    MONDAY = "2026-10-12"
    TUESDAY = "2026-10-13"

    #: A band every supported size produces within a few attempts.
    EASY = MIN_LEVEL

    def _write(self, tmp_path: Path, day: str, size: int, level: int) -> Path:
        """A real, logic-only board of the requested size at the requested band."""
        target = DifficultyTarget(size=size, level=level)
        result = generate_ramped(
            seed=seed_from_date(day),
            puzzle_id=day,
            target=target,
            max_attempts=RAMP_ATTEMPTS[size],
        )
        assert result.achieved.level == level
        path = tmp_path / f"{day}.json"
        path.write_text(dumps_puzzle(replace(result.puzzle, difficulty=level)), encoding="utf-8")
        return path

    def test_accepts_a_published_ramp(self, tmp_path: Path) -> None:
        self._write(tmp_path, self.MONDAY, 7, self.EASY)
        self._write(tmp_path, self.TUESDAY, 8, self.EASY)

        assert verify.main(["--dir", str(tmp_path)]) == 0

    def test_rejects_a_post_ramp_day_with_no_band(self, tmp_path: Path) -> None:
        # The schema keeps `difficulty` optional so pre-ramp files still parse, so
        # nothing but this check stops a new file shipping without one.
        path = self._write(tmp_path, self.MONDAY, 7, self.EASY)
        data = json.loads(path.read_text(encoding="utf-8"))
        del data["difficulty"]
        path.write_text(json.dumps(data), encoding="utf-8")

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 1
        assert "no difficulty recorded" in _capture_verify(tmp_path)

    def test_rejects_a_board_of_the_wrong_size(self, tmp_path: Path) -> None:
        # A Monday board that is 8x8, where the target is 7x7.
        self._write(tmp_path, self.MONDAY, 8, self.EASY)

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 1
        assert "expected 7x7" in _capture_verify(tmp_path)

    def test_rejects_a_band_above_the_target(self, tmp_path: Path) -> None:
        # A Tuesday wants 8x8 Medium, so a Hard board of the right size is over the
        # target while its size still matches.
        self._write(tmp_path, self.TUESDAY, 8, 3)

        result = verify.main(["--dir", str(tmp_path)])

        assert result == 1
        assert "above Medium" in _capture_verify(tmp_path)

    def test_accepts_a_band_below_the_target(self, tmp_path: Path) -> None:
        # Falling short is legal: the search reports it and publishes the hardest
        # board it found, so an Easy Tuesday must not fail the build.
        self._write(tmp_path, self.TUESDAY, 8, self.EASY)

        assert verify.main(["--dir", str(tmp_path)]) == 0

    def test_leaves_a_pre_ramp_file_alone(self, tmp_path: Path) -> None:
        # Everything before RAMP_START was published when every board was 8x8 with
        # no band recorded, so there is nothing to check and nothing to complain
        # about: its size is history, not a claim.
        day = (RAMP_START - timedelta(days=1)).isoformat()
        result = generate_ramped(
            seed=seed_from_date(day),
            puzzle_id=day,
            target=DifficultyTarget(size=SMALL_SIZE, level=MIN_LEVEL),
            max_attempts=RAMP_ATTEMPTS[SMALL_SIZE],
        )
        (tmp_path / f"{day}.json").write_text(dumps_puzzle(result.puzzle), encoding="utf-8")

        assert verify.main(["--dir", str(tmp_path)]) == 0

    def test_never_checks_a_star_companion(self, tmp_path: Path) -> None:
        # Star Battle is off the ramp, so its 8x8 size is not a violation even on
        # a day whose Queens target is 7x7, and it records no band.
        day = self.MONDAY
        result = generate_ramped(
            seed=seed_from_date(f"{day}-star"),
            puzzle_id=f"{day}-star",
            target=DifficultyTarget(size=SMALL_SIZE, level=MIN_LEVEL),
            max_attempts=RAMP_ATTEMPTS[SMALL_SIZE],
        )
        (tmp_path / f"{day}-star.json").write_text(dumps_puzzle(result.puzzle), encoding="utf-8")

        assert verify.main(["--dir", str(tmp_path)]) == 0


def _run_publish(
    out_dir: Path, start: date | None, lead: int, *, dry_run: bool = True
) -> list[str]:

    args = ["--out", str(out_dir), "--lead", str(lead)]
    if dry_run:
        args.append("--dry-run")
    if start is not None:
        args += ["--start", start.isoformat()]
    buffer = io.StringIO()
    with cheap_publish(), redirect_stdout(buffer):
        exit_code = publish.main(args)
    assert exit_code == 0
    return buffer.getvalue().splitlines()


def _capture_verify(out_dir: Path) -> str:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        verify.main(["--dir", str(out_dir)])
    return buffer.getvalue()
