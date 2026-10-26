"""Frozen Nurikabe v1: bounded geometry construction and exhaustive uniqueness."""

from __future__ import annotations

from collections.abc import Sequence

from .nurikabe import NurikabeGrid, NurikabeSearchLimitError, is_solution, solve
from .prng import Prng

GENERATOR_VERSION = 1
SIDE = 7
MAX_ISLAND = 5
MIN_ISLANDS = 7
MAX_ISLANDS = 12
MAX_SINGLETONS = 3
MIN_LARGE_ISLANDS = 3
LARGE_ISLAND = 3
MIN_BIGGEST_ISLAND = 4
CONSTRUCTION_ATTEMPTS = 4_000
EXACT_NODES = 200_000
EXACT_WORK = 25_600_000
LAYOUT_WINDOW_DAYS = 14

_CELLS = frozenset(range(SIDE**2))
_NEAR = tuple(
    frozenset(
        row * SIDE + col
        for row, col in (
            (cell // SIDE - 1, cell % SIDE),
            (cell // SIDE + 1, cell % SIDE),
            (cell // SIDE, cell % SIDE - 1),
            (cell // SIDE, cell % SIDE + 1),
        )
        if 0 <= row < SIDE and 0 <= col < SIDE
    )
    for cell in range(SIDE**2)
)
_SQUARES = tuple(
    frozenset(
        (row * SIDE + col, row * SIDE + col + 1, (row + 1) * SIDE + col, (row + 1) * SIDE + col + 1)
    )
    for row in range(SIDE - 1)
    for col in range(SIDE - 1)
)


class NurikabeGenerationError(RuntimeError):
    """The frozen recipe could not certify a board within its bounds."""


def _groups(cells: set[int]) -> list[set[int]]:
    remaining = set(cells)
    groups: list[set[int]] = []
    while remaining:
        first = min(remaining)
        remaining.remove(first)
        group = {first}
        pending = [first]
        for cell in pending:
            for neighbour in sorted(_NEAR[cell] & remaining):
                remaining.remove(neighbour)
                group.add(neighbour)
                pending.append(neighbour)
        groups.append(group)
    return groups


def _candidate(rng: Prng) -> tuple[NurikabeGrid, tuple[int, ...]] | None:
    land: set[int] = set()
    sea = set(_CELLS)
    for index in rng.shuffled(list(range(len(_SQUARES)))):
        square = _SQUARES[index]
        if square & land:
            continue
        for cell in rng.shuffled(sorted(square)):
            if max(map(len, _groups(land | {cell}))) > MAX_ISLAND:
                continue
            if len(_groups(sea - {cell})) != 1:
                continue
            land.add(cell)
            sea.remove(cell)
            break
        else:
            return None
    islands = _groups(land)
    sizes = [len(island) for island in islands]
    if (
        not MIN_ISLANDS <= len(islands) <= MAX_ISLANDS
        or sizes.count(1) > MAX_SINGLETONS
        or sum(size >= LARGE_ISLAND for size in sizes) < MIN_LARGE_ISLANDS
        or max(sizes, default=0) < MIN_BIGGEST_ISLAND
    ):
        return None
    clues = [0] * SIDE**2
    for island in islands:
        cells = sorted(island)
        clues[cells[rng.below(len(cells))]] = len(cells)
    return NurikabeGrid(SIDE, tuple(clues)), tuple(int(cell in land) for cell in range(SIDE**2))


def generate(seed: int) -> NurikabeGrid:
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise ValueError("seed must be an unsigned 32-bit integer")
    rng = Prng(seed)
    exact_calls_left = EXACT_WORK // EXACT_NODES
    for _ in range(CONSTRUCTION_ATTEMPTS):
        candidate = _candidate(rng)
        if candidate is None:
            continue
        grid, layout = candidate
        if not is_solution(grid, layout):
            raise NurikabeGenerationError("constructed Nurikabe layout violates its clues")
        if exact_calls_left < 1:
            break
        exact_calls_left -= 1
        try:
            result = solve(grid, max_nodes=EXACT_NODES)
        except NurikabeSearchLimitError:
            continue
        if len(result.solutions) == 1 and result.solutions[0] == layout:
            return grid
    raise NurikabeGenerationError(
        "bounded Nurikabe construction exhausted; certification inconclusive"
    )


def canonical_layout(size: int, cells: Sequence[int]) -> tuple[int, ...]:
    """Normalize a square clue grid or complete layout over its eight symmetries."""
    if len(cells) != size**2:
        raise ValueError("layout must contain size squared cells")
    variants: list[tuple[int, ...]] = []
    for reflected in (False, True):
        for turns in range(4):
            transformed = [0] * size**2
            for cell, value in enumerate(cells):
                row, col = divmod(cell, size)
                if reflected:
                    col = size - 1 - col
                for _ in range(turns):
                    row, col = col, size - 1 - row
                transformed[row * size + col] = value
            variants.append(tuple(transformed))
    return min(variants)
