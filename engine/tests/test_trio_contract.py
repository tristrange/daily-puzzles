"""Daily Trio uses the unchanged pilot recipe and the shared publisher."""

import hashlib
import json
from dataclasses import asdict, replace
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from tools import publish
from tools.generate import main as generate_main
from tools.verify import main as verify_main

from queens_engine import (
    GenerationError,
    Puzzle,
    PuzzleParseError,
    PuzzleType,
    dumps_puzzle,
    parse_puzzle,
    rulebook_for,
    verify_replay,
)
from queens_engine.trio import TrioGrid, TrioSearchLimitError, deduce, is_solution
from queens_engine.trio_gen import TrioGenerationError, generate

IDENTIFIER = "2026-09-26-trio"


@pytest.fixture(scope="module")
def puzzle() -> Puzzle:
    return rulebook_for(PuzzleType.TRIO).generate(seed=42, puzzle_id=IDENTIFIER)


def test_daily_trio_keeps_the_frozen_pilot_and_certifies_it(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TRIO)
    assert isinstance(puzzle.board, TrioGrid)
    digest = hashlib.sha256(json.dumps(asdict(puzzle.board), sort_keys=True).encode()).hexdigest()
    assert digest == "c97d3c60df489e2d9e2410a56e39cda732e0b54ae5a9ea8380025ffc84adbd4a"
    assert puzzle.board == generate(42)
    assert puzzle.generator_version == 1
    assert puzzle.difficulty is None
    assert book.published and book.logic_only
    assert not book.on_ramp and not book.rated
    assert book.count_solutions(puzzle.board) == 1
    logic = book.deduce(puzzle.board, allow_guesses=False)
    assert logic is not None and logic.solved
    assert is_solution(puzzle.board, deduce(puzzle.board).cells)
    assert book.dimensions(puzzle) == (9, 9)
    assert len(book.render(puzzle).splitlines()) == 10
    assert parse_puzzle(json.loads(dumps_puzzle(puzzle))) == puzzle
    assert verify_replay(puzzle) == puzzle
    assert set(json.loads(dumps_puzzle(puzzle))["board"]) == {"size", "givens", "relations"}
    with pytest.raises(GenerationError, match="version"):
        verify_replay(replace(puzzle, generator_version=2))


def test_launch_is_dated_and_existing_publisher_uses_the_same_recipe(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TRIO)
    assert book.daily_ids(date(2026, 9, 25)) == ()
    assert book.daily_ids(date(2026, 9, 26)) == (IDENTIFIER,)
    assert IDENTIFIER not in publish._ids_for_day(date(2026, 9, 25))  # pyright: ignore[reportPrivateUsage]
    assert IDENTIFIER in publish._ids_for_day(date(2026, 9, 26))  # pyright: ignore[reportPrivateUsage]
    assert publish._generate(PuzzleType.TRIO, IDENTIFIER, 42) == (puzzle, None)  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize("options", [{"size": 9}, {"stars_per_row": 1}, {"max_attempts": 1}])
def test_recipe_rejects_replay_changing_options(options: dict[str, int]) -> None:
    with pytest.raises(GenerationError, match="fixed"):
        rulebook_for(PuzzleType.TRIO).generate(seed=42, puzzle_id=IDENTIFIER, **options)


@pytest.mark.parametrize("identifier", ["2026-02-30-trio", "20260926-trio", "2026-09-26"])
def test_generation_requires_a_canonical_trio_id(identifier: str) -> None:
    with pytest.raises(GenerationError, match="id"):
        rulebook_for(PuzzleType.TRIO).generate(seed=42, puzzle_id=identifier)


@pytest.mark.parametrize(
    "updates",
    [{"id": "2026-02-30-trio"}, {"id": "2026-09-26"}, {"generatorVersion": 2}, {"difficulty": 1}],
)
def test_envelope_rejects_invalid_trio_contract(puzzle: Puzzle, updates: dict[str, Any]) -> None:
    raw = json.loads(dumps_puzzle(puzzle))
    with pytest.raises(PuzzleParseError):
        parse_puzzle({**raw, **updates})


def test_search_exhaustion_cannot_become_a_unique_generated_board(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def exhausted(*_args: Any, **_kwargs: Any) -> Any:
        raise TrioSearchLimitError("test bound exhausted")

    monkeypatch.setattr("queens_engine.trio_gen.solve", exhausted)
    with pytest.raises(TrioGenerationError, match="inconclusive"):
        generate(42)
    with pytest.raises(GenerationError, match="inconclusive"):
        rulebook_for(PuzzleType.TRIO).generate(seed=42, puzzle_id=IDENTIFIER)


def test_generation_refuses_a_board_that_direct_deduction_cannot_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def stalled(_seed: int) -> TrioGrid:
        return TrioGrid((0,) * 81)

    monkeypatch.setattr("queens_engine.rulebook.generate_trio_grid", stalled)
    with pytest.raises(GenerationError, match="direct deductions"):
        rulebook_for(PuzzleType.TRIO).generate(seed=42, puzzle_id=IDENTIFIER)


def test_trio_cli_generates_and_verifies_without_marks_scoring(tmp_path: Path) -> None:
    assert (
        generate_main(
            [
                "--date",
                "2026-09-26",
                "--type",
                "trio",
                "--seed",
                "42",
                "--logic-only",
                "--out",
                str(tmp_path),
            ]
        )
        == 0
    )
    assert [p.name for p in tmp_path.glob("*.json")] == [f"{IDENTIFIER}.json"]
    assert verify_main(["--dir", str(tmp_path)]) == 0
