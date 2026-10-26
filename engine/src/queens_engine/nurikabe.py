from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

MIN_SIDE = 2
MAX_SIDE = 10
SEA = 0
LAND = 1
SOLUTION_LIMIT = 2


@dataclass(frozen=True)
class NurikabeGrid:
    size: int
    clues: tuple[int, ...]

    def __post_init__(self) -> None:
        if type(self.size) is not int or not MIN_SIDE <= self.size <= MAX_SIDE:
            raise ValueError("size must be an integer from 2 to 10")
        object.__setattr__(self, "clues", tuple(self.clues))
        if (
            len(self.clues) != self.size**2
            or any(type(value) is not int or not 0 <= value <= self.size**2 for value in self.clues)
            or not any(self.clues)
        ):
            raise ValueError("clues must contain size squared integers and at least one number")

    @property
    def width(self) -> int:
        return self.size

    @property
    def height(self) -> int:
        return self.size

    @property
    def cell_count(self) -> int:
        return self.size**2


def _neighbours(size: int, cell: int) -> tuple[int, ...]:
    row, col = divmod(cell, size)
    return tuple(
        r * size + c
        for r, c in ((row - 1, col), (row, col - 1), (row, col + 1), (row + 1, col))
        if 0 <= r < size and 0 <= c < size
    )


def is_solution(grid: NurikabeGrid, cells: tuple[int, ...]) -> bool:
    """Check a complete binary board without consulting search or island candidates."""
    if (
        len(cells) != grid.size**2
        or any(type(value) is not int or value not in (SEA, LAND) for value in cells)
        or any(clue and cells[cell] != LAND for cell, clue in enumerate(grid.clues))
    ):
        return False
    remaining = {cell for cell, value in enumerate(cells) if value == LAND}
    while remaining:
        component = {remaining.pop()}
        pending = list(component)
        while pending:
            for neighbour in _neighbours(grid.size, pending.pop()):
                if neighbour in remaining:
                    remaining.remove(neighbour)
                    component.add(neighbour)
                    pending.append(neighbour)
        clues = [grid.clues[cell] for cell in component if grid.clues[cell]]
        if len(clues) != 1 or clues[0] != len(component):
            return False
    sea = {cell for cell, value in enumerate(cells) if value == SEA}
    if not sea:
        return False
    pending = [sea.pop()]
    while pending:
        for neighbour in _neighbours(grid.size, pending.pop()):
            if neighbour in sea:
                sea.remove(neighbour)
                pending.append(neighbour)
    return not sea and all(
        any(cells[cell] == LAND for cell in (top, top + 1, top + grid.size, top + grid.size + 1))
        for row in range(grid.size - 1)
        for col in range(grid.size - 1)
        for top in (row * grid.size + col,)
    )


class NurikabeSearchLimitError(RuntimeError):
    """Inconclusive exact search, even if one answer has already been found."""


@dataclass(frozen=True)
class SolveResult:
    solutions: tuple[tuple[int, ...], ...]
    nodes: int


def _boundary(mask: int, neighbours: tuple[int, ...]) -> int:
    result = mask
    while mask:
        bit = mask & -mask
        mask ^= bit
        result |= neighbours[bit.bit_length() - 1]
    return result


def _island_shapes(
    grid: NurikabeGrid,
    clue: int,
    clue_mask: int,
    neighbours: tuple[int, ...],
    charge: Callable[[], None],
) -> tuple[tuple[int, int], ...]:
    target = grid.clues[clue]
    allowed = ((1 << grid.size**2) - 1) & ~_boundary(clue_mask ^ (1 << clue), neighbours)
    seen: set[int] = set()
    shapes: list[tuple[int, int]] = []

    def grow(mask: int, frontier: int) -> None:
        charge()
        if mask in seen:
            return
        seen.add(mask)
        if mask.bit_count() == target:
            shapes.append((mask, _boundary(mask, neighbours)))
            return
        while frontier:
            bit = frontier & -frontier
            frontier ^= bit
            after = mask | bit
            grow(after, _boundary(after, neighbours) & allowed & ~after)

    grow(1 << clue, neighbours[clue] & allowed)
    return tuple(sorted(shapes))


def solve(grid: NurikabeGrid, *, max_nodes: int = 200_000) -> SolveResult:
    """Count up to two distinct answers or raise when the shared work budget expires.

    One node covers root entry, each island-growth invocation including revisits,
    or one candidate compatibility inspection. Each operation examines at most
    size squared cells. A single returned answer certifies exhaustive uniqueness.
    """
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    nodes = 0

    def charge() -> None:
        nonlocal nodes
        if nodes >= max_nodes:
            raise NurikabeSearchLimitError("Nurikabe search budget exhausted")
        nodes += 1

    charge()
    cell_count = grid.size**2
    neighbours = tuple(
        sum(1 << other for other in _neighbours(grid.size, cell)) for cell in range(cell_count)
    )
    numbered = tuple(cell for cell, clue in enumerate(grid.clues) if clue)
    clue_mask = sum(1 << cell for cell in numbered)
    if sum(grid.clues) >= cell_count or any(neighbours[cell] & clue_mask for cell in numbered):
        return SolveResult((), nodes)

    candidates: list[tuple[tuple[int, int], ...]] = []
    for clue in numbered:
        shapes = _island_shapes(grid, clue, clue_mask, neighbours, charge)
        if not shapes:
            return SolveResult((), nodes)
        candidates.append(shapes)

    answers: list[tuple[int, ...]] = []

    def visit(index: int, occupied: int, blocked: int) -> None:
        if index == len(candidates):
            answer = tuple((occupied >> cell) & 1 for cell in range(cell_count))
            if is_solution(grid, answer):
                answers.append(answer)
            return
        for mask, halo in candidates[index]:
            charge()
            if mask & blocked:
                continue
            visit(index + 1, occupied | mask, blocked | halo)
            if len(answers) == SOLUTION_LIMIT:
                return

    visit(0, 0, 0)
    return SolveResult(tuple(answers), nodes)
