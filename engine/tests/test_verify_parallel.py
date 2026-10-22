"""Parallel replay must preserve failures, ordering and archive-wide checks."""

import json
from dataclasses import replace
from pathlib import Path

import pytest
from tools import verify

from queens_engine import (
    GenerationConfig,
    PuzzleType,
    dumps_puzzle,
    generate_puzzle,
    rulebook_for,
)


@pytest.mark.parametrize("broken", [False, True])
def test_parallel_verification_matches_serial_output(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], broken: bool
) -> None:
    queen = generate_puzzle(seed=1, puzzle_id="2026-05-11", config=GenerationConfig(size=5))
    raw = dumps_puzzle(queen)
    (tmp_path / "2026-05-11.json").write_text(
        json.dumps(json.loads(raw), indent=2) if broken else raw, encoding="utf-8"
    )
    for day, seed in (("2026-05-12-star", 2), ("2026-05-13-star", 2 if broken else 18)):
        puzzle = rulebook_for(PuzzleType.STAR_BATTLE).generate(seed=seed, puzzle_id=day)
        (tmp_path / f"{day}.json").write_text(dumps_puzzle(puzzle), encoding="utf-8")
    # A non-date JSON file must be skipped without parsing its contents.
    (tmp_path / "notes.json").write_text("not a puzzle", encoding="utf-8")
    if broken:
        (tmp_path / "2026-05-14.json").write_text("{invalid", encoding="utf-8")
        (tmp_path / "2026-05-15.json").write_text(raw, encoding="utf-8")
        (tmp_path / "2026-05-16-star.json").write_text(
            dumps_puzzle(replace(queen, id="2026-05-16-star")), encoding="utf-8"
        )
        (tmp_path / "2026-05-17.json").write_text(
            dumps_puzzle(replace(queen, id="2026-05-17", seed=2)), encoding="utf-8"
        )
        (tmp_path / "2026-10-12.json").write_text(
            dumps_puzzle(replace(queen, id="2026-10-12")), encoding="utf-8"
        )

    serial = verify.main(["--dir", str(tmp_path)])
    serial_output = capsys.readouterr()
    parallel = verify.main(["--dir", str(tmp_path), "--jobs", "2"])
    parallel_output = capsys.readouterr()

    assert serial == parallel == int(broken)
    assert parallel_output == serial_output
    assert "skip notes.json" in parallel_output.out
    if broken:
        assert "7 of 8 puzzles FAILED" in parallel_output.err
        for problem in (
            "not in canonical form",
            "repeats the solution layout",
            "filename",
            "file declares queens",
            "replay mismatch",
            "RAMP MISMATCH",
        ):
            assert problem in parallel_output.err
    else:
        assert "3 puzzles verified" in parallel_output.out


def test_parallel_worker_io_errors_fail_the_run(tmp_path: Path) -> None:
    (tmp_path / "2026-05-11.json").mkdir()
    with pytest.raises(IsADirectoryError):
        verify.main(["--dir", str(tmp_path), "--jobs", "2"])


def test_rejects_zero_workers(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="2"):
        verify.main(["--dir", str(tmp_path), "--jobs", "0"])
