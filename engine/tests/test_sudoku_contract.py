"""Daily Sudoku exposes three honest logical bands through the shared pipeline."""

import json
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from tools import publish
from tools.generate import main as generate_main
from tools.verify import main as verify_main

from queens_engine import (
    GenerationError,
    PuzzleParseError,
    PuzzleType,
    dumps_puzzle,
    parse_puzzle,
    puzzle_id,
    rulebook_for,
    split_puzzle_id,
    verify_replay,
)
from queens_engine.sudoku import Level, SudokuGrid
from queens_engine.sudoku_gen import SudokuGenerationError, candidate, certify, generate


def test_sudoku_names_only_three_level_slots_from_archive_start() -> None:
    kind = PuzzleType("sudoku")
    book = rulebook_for(kind)
    assert book.daily_ids(date(2026, 9, 25)) == ()
    assert book.daily_ids(date(2026, 9, 26)) == tuple(
        f"2026-09-26-sudoku-{level}" for level in ("easy", "medium", "hard")
    )
    expected = tuple(f"2026-10-21-sudoku-{level}" for level in ("easy", "medium", "hard"))
    assert book.daily_ids(date(2026, 10, 21)) == expected
    assert puzzle_id(date(2026, 10, 21), kind) == expected[0]
    assert split_puzzle_id("2026-10-21-sudoku") is None
    for identifier in expected:
        assert split_puzzle_id(identifier) == (date(2026, 10, 21), kind)
    existing = set(publish._ids_for_day(date(2026, 10, 21)))  # pyright: ignore[reportPrivateUsage]
    existing.remove(expected[1])
    first = publish._first_incomplete_day(  # pyright: ignore[reportPrivateUsage]
        existing, date(2026, 10, 21), date(2026, 10, 21)
    )
    assert first == date(2026, 10, 21)


def test_daily_sudoku_round_trip_certificate_and_replay() -> None:
    kind = PuzzleType("sudoku")
    book = rulebook_for(kind)
    puzzle = book.generate(seed=0, puzzle_id="2026-10-21-sudoku-easy")
    assert isinstance(puzzle.board, SudokuGrid)
    assert puzzle.board.level == "easy"
    assert puzzle.generator_version == 1 and puzzle.difficulty is None
    assert book.published and book.logic_only and not book.rated and not book.on_ramp
    assert book.count_solutions(puzzle.board) == 1
    assert book.count_solutions(puzzle.board, limit=1) == 1
    result = book.deduce(puzzle.board, allow_guesses=False)
    assert result is not None and result.solved
    assert book.dimensions(puzzle) == (9, 9)
    assert "2026-10-21-sudoku-easy" in book.render(puzzle)
    raw = json.loads(dumps_puzzle(puzzle))
    assert "difficulty" not in raw
    assert set(raw["board"]) == {"size", "level", "givens"}
    assert parse_puzzle(raw) == puzzle
    assert verify_replay(puzzle) == puzzle
    with pytest.raises(GenerationError, match="version"):
        verify_replay(replace(puzzle, generator_version=2))
    with pytest.raises(GenerationError, match="level"):
        verify_replay(replace(puzzle, id="2026-10-21-sudoku-hard"))


@pytest.mark.parametrize(
    "updates",
    [
        {"id": "2026-10-21-sudoku"},
        {"id": "2026-02-30-sudoku-easy"},
        {"id": "2026-10-21-sudoku-hard"},
        {"generatorVersion": 2},
        {"difficulty": 1},
    ],
)
def test_sudoku_envelope_rejects_invalid_identity_and_version(updates: dict[str, Any]) -> None:
    raw = json.loads(
        dumps_puzzle(
            rulebook_for(PuzzleType("sudoku")).generate(seed=0, puzzle_id="2026-10-21-sudoku-easy")
        )
    )
    with pytest.raises(PuzzleParseError):
        parse_puzzle({**raw, **updates})


@pytest.mark.parametrize(
    "identifier", ["2026-10-21-sudoku", "20261021-sudoku-hard", "2026-02-30-sudoku-easy"]
)
def test_sudoku_generation_requires_canonical_level_id(identifier: str) -> None:
    with pytest.raises(GenerationError, match="id"):
        rulebook_for(PuzzleType("sudoku")).generate(seed=0, puzzle_id=identifier)


def test_cli_generates_and_verifies_daily_sudoku(tmp_path: Path) -> None:
    assert (
        generate_main(
            [
                "--date",
                "2026-10-21-sudoku-easy",
                "--type",
                "sudoku",
                "--seed",
                "0",
                "--out",
                str(tmp_path),
            ]
        )
        == 0
    )
    assert [p.name for p in tmp_path.glob("*.json")] == ["2026-10-21-sudoku-easy.json"]
    assert verify_main(["--dir", str(tmp_path)]) == 0


@pytest.mark.parametrize("level,seed", [("easy", 0), ("medium", 10002), ("hard", 20180)])
def test_daily_reuses_exact_preview_recipe_and_accepted_seed(level: Level, seed: int) -> None:
    puzzle = rulebook_for(PuzzleType("sudoku")).generate(
        seed=seed, puzzle_id=f"2026-10-21-sudoku-{level}"
    )
    assert isinstance(puzzle.board, SudokuGrid)
    assert puzzle.seed == seed
    expected = candidate(seed, level)
    assert expected is not None and puzzle.board.givens == expected.givens
    assert certify(puzzle.board, level)["level"] == level
    assert verify_replay(puzzle) == puzzle


def test_generation_records_accepted_seed_and_replay_does_not_search_failed_candidates() -> None:
    book = rulebook_for(PuzzleType("sudoku"))
    puzzle = book.generate(seed=10001, puzzle_id="2026-10-21-sudoku-medium")
    assert puzzle.seed == 10002
    assert verify_replay(puzzle) == puzzle
    with pytest.raises(GenerationError):
        verify_replay(replace(puzzle, seed=10001))


def test_finite_generation_budget_refuses_stalls_and_inconclusive_search() -> None:
    with pytest.raises(SudokuGenerationError, match="attempts"):
        generate(10001, "medium", max_attempts=1)
    with pytest.raises(SudokuGenerationError, match="inconclusive"):
        generate(0, "easy", max_attempts=1, max_nodes=0)


def test_publisher_retries_fresh_sudoku_seed_batches() -> None:
    seeds: list[int] = []

    def exhausted(*, seed: int, puzzle_id: str) -> None:
        del puzzle_id
        seeds.append(seed)
        raise GenerationError("candidate batch exhausted")

    book = rulebook_for(PuzzleType.SUDOKU)
    with (
        patch.object(book, "generate", side_effect=exhausted),
        patch.object(publish, "LOGIC_ONLY_TRIES", 3),
        pytest.raises(RuntimeError, match="3 seed bumps"),
    ):
        publish._generate(PuzzleType.SUDOKU, "2026-10-22-sudoku-hard", 100)  # pyright: ignore[reportPrivateUsage]
    assert seeds == [100, 356, 612]


@pytest.mark.parametrize("seed", [-1, 2**32, True])
def test_sudoku_generation_validates_seed(seed: int) -> None:
    with pytest.raises(GenerationError, match="seed"):
        rulebook_for(PuzzleType("sudoku")).generate(seed=seed, puzzle_id="2026-10-21-sudoku-easy")
