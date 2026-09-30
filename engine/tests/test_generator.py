"""Generation, the uniqueness gate, and replay.

The generator must be deterministic, must only ever ship unique-solution
boards, and must fail loudly rather than return something with a second
solution. The property tests sample seeds across the schema's full range; for
the slow sizes (8 and 9) we use fixed seeds so the suite stays fast, and test
that variety is spread across all supported sizes.
"""

from __future__ import annotations

import json

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from queens_engine import (
    DEFAULT_ATTEMPTS,
    Board,
    GenerationConfig,
    GenerationError,
    Puzzle,
    PuzzleType,
    dumps_puzzle,
    generate_puzzle,
    parse_puzzle,
    render_puzzle,
    verify_replay,
)
from queens_engine.solver import iter_solutions
from test_solver import obeys_the_rules

SIZES = (5, 6, 7, 8, 9)

# Sizes 8 and 9 use the slow default budgets; hold their property-test volume
# down by pinning seeds that are known to succeed quickly.
FAST_SIZES = (5, 6, 7)
KNOWN_GOOD = {8: 1, 9: 11}  # verified to generate within default attempts

SEEDS = st.integers(min_value=0, max_value=2**32 - 1)
SIZES_FAST = st.sampled_from(FAST_SIZES)


def _generate(
    seed: int,
    size: int = 8,
    puzzle_id: str = "2026-01-01",
    max_attempts: int | None = None,
) -> Puzzle:
    return generate_puzzle(
        seed=seed,
        puzzle_id=puzzle_id,
        config=GenerationConfig(size=size, max_attempts=max_attempts or DEFAULT_ATTEMPTS[size]),
    )


def _solutions(board: Board) -> list[list[int]]:
    return [list(s) for s in iter_solutions(board)]


@settings(max_examples=30, deadline=None)
@given(SEEDS, SIZES_FAST)
def test_same_seed_generates_the_same_board(seed: int, size: int) -> None:
    a = _generate(seed, size)
    b = _generate(seed, size)
    assert a.board == b.board
    assert a.seed == b.seed
    assert a.generator_version == b.generator_version


@settings(max_examples=30, deadline=None)
@given(SEEDS, SIZES_FAST)
def test_generated_puzzle_has_exactly_one_solution(seed: int, size: int) -> None:
    puzzle = _generate(seed, size)
    assert len(_solutions(puzzle.board)) == 1


def test_every_supported_size_generates() -> None:
    for size in SIZES:
        seed = KNOWN_GOOD.get(size, 3)
        puzzle = _generate(seed, size)
        assert puzzle.board.size == size
        assert puzzle.puzzle_type is PuzzleType.QUEENS
        assert puzzle.board.region_count == size


def test_verify_replay_rebuilds_the_same_board() -> None:
    puzzle = _generate(seed=12345)
    replay = verify_replay(puzzle)
    assert replay.board == puzzle.board


def test_verify_replay_detects_tampering() -> None:
    puzzle = _generate(seed=1)
    from_ids = {puzzle.board.region_at(i) for i in range(len(puzzle.board.regions))}
    a, b = sorted(from_ids)[:2]
    swapped = [
        b if region == a else a if region == b else region for region in puzzle.board.regions
    ]
    forged = Puzzle(
        id=puzzle.id,
        puzzle_type=puzzle.puzzle_type,
        size=puzzle.size,
        seed=puzzle.seed,
        generator_version=puzzle.generator_version,
        board=Board(
            size=puzzle.size,
            regions=tuple(swapped),
            region_capacity=puzzle.board.region_capacity,
            puzzle_type=puzzle.board.puzzle_type,
        ),
    )
    assert forged.board != puzzle.board
    with pytest.raises(GenerationError):
        verify_replay(forged)


def test_seed_out_of_range_is_rejected() -> None:
    with pytest.raises(GenerationError):
        generate_puzzle(seed=2**32, puzzle_id="x")
    with pytest.raises(GenerationError):
        generate_puzzle(seed=-1, puzzle_id="x")


def test_unsupported_size_is_rejected() -> None:
    for bad in (4, 10):
        with pytest.raises(GenerationError):
            generate_puzzle(seed=1, puzzle_id="x", config=GenerationConfig(size=bad))


def test_solution_is_legal_and_fits_the_board() -> None:
    puzzle = _generate(seed=7, size=8)
    solution = _solutions(puzzle.board)[0]
    size = puzzle.board.size
    assert len(solution) == size
    # One star per row, column, and region.
    rows = [cell // size for cell in solution]
    cols = [cell % size for cell in solution]
    regions_seen = [puzzle.board.region_at(cell) for cell in solution]
    assert sorted(rows) == list(range(size))
    assert sorted(cols) == list(range(size))
    assert sorted(regions_seen) == list(range(size))


def test_dumps_is_stable_and_round_trips() -> None:
    puzzle = generate_puzzle(seed=9, puzzle_id="2026-02-03")
    text = dumps_puzzle(puzzle)
    assert text == dumps_puzzle(puzzle)
    parsed = json.loads(text)
    assert parsed["id"] == puzzle.id
    assert parsed["size"] == puzzle.size
    assert parsed["seed"] == puzzle.seed
    assert list(parsed["regions"]) == list(puzzle.board.regions)
    if "regionCapacity" in parsed:
        assert list(parsed["regionCapacity"]) == list(puzzle.board.region_capacity)


def test_render_shows_a_queen_per_row_and_column() -> None:
    puzzle = generate_puzzle(seed=11, puzzle_id="2026-04-05")
    lines = render_puzzle(puzzle).splitlines()
    assert "2026-04-05" in lines[0] and "seed=11" in lines[0]
    board_lines = lines[1:]
    assert len(board_lines) == puzzle.board.size
    for line in board_lines:
        assert line.count("Q") == 1
    # columns
    assert all(line.count("Q") == 1 for line in board_lines)
    assert all(
        sum(line.split()[col] == "Q" for line in board_lines) == 1
        for col in range(puzzle.board.size)
    )


# ---------------------------------------------------------------------------
# Star Battle
# ---------------------------------------------------------------------------

# The only (size, stars_per_row) pairs within the generator's size range that
# admit a legal no-touching layout (see FEASIBLE_STAR_BATTLE in generator.py).
FEASIBLE_STAR_BATTLE = ((8, 2), (9, 2))
STAR_KNOWN_GOOD = {(8, 2): 0, (9, 2): 0}  # verified to generate within default attempts
STAR_SEEDS = st.integers(min_value=0, max_value=7)


def _generate_star(
    seed: int,
    size: int,
    stars: int,
    puzzle_id: str = "2026-01-01",
    max_attempts: int | None = None,
) -> Puzzle:
    return generate_puzzle(
        seed=seed,
        puzzle_id=puzzle_id,
        config=GenerationConfig(
            size=size,
            puzzle_type=PuzzleType.STAR_BATTLE,
            stars_per_row=stars,
            max_attempts=max_attempts or DEFAULT_ATTEMPTS[size],
        ),
    )


@settings(max_examples=15, deadline=None)
@given(STAR_SEEDS)
def test_star_battle_same_seed_generates_the_same_board(seed: int) -> None:
    a = _generate_star(seed, 8, 2)
    b = _generate_star(seed, 8, 2)
    assert a.board == b.board
    assert a.seed == b.seed
    assert a.generator_version == 2


@settings(max_examples=15, deadline=None)
@given(STAR_SEEDS)
def test_star_battle_has_exactly_one_solution(seed: int) -> None:
    puzzle = _generate_star(seed, 8, 2)
    assert len(_solutions(puzzle.board)) == 1


def test_every_supported_star_battle_combo_generates() -> None:
    for size, stars in FEASIBLE_STAR_BATTLE:
        puzzle = _generate_star(STAR_KNOWN_GOOD[(size, stars)], size, stars)
        assert puzzle.board.size == size
        assert puzzle.puzzle_type is PuzzleType.STAR_BATTLE
        assert puzzle.board.region_count == size
        assert puzzle.board.region_capacity == (stars,) * size


def test_star_battle_solution_is_legal_and_fits_the_board() -> None:
    puzzle = _generate_star(0, 8, 2)
    solution = _solutions(puzzle.board)[0]
    assert obeys_the_rules(puzzle.board, solution)


def test_star_battle_verify_replay_rebuilds_the_same_board() -> None:
    puzzle = _generate_star(0, 8, 2)
    assert verify_replay(puzzle).board == puzzle.board


def test_star_battle_verify_replay_detects_tampering() -> None:
    puzzle = _generate_star(0, 8, 2)
    swapped = [1 - region if region < 2 else region for region in puzzle.board.regions]
    forged = Puzzle(
        id=puzzle.id,
        puzzle_type=puzzle.puzzle_type,
        size=puzzle.size,
        seed=puzzle.seed,
        generator_version=puzzle.generator_version,
        board=Board(
            size=puzzle.size,
            regions=tuple(swapped),
            region_capacity=puzzle.board.region_capacity,
            puzzle_type=puzzle.board.puzzle_type,
        ),
    )
    assert forged.board != puzzle.board
    with pytest.raises(GenerationError):
        verify_replay(forged)


def test_star_battle_requires_stars_per_row() -> None:
    with pytest.raises(GenerationError):
        generate_puzzle(
            seed=1,
            puzzle_id="x",
            config=GenerationConfig(size=8, puzzle_type=PuzzleType.STAR_BATTLE),
        )


def test_queens_rejects_an_explicit_star_count() -> None:
    with pytest.raises(GenerationError):
        generate_puzzle(
            seed=1,
            puzzle_id="x",
            config=GenerationConfig(size=8, puzzle_type=PuzzleType.QUEENS, stars_per_row=2),
        )


def test_infeasible_star_battle_combos_are_rejected() -> None:
    for size, stars in ((6, 2), (8, 3), (9, 3)):
        with pytest.raises(GenerationError):
            _generate_star(0, size, stars)


def test_star_battle_stars_out_of_range_are_rejected() -> None:
    for stars in (1, 9):
        with pytest.raises(GenerationError):
            _generate_star(0, 8, stars)


def test_star_battle_dumps_round_trips_with_capacity() -> None:
    puzzle = _generate_star(0, 8, 2, puzzle_id="2026-02-03")
    text = dumps_puzzle(puzzle)
    assert text == dumps_puzzle(puzzle)
    parsed = json.loads(text)
    assert parsed["type"] == "star-battle"
    assert list(parsed["regionCapacity"]) == list(puzzle.board.region_capacity)
    assert dumps_puzzle(parse_puzzle(parsed)) == text


def test_star_battle_render_shows_two_stars_per_row_and_column() -> None:
    puzzle = _generate_star(0, 8, 2, puzzle_id="2026-04-05")
    lines = render_puzzle(puzzle).splitlines()
    assert "2026-04-05" in lines[0] and "seed=0" in lines[0]
    board_lines = lines[1:]
    assert len(board_lines) == puzzle.board.size
    for line in board_lines:
        assert line.count("Q") == 2
    for col in range(puzzle.board.size):
        assert sum(line.split()[col] == "Q" for line in board_lines) == 2
