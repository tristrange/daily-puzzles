"""Daily Tents freezes its recipe and certifies placements, without claiming hints."""

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
from queens_engine.tents import TentsGrid, TentsSearchLimitError, solutions
from queens_engine.tents_gen import (
    TentsGenerationError,
    generate,
    has_easy_opening,
    solves_by_line_patterns,
)

IDENTIFIER = "2026-09-26-tents"


@pytest.fixture(scope="module")
def puzzle() -> Puzzle:
    return rulebook_for(PuzzleType.TENTS).generate(seed=42, puzzle_id=IDENTIFIER)


def test_daily_tents_freezes_the_recipe_and_certifies_its_quality(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TENTS)
    assert isinstance(puzzle.board, TentsGrid)
    digest = hashlib.sha256(json.dumps(asdict(puzzle.board), sort_keys=True).encode()).hexdigest()
    assert digest == "5554ff5e9197064f92c3b0778e248a9a8f7ebb52d757a32b372d5b3ea3e577b7"
    assert puzzle.board == generate(42)
    assert puzzle.generator_version == 1 and puzzle.difficulty is None
    assert book.published and not book.on_ramp and not book.rated and not book.logic_only
    assert book.deduce(puzzle.board) is None
    assert book.dimensions(puzzle) == (10, 10)
    assert puzzle.board.cell_count == 100
    assert len(puzzle.board.trees) == 18
    assert min(*puzzle.board.rows, *puzzle.board.cols) > 0
    assert not has_easy_opening(puzzle.board)
    assert solves_by_line_patterns(puzzle.board)
    assert book.count_solutions(puzzle.board) == 1
    assert parse_puzzle(json.loads(dumps_puzzle(puzzle))) == puzzle
    assert verify_replay(puzzle) == puzzle
    with pytest.raises(GenerationError, match="version"):
        verify_replay(replace(puzzle, generator_version=2))
    raw = json.loads(dumps_puzzle(puzzle))
    assert "difficulty" not in raw
    assert set(raw["board"]) == {"size", "trees", "rowClues", "colClues"}


def test_launch_and_publisher_use_the_registered_recipe(puzzle: Puzzle) -> None:
    book = rulebook_for(PuzzleType.TENTS)
    assert book.daily_ids(date(2026, 9, 25)) == ()
    assert book.daily_ids(date(2026, 9, 26)) == (IDENTIFIER,)
    assert "2026-09-25-tents" not in publish._ids_for_day(date(2026, 9, 25))  # pyright: ignore[reportPrivateUsage]
    assert IDENTIFIER in publish._ids_for_day(date(2026, 9, 26))  # pyright: ignore[reportPrivateUsage]
    assert publish._generate(PuzzleType.TENTS, IDENTIFIER, 42) == (puzzle, None)  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize("options", [{"size": 10}, {"stars_per_row": 1}, {"max_attempts": 1}])
def test_fixed_recipe_refuses_overrides(options: dict[str, int]) -> None:
    with pytest.raises(GenerationError, match="fixed"):
        rulebook_for(PuzzleType.TENTS).generate(seed=42, puzzle_id=IDENTIFIER, **options)


@pytest.mark.parametrize("identifier", ["2026-02-30-tents", "20260926-tents", "2026-09-26"])
def test_generation_requires_canonical_tents_id(identifier: str) -> None:
    with pytest.raises(GenerationError, match="id"):
        rulebook_for(PuzzleType.TENTS).generate(seed=42, puzzle_id=identifier)


@pytest.mark.parametrize("seed", [-1, 2**32, True])
def test_seed_must_fit_the_published_envelope(seed: int) -> None:
    with pytest.raises(ValueError, match="seed"):
        generate(seed)


@pytest.mark.parametrize(
    "updates",
    [{"id": "2026-02-30-tents"}, {"id": "2026-09-26"}, {"generatorVersion": 2}, {"difficulty": 1}],
)
def test_envelope_rejects_invalid_contract(puzzle: Puzzle, updates: dict[str, Any]) -> None:
    raw = json.loads(dumps_puzzle(puzzle))
    with pytest.raises(PuzzleParseError):
        parse_puzzle({**raw, **updates})


@pytest.mark.parametrize(
    "updates",
    [{"size": 8}, {"trees": [1]}, {"rowClues": [0] * 10}, {"colClues": [1] * 10}],
)
def test_daily_parser_refuses_invalid_dimensions_counts_and_clues(
    puzzle: Puzzle, updates: dict[str, Any]
) -> None:
    raw = json.loads(dumps_puzzle(puzzle))
    raw["board"].update(updates)
    with pytest.raises(PuzzleParseError):
        parse_puzzle(raw)


def test_line_propagation_does_not_choose_between_ambiguous_placements() -> None:
    ambiguous = TentsGrid(3, (1, 7), (1, 0, 1), (1, 0, 1))
    assert not solves_by_line_patterns(ambiguous)
    assert len(solutions(ambiguous, limit=1)) == 1
    assert len(solutions(ambiguous)) == 2
    assert solves_by_line_patterns(TentsGrid(2, (0,), (1, 0), (0, 1)))
    with pytest.raises(TentsSearchLimitError, match="budget"):
        solves_by_line_patterns(ambiguous, budget=0)


def test_inconclusive_search_never_publishes_a_candidate(
    puzzle: Puzzle, monkeypatch: pytest.MonkeyPatch
) -> None:
    def exhausted(*_args: Any, **_kwargs: Any) -> Any:
        raise TentsSearchLimitError("test exhausted")

    monkeypatch.setattr("queens_engine.tents_gen.CONSTRUCTION_ATTEMPTS", 1)

    def fixed_candidate(_seed: int, *, size: int) -> TentsGrid:
        assert isinstance(puzzle.board, TentsGrid) and size == 10
        return puzzle.board

    monkeypatch.setattr("queens_engine.tents_gen.candidate", fixed_candidate)
    monkeypatch.setattr("queens_engine.tents_gen.solutions", exhausted)
    with pytest.raises(TentsGenerationError, match="inconclusive"):
        generate(42)
    with pytest.raises(GenerationError, match="inconclusive"):
        rulebook_for(PuzzleType.TENTS).generate(seed=42, puzzle_id=IDENTIFIER)
    monkeypatch.setattr("queens_engine.tents_gen.solves_by_line_patterns", exhausted)
    with pytest.raises(TentsGenerationError, match="inconclusive"):
        generate(42)


def test_stalled_line_propagation_is_rejected(
    puzzle: Puzzle, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("queens_engine.tents_gen.CONSTRUCTION_ATTEMPTS", 1)

    def fixed_candidate(_seed: int, *, size: int) -> TentsGrid:
        assert isinstance(puzzle.board, TentsGrid) and size == 10
        return puzzle.board

    monkeypatch.setattr("queens_engine.tents_gen.candidate", fixed_candidate)

    def stalled(_board: TentsGrid) -> bool:
        return False

    monkeypatch.setattr("queens_engine.tents_gen.solves_by_line_patterns", stalled)
    with pytest.raises(TentsGenerationError, match="inconclusive"):
        generate(42)


def test_cli_generates_and_verifies_daily_tents(tmp_path: Path) -> None:
    assert (
        generate_main(
            ["--date", "2026-09-26", "--type", "tents", "--seed", "42", "--out", str(tmp_path)]
        )
        == 0
    )
    assert [p.name for p in tmp_path.glob("*.json")] == [f"{IDENTIFIER}.json"]
    assert verify_main(["--dir", str(tmp_path)]) == 0
