"""Killer Sudoku boards and bounded, exhaustive solution search."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from itertools import combinations

from .sudoku import (
    ALL,
    CELL_COUNT,
    SIDE,
    SOLUTION_LIMIT,
    UNITS,
    Level,
    SudokuGrid,
    SudokuSearchLimitError,
)


@dataclass(frozen=True)
class Cage:
    total: int
    cells: tuple[int, ...]


@dataclass(frozen=True)
class KillerGrid:
    givens: tuple[int, ...]
    cages: tuple[Cage, ...]
    level: Level

    @property
    def width(self) -> int:
        return SIDE

    @property
    def height(self) -> int:
        return SIDE

    def __post_init__(self) -> None:
        SudokuGrid(self.givens, self.level)
        occupied: set[int] = set()
        for cage in self.cages:
            if (
                not cage.cells
                or len(cage.cells) > SIDE
                or any(type(c) is not int or not 0 <= c < CELL_COUNT for c in cage.cells)
            ):
                raise ValueError("invalid cage cells")
            if len(set(cage.cells)) != len(cage.cells) or occupied.intersection(cage.cells):
                raise ValueError("duplicate cage cell")
            reached = {cage.cells[0]}
            while True:
                following = reached | {
                    c for c in cage.cells if any(adjacent(c, other) for other in reached)
                }
                if following == reached:
                    break
                reached = following
            if len(reached) != len(cage.cells) or not subsets(len(cage.cells), cage.total):
                raise ValueError("disconnected or impossible cage")
            placed = [self.givens[c] for c in cage.cells if self.givens[c]]
            if len(set(placed)) != len(placed) or not any(
                all(mask & (1 << (v - 1)) for v in placed)
                for mask in subsets(len(cage.cells), cage.total)
            ):
                raise ValueError("givens conflict with cage")
            occupied.update(cage.cells)
        if len(occupied) != CELL_COUNT:
            raise ValueError("cages must cover the board")


def adjacent(a: int, b: int) -> bool:
    return abs(a - b) == SIDE or (abs(a - b) == 1 and a // 9 == b // 9)


@cache
def subsets(size: int, total: int) -> tuple[int, ...]:
    return tuple(
        sum(1 << (d - 1) for d in digits)
        for digits in combinations(range(1, 10), size)
        if sum(digits) == total
    )


@dataclass(frozen=True)
class SolveResult:
    solutions: tuple[tuple[int, ...], ...]
    nodes: int


def solve(grid: KillerGrid, *, max_nodes: int = 200_000) -> SolveResult:  # noqa: PLR0915
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    cells = list(grid.givens)
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    owners = [0] * 81
    used = [0] * len(grid.cages)
    choices = [subsets(len(c.cells), c.total) for c in grid.cages]
    for index, cage in enumerate(grid.cages):
        for cell in cage.cells:
            owners[cell] = index
    for cell, digit in enumerate(cells):
        if digit:
            r, c = divmod(cell, 9)
            bit = 1 << (digit - 1)
            rows[r] |= bit
            cols[c] |= bit
            boxes[r // 3 * 3 + c // 3] |= bit
            used[owners[cell]] |= bit
    answers: list[tuple[int, ...]] = []
    nodes = 0

    def visit() -> None:
        nonlocal nodes
        if nodes >= max_nodes:
            raise SudokuSearchLimitError("exact Killer Sudoku search exhausted its node budget")
        nodes += 1
        target, available = -1, 0
        for cell, value in enumerate(cells):
            if value:
                continue
            r, c = divmod(cell, 9)
            cage = owners[cell]
            possible = 0
            for mask in choices[cage]:
                if mask & used[cage] == used[cage]:
                    possible |= mask & ~used[cage]
            mask = possible & ALL & ~(rows[r] | cols[c] | boxes[r // 3 * 3 + c // 3])
            if not mask:
                return
            if target < 0 or mask.bit_count() < available.bit_count():
                target, available = cell, mask
                if mask.bit_count() == 1:
                    break
        if target < 0:
            answers.append(tuple(cells))
            return
        r, c = divmod(target, 9)
        box, cage = r // 3 * 3 + c // 3, owners[target]
        while available and len(answers) < SOLUTION_LIMIT:
            bit = available & -available
            available ^= bit
            cells[target] = bit.bit_length()
            rows[r] |= bit
            cols[c] |= bit
            boxes[box] |= bit
            used[cage] |= bit
            visit()
            rows[r] ^= bit
            cols[c] ^= bit
            boxes[box] ^= bit
            used[cage] ^= bit
            cells[target] = 0

    visit()
    return SolveResult(tuple(answers), nodes)


def is_solution(grid: KillerGrid, values: tuple[int, ...]) -> bool:
    return (
        len(values) == CELL_COUNT
        and all(
            type(v) is int and 1 <= v <= SIDE and (not grid.givens[i] or grid.givens[i] == v)
            for i, v in enumerate(values)
        )
        and all(len({values[i] for i in unit}) == SIDE for unit in UNITS)
        and all(
            sum(values[i] for i in cage.cells) == cage.total
            and len({values[i] for i in cage.cells}) == len(cage.cells)
            for cage in grid.cages
        )
    )
