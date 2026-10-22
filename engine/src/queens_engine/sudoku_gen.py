"""Version 1 Sudoku recipe shared by preview and daily publication."""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, replace

from .prng import Prng
from .sudoku import Level, SudokuGrid, SudokuSearchLimitError, is_solution, solve
from .sudoku_deduce import LEVELS, deduce

GENERATOR_VERSION = 1
MAX_ATTEMPTS = 256
MAX_NODES = 200_000


class SudokuGenerationError(ValueError):
    """No certified board within the finite construction budget."""


def certify(grid: SudokuGrid, level: Level, *, max_nodes: int = MAX_NODES) -> dict[str, object]:
    exact = solve(grid, max_nodes=max_nodes)
    if len(exact.solutions) != 1:
        raise ValueError("preview must have exactly one solution")
    result = deduce(grid, level)
    if (
        not result.solved
        or result.cells != exact.solutions[0]
        or not is_solution(grid, result.cells)
    ):
        raise ValueError("preview does not finish through its supported logic")
    tier = LEVELS.index(level)
    if tier and deduce(grid, LEVELS[tier - 1]).solved:
        raise ValueError("preview does not require its advertised level")
    for index, step in enumerate(result.steps):
        if not step.after & (1 << (exact.solutions[0][step.cell] - 1)):
            raise AssertionError("logical restriction removed the independently verified answer")
        if not step.after or step.after == step.before or step.after & step.before != step.after:
            raise AssertionError("trace is not a strict candidate restriction")
        if any(dependency >= index or dependency < 0 for dependency in step.dependencies):
            raise AssertionError("trace dependency is not an earlier step")
    return {
        "level": level,
        "solution": exact.solutions[0],
        "nodes": exact.nodes,
        "givens": sum(bool(v) for v in grid.givens),
        "rules": dict(Counter(step.rule for step in result.steps)),
        "trace": [asdict(step) for step in result.steps],
    }


def candidate(seed: int, level: Level, *, max_nodes: int = MAX_NODES) -> SudokuGrid | None:
    prng = Prng(seed)
    rows = [band * 3 + row for band in prng.shuffled(range(3)) for row in prng.shuffled(range(3))]
    cols = [stack * 3 + col for stack in prng.shuffled(range(3)) for col in prng.shuffled(range(3))]
    digits = prng.shuffled(range(1, 10))
    cells = [digits[(r * 3 + r // 3 + c) % 9] for r in rows for c in cols]
    # Clue targets sample different positions; certificates, never counts, assign the level.
    target = {"easy": 36, "medium": 28, "hard": 24}[level]
    remaining = 81
    for cell in prng.shuffled(range(81)):
        previous = cells[cell]
        cells[cell] = 0
        if len(solve(SudokuGrid(tuple(cells)), max_nodes=max_nodes).solutions) != 1:
            cells[cell] = previous
        else:
            remaining -= 1
        if remaining <= target:
            break
    grid = SudokuGrid(tuple(cells))
    if not deduce(grid, level).solved:
        return None
    tier = LEVELS.index(level)
    return None if tier and deduce(grid, LEVELS[tier - 1]).solved else grid


def generate(
    seed: int, level: Level, *, max_attempts: int = MAX_ATTEMPTS, max_nodes: int = MAX_NODES
) -> tuple[int, SudokuGrid]:
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError("seed must be a uint32")
    if level not in LEVELS:
        raise ValueError("level must be easy, medium or hard")
    if type(max_attempts) is not int or max_attempts < 1:
        raise ValueError("max_attempts must be a positive integer")
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    for offset in range(max_attempts):
        try:
            grid = candidate((seed + offset) % 2**32, level, max_nodes=max_nodes)
            if grid is None:
                continue
            certify(grid, level, max_nodes=max_nodes)
        except SudokuSearchLimitError:
            continue
        return (seed + offset) % 2**32, replace(grid, level=level)
    raise SudokuGenerationError(
        f"no certified {level} Sudoku in {max_attempts} attempts (search may be inconclusive)"
    )
