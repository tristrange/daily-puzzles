"""Pure rules and a small exhaustive oracle for Horse Enclosure."""

from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations
from math import comb

MAX_SIZE = 12


def _integer(value: object) -> bool:
    return type(value) is int


@dataclass(frozen=True)
class EnclosureGrid:
    size: int
    water: tuple[int, ...]
    horse: int
    wall_budget: int
    optimal_score: int | None = None

    def __post_init__(self) -> None:
        if not _integer(self.size) or not 1 <= self.size <= MAX_SIZE:
            raise ValueError("invalid size")
        if (
            type(self.water) is not tuple
            or any(not _integer(c) or not 0 <= c < self.cell_count for c in self.water)
            or tuple(sorted(set(self.water))) != self.water
        ):
            raise ValueError("invalid water")
        if (
            not _integer(self.horse)
            or not 0 <= self.horse < self.cell_count
            or self.horse in self.water
        ):
            raise ValueError("invalid horse")
        if not _integer(self.wall_budget) or not 0 <= self.wall_budget < self.cell_count:
            raise ValueError("invalid wall budget")
        if self.optimal_score is not None and (
            not _integer(self.optimal_score)
            or not 1 <= self.optimal_score <= self.cell_count - len(self.water)
        ):
            raise ValueError("invalid optimal score")

    @property
    def width(self) -> int:
        return self.size

    @property
    def height(self) -> int:
        return self.size

    @property
    def cell_count(self) -> int:
        return self.size * self.size


def neighbours(size: int, cell: int) -> tuple[int, ...]:
    if (
        not _integer(size)
        or not 1 <= size <= MAX_SIZE
        or not _integer(cell)
        or not 0 <= cell < size * size
    ):
        raise ValueError("invalid cell or size")
    row, col = divmod(cell, size)
    return tuple(
        sorted(
            r * size + c
            for r, c in ((row - 1, col), (row, col - 1), (row, col + 1), (row + 1, col))
            if 0 <= r < size and 0 <= c < size
        )
    )


def _walls(grid: EnclosureGrid, walls: Sequence[int]) -> tuple[int, ...]:
    if isinstance(walls, (str, bytes)) or not isinstance(walls, Sequence):  # pyright: ignore[reportUnnecessaryIsInstance]
        raise ValueError("invalid walls")
    result = tuple(walls)
    if (
        len(result) > grid.wall_budget
        or any(
            not _integer(c) or not 0 <= c < grid.cell_count or c == grid.horse or c in grid.water
            for c in result
        )
        or tuple(sorted(set(result))) != result
    ):
        raise ValueError("invalid walls")
    return result


@dataclass(frozen=True)
class Evaluation:
    escaped: bool
    reachable: tuple[int, ...]
    score: int


def evaluate(grid: EnclosureGrid, walls: Sequence[int]) -> Evaluation:
    blocked = set(grid.water) | set(_walls(grid, walls))
    seen = {grid.horse}
    queue = deque([grid.horse])
    while queue:
        for cell in neighbours(grid.size, queue.popleft()):
            if cell not in blocked and cell not in seen:
                seen.add(cell)
                queue.append(cell)
    escaped = any(
        c // grid.size in (0, grid.size - 1) or c % grid.size in (0, grid.size - 1) for c in seen
    )
    return Evaluation(escaped, tuple(sorted(seen)), 0 if escaped else len(seen))


def toggle_wall(grid: EnclosureGrid, walls: Sequence[int], cell: int) -> tuple[int, ...]:
    current = _walls(grid, walls)
    if _integer(cell) and cell in current:
        return tuple(wall for wall in current if wall != cell)
    if (
        not _integer(cell)
        or not 0 <= cell < grid.cell_count
        or cell == grid.horse
        or cell in grid.water
        or len(current) >= grid.wall_budget
    ):
        return current
    return tuple(sorted((*current, cell)))


@dataclass(frozen=True)
class OracleResult:
    score: int | None
    walls: tuple[int, ...]


def exhaustive_optimum(grid: EnclosureGrid, max_candidates: int = 1000000) -> OracleResult:
    if not _integer(max_candidates) or max_candidates < 1:
        raise ValueError("invalid enumeration cap")
    candidates = tuple(c for c in range(grid.cell_count) if c != grid.horse and c not in grid.water)
    limit = min(grid.wall_budget, len(candidates))
    if sum(comb(len(candidates), n) for n in range(limit + 1)) > max_candidates:
        raise ValueError("enumeration cap exceeded")
    best = OracleResult(None, ())
    for n in range(limit + 1):
        for walls in combinations(candidates, n):
            result = evaluate(grid, walls)
            if not result.escaped and (best.score is None or result.score > best.score):
                best = OracleResult(result.score, walls)
    return best
