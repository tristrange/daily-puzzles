"""The daily publisher must reject unsupported Train Tracks puzzles safely."""

from __future__ import annotations

import subprocess
from dataclasses import replace
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from tools import generate as generate_tool
from tools import publish, track_hints

from queens_engine import Puzzle, PuzzleType, load_puzzle, rulebook_for


@pytest.fixture
def puzzle() -> Puzzle:
    path = Path(__file__).resolve().parents[2] / "app/public/puzzles/2026-11-05-tracks-small.json"
    return load_puzzle(path)


@pytest.mark.parametrize(
    ("returncode", "output", "expected"), [(0, "solved\n", True), (1, "stalled\n", False)]
)
def test_app_checker_reports_solved_or_stalled(
    puzzle: Puzzle, returncode: int, output: str, expected: bool
) -> None:
    result = subprocess.CompletedProcess([], returncode, stdout=output, stderr="")
    with patch.object(track_hints.subprocess, "run", return_value=result):
        assert track_hints.tracks_hints_solve(puzzle) is expected


def test_app_checker_errors_do_not_look_like_a_stalled_board(puzzle: Puzzle) -> None:
    result = subprocess.CompletedProcess([], 2, stdout="", stderr="checker failed")
    with (
        patch.object(track_hints.subprocess, "run", return_value=result),
        pytest.raises(RuntimeError, match="checker failed"),
    ):
        track_hints.tracks_hints_solve(puzzle)


def test_unexpected_exit_one_is_a_checker_error(puzzle: Puzzle) -> None:
    result = subprocess.CompletedProcess([], 1, stdout="", stderr="module not found")
    with (
        patch.object(track_hints.subprocess, "run", return_value=result),
        pytest.raises(RuntimeError, match="module not found"),
    ):
        track_hints.tracks_hints_solve(puzzle)


def test_app_checker_timeout_stops_publication(puzzle: Puzzle) -> None:
    with (
        patch.object(
            track_hints.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 60)
        ),
        pytest.raises(RuntimeError, match="hint check could not run"),
    ):
        track_hints.tracks_hints_solve(puzzle)


def test_publisher_retries_with_the_next_seed_when_hints_stall(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TRAIN_TRACKS)
    rejected, accepted = replace(puzzle, seed=41), replace(puzzle, seed=42)
    with (
        patch.object(book, "generate", side_effect=[rejected, accepted]) as generate,
        patch.object(publish, "tracks_hints_solve", side_effect=[False, True]) as check,
    ):
        result, _ = publish._generate(PuzzleType.TRAIN_TRACKS, puzzle.id, 41)  # pyright: ignore[reportPrivateUsage]
    assert result == accepted
    assert [call.kwargs["seed"] for call in generate.call_args_list] == [41, 42]
    assert check.call_count == 2


def test_publisher_stops_when_the_hint_checker_fails(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TRAIN_TRACKS)
    with (
        patch.object(book, "generate", return_value=puzzle) as generate,
        patch.object(publish, "tracks_hints_solve", side_effect=RuntimeError("checker failed")),
        pytest.raises(RuntimeError, match="checker failed"),
    ):
        publish._generate(PuzzleType.TRAIN_TRACKS, puzzle.id, puzzle.seed)  # pyright: ignore[reportPrivateUsage]
    assert generate.call_count == 1


def test_failed_hint_checker_never_writes_a_puzzle_slot(puzzle: Puzzle, tmp_path: Path) -> None:
    book = rulebook_for(PuzzleType.TRAIN_TRACKS)
    with (
        patch.object(publish, "rulebooks", return_value=(book,)),
        patch.object(book, "generate", return_value=puzzle),
        patch.object(publish, "tracks_hints_solve", side_effect=RuntimeError("checker failed")),
    ):
        result = publish.main(
            ["--out", str(tmp_path), "--start", date.today().isoformat(), "--lead", "0"]
        )
    assert result == 1
    assert list(tmp_path.glob("*.json")) == []


def test_publisher_does_not_accept_a_stalled_board_after_its_retry_limit(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TRAIN_TRACKS)
    with (
        patch.object(book, "generate", return_value=puzzle),
        patch.object(publish, "tracks_hints_solve", return_value=False) as check,
        pytest.raises(RuntimeError, match="no train-tracks board"),
    ):
        publish._generate(PuzzleType.TRAIN_TRACKS, puzzle.id, puzzle.seed)  # pyright: ignore[reportPrivateUsage]
    assert check.call_count == generate_tool.LOGIC_ONLY_TRIES


def test_manual_generation_retries_until_app_hints_solve(puzzle: Puzzle, tmp_path: Path) -> None:
    book = rulebook_for(PuzzleType.TRAIN_TRACKS)
    rejected, accepted = replace(puzzle, seed=41), replace(puzzle, seed=42)
    with (
        patch.object(book, "generate", side_effect=[rejected, accepted]) as generate,
        patch.object(generate_tool, "tracks_hints_solve", side_effect=[False, True]),
    ):
        result = generate_tool.main(
            [
                "--date",
                puzzle.id,
                "--type",
                "train-tracks",
                "--seed",
                "41",
                "--out",
                str(tmp_path),
                "--logic-only",
            ]
        )
    assert result == 0
    assert [call.kwargs["seed"] for call in generate.call_args_list] == [41, 42]
    assert load_puzzle(tmp_path / f"{puzzle.id}.json").seed == 42
