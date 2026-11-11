from dataclasses import replace
from datetime import date

import pytest

from queens_engine import (
    GenerationError,
    PuzzleType,
    dumps_puzzle,
    parse_puzzle,
    puzzle_id,
    rulebook_for,
    verify_replay,
)
from queens_engine.enclosure import EnclosureGrid
from queens_engine.puzzle import puzzle_to_dict


def test_enclosure_contract_roundtrip_replay_and_not_unique_solution_counting() -> None:
    book = rulebook_for(PuzzleType.ENCLOSURE)
    puzzle = book.generate(seed=7, puzzle_id=puzzle_id(date(2026, 11, 11), PuzzleType.ENCLOSURE))
    assert not book.published
    assert not book.rated
    assert not book.logic_only
    assert book.certification == "optimal-score"
    assert parse_puzzle(puzzle_to_dict(puzzle)) == puzzle
    assert verify_replay(puzzle) == puzzle
    assert "optimalScore" in dumps_puzzle(puzzle)
    data = puzzle_to_dict(puzzle)["board"]
    assert isinstance(data, dict)
    assert "walls" not in data
    with pytest.raises(GenerationError, match="optimization"):
        book.count_solutions(puzzle.board)
    assert book.daily_ids(date(2026, 11, 10)) == ()


def test_modified_target_cannot_pass_replay() -> None:
    book = rulebook_for(PuzzleType.ENCLOSURE)
    puzzle = book.generate(seed=7, puzzle_id="2026-11-11-enclosure")
    grid = puzzle.board
    assert isinstance(grid, EnclosureGrid)
    assert grid.optimal_score is not None
    changed = replace(puzzle, board=replace(grid, optimal_score=grid.optimal_score - 1))
    with pytest.raises(GenerationError, match="replay mismatch"):
        verify_replay(changed)
