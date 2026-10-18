"""A small pilot check, not a large seeded batch in every CI run."""

from queens_engine.trio import deduce, is_solution, solve
from queens_engine.trio_gen import generate


def test_seed_replays_a_nontrivial_logically_solved_unique_board() -> None:
    grid = generate(42)
    assert generate(42) == grid
    assert any(v == 0 for v in grid.givens)
    assert grid.relations
    result = deduce(grid)
    assert result.solved
    assert is_solution(grid, result.cells)
    assert solve(grid).solutions == (result.cells,)


def test_different_seeds_produce_different_boards() -> None:
    assert generate(7) != generate(42)
