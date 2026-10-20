"""Frozen Tents v1: bounded construction, line propagation and exact uniqueness.

Preserve the candidate seed sequence and acceptance rules for replay. The offline
line-pattern filter is independent of the app's deliberately smaller hint engine.
"""

from __future__ import annotations

from itertools import combinations

from .prng import Prng
from .tents import TentsGrid, TentsSearchLimitError, candidate, neighbours, pairable, solutions

GENERATOR_VERSION = 1
SIDE = 10
TENT_COUNT = 18
CONSTRUCTION_ATTEMPTS = 10_000
PROPAGATION_BUDGET = 100_000


class TentsGenerationError(RuntimeError):
    """The frozen recipe could not certify a board within its bounds."""


def has_easy_opening(board: TentsGrid) -> bool:
    """Reject immediate tents from singleton trees or completely filled lines."""
    trees = set(board.trees)
    allowed = {cell for tree in trees for cell in neighbours(board.size, tree)} - trees
    return any(len(set(neighbours(board.size, tree)) - trees) == 1 for tree in trees) or any(
        sum(cell // board.size == line for cell in allowed) == board.rows[line]
        or sum(cell % board.size == line for cell in allowed) == board.cols[line]
        for line in range(board.size)
    )


def solves_by_line_patterns(  # noqa: PLR0912 — keep the fixed-point rules together
    board: TentsGrid, *, budget: int = PROPAGATION_BUDGET
) -> bool:
    """Propagate all legal patterns of each line, without choosing a branch.

    A pattern must fit the clues, avoid touching tents, admit a partial matching
    and leave every tree a neighbour. Only agreements of every surviving pattern
    become facts, so a stalled board is rejected rather than guessed through.
    """
    size = board.size
    trees = set(board.trees)
    cells = set(range(board.cell_count))
    adjacent = {cell: set(neighbours(size, cell)) for cell in cells}
    touching = {cell: set(neighbours(size, cell, diagonal=True)) for cell in cells}
    allowed = set[int]().union(*(adjacent[tree] for tree in trees)) - trees
    tents: set[int] = set()
    grass = cells - allowed
    lines = [
        (set(range(row * size, (row + 1) * size)), clue) for row, clue in enumerate(board.rows)
    ] + [(set(range(col, size * size, size)), clue) for col, clue in enumerate(board.cols)]
    work = 0
    while True:
        before = len(tents), len(grass)
        grass.update(cell for tent in tents for cell in touching[tent])
        if tents & grass:
            return False
        for tree in sorted(trees):
            options = adjacent[tree] - grass
            if not options:
                return False
            if len(options) == 1:
                tents.update(options)
        for line, clue in lines:
            fixed = line & tents
            if len(fixed) > clue:
                return False
            patterns: list[set[int]] = []
            for extra in combinations(sorted(line - grass - tents), clue - len(fixed)):
                work += 1
                if work > budget:
                    raise TentsSearchLimitError("Tents line-pattern budget exhausted")
                placed = fixed | set(extra)
                together = tents | placed
                if any(touching[cell] & together for cell in placed):
                    continue
                if not pairable(size, board.trees, tuple(sorted(together))):
                    continue
                blocked = (
                    grass | (line - placed) | set[int]().union(*(touching[tent] for tent in placed))
                )
                if any(not (adjacent[tree] - blocked) for tree in trees):
                    continue
                patterns.append(placed)
            if not patterns:
                return False
            tents.update(patterns[0].intersection(*patterns[1:]))
            grass.update(line - patterns[0].union(*patterns[1:]))
        if len(tents) == len(trees):
            return (
                not tents & grass
                and all(not (touching[tent] & tents) for tent in tents)
                and all(
                    sum(cell // size == r for cell in tents) == n for r, n in enumerate(board.rows)
                )
                and all(
                    sum(cell % size == c for cell in tents) == n for c, n in enumerate(board.cols)
                )
                and pairable(size, board.trees, tuple(sorted(tents)))
            )
        if before == (len(tents), len(grass)):
            return False


def generate(seed: int) -> TentsGrid:
    """Search a deterministic stream of candidate seeds for a certified daily grid."""
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError("seed must be an unsigned 32-bit integer")
    rng = Prng(seed)
    for _ in range(CONSTRUCTION_ATTEMPTS):
        grid = candidate(rng.below(2**32), size=SIDE)
        if grid is None or min(*grid.rows, *grid.cols) == 0 or has_easy_opening(grid):
            continue
        try:
            if solves_by_line_patterns(grid) and len(solutions(grid)) == 1:
                return grid
        except TentsSearchLimitError:
            continue
    raise TentsGenerationError("bounded Tents construction exhausted; certification inconclusive")
