import pytest

from queens_engine import enclosure_gen
from queens_engine.enclosure import EnclosureGrid, evaluate
from queens_engine.enclosure_gen import canonical_layout, generate_with_report
from queens_engine.enclosure_solver import EnclosureSolverTimeoutError


def test_generation_is_deterministic_and_certified():
    first, report = generate_with_report(0)
    second, _ = generate_with_report(0)
    assert first == second
    assert first.size == 8 and 6 <= first.wall_budget <= 10
    assert first.optimal_score is not None and first.optimal_score >= 8
    assert evaluate(first, ()).escaped
    assert report.best_bound == first.optimal_score
    assert report.greedy_score <= first.optimal_score


def test_canonical_layout_normalizes_rotations():
    grid = EnclosureGrid(8, (0, 9, 20), 27, 7)
    rotated = EnclosureGrid(8, tuple(sorted((c % 8) * 8 + 7 - c // 8 for c in grid.water)), 28, 7)
    assert canonical_layout(grid) == canonical_layout(rotated)


def test_another_seed_returns_a_certified_board():
    grid, report = generate_with_report(1)
    assert report.best_bound == grid.optimal_score
    assert report.greedy_gap == grid.optimal_score - report.greedy_score
    assert report.attempts == 1 + sum(report.rejections.values())


def test_version_one_seed_zero_layout_is_pinned():
    grid, _ = generate_with_report(0)
    assert grid == EnclosureGrid(
        8, (5, 9, 13, 14, 15, 17, 21, 23, 24, 25, 32, 36, 40, 41, 44, 45, 49, 50), 42, 9, 21
    )


def test_solver_watchdog_aborts_generation(monkeypatch):
    def timeout(_grid):
        raise EnclosureSolverTimeoutError("watchdog")

    monkeypatch.setattr(enclosure_gen, "solve_optimal", timeout)
    with pytest.raises(EnclosureSolverTimeoutError, match="watchdog"):
        enclosure_gen.generate(0)
