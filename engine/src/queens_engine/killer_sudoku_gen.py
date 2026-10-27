"""Construct Killer Sudoku candidates and certify their human-solving tier."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from itertools import permutations

from .killer_sudoku import Cage, KillerGrid, adjacent, is_solution, solve
from .prng import Prng
from .sudoku import ALL, PEERS, UNITS, Level, SudokuSearchLimitError

GENERATOR_VERSION = 1
MAX_ATTEMPTS = 256
MAX_CAGE_SIZE = 5
MEDIUM_HIDDEN_MAX = 2
HARD_HIDDEN_MIN = 3


@dataclass(frozen=True)
class LogicResult:
    cells: tuple[int, ...]
    naked: int
    hidden: int

    @property
    def solved(self) -> bool:
        return all(self.cells)


@cache
def _permutations(size: int, total: int) -> tuple[tuple[int, ...], ...]:
    return tuple(digits for digits in permutations(range(1, 10), size) if sum(digits) == total)


def deduce(grid: KillerGrid, *, hidden_singles: bool = True) -> LogicResult:
    """Repeat the cage and singles deductions available in the game's hints."""
    cells = list(grid.givens)
    naked = hidden = 0
    while True:
        possible = [0] * 81
        for cage in grid.cages:
            allowed = [
                ALL & ~sum(1 << (digit - 1) for digit in {cells[p] for p in PEERS[cell]} if digit)
                for cell in cage.cells
            ]
            # A placed digit must remain available to its own cage assignment.
            allowed = [
                (1 << (cells[cell] - 1)) if cells[cell] else mask
                for cell, mask in zip(cage.cells, allowed, strict=True)
            ]
            for digits in _permutations(len(cage.cells), cage.total):
                if all(
                    mask & (1 << (digit - 1)) for mask, digit in zip(allowed, digits, strict=True)
                ):
                    for cell, digit in zip(cage.cells, digits, strict=True):
                        possible[cell] |= 1 << (digit - 1)
        target = next((i for i in range(81) if not cells[i] and possible[i].bit_count() == 1), None)
        if target is not None:
            cells[target] = possible[target].bit_length()
            naked += 1
            continue
        if hidden_singles:
            move = next(
                (
                    (cell, digit)
                    for unit in UNITS
                    for digit in range(1, 10)
                    if digit not in (cells[i] for i in unit)
                    for matches in (
                        [i for i in unit if not cells[i] and possible[i] & (1 << (digit - 1))],
                    )
                    if len(matches) == 1
                    for cell in matches
                ),
                None,
            )
            if move:
                cells[move[0]] = move[1]
                hidden += 1
                continue
        return LogicResult(tuple(cells), naked, hidden)


def candidate(seed: int, level: Level) -> KillerGrid | None:
    rng = Prng(seed)
    rows = [band * 3 + row for band in rng.shuffled(range(3)) for row in rng.shuffled(range(3))]
    cols = [stack * 3 + col for stack in rng.shuffled(range(3)) for col in rng.shuffled(range(3))]
    digits = rng.shuffled(range(1, 10))
    solution = tuple(digits[(r * 3 + r // 3 + c) % 9] for r in rows for c in cols)
    remaining = set(range(81))
    groups: list[list[int]] = []
    while remaining:
        cell = rng.shuffled(sorted(remaining))[0]
        remaining.remove(cell)
        cells = [cell]
        wanted = rng.shuffled((2, 2, 2, 3, 3, 3, 4))[0]
        while len(cells) < wanted:
            options = [
                other
                for other in sorted(remaining)
                if solution[other] not in {solution[c] for c in cells}
                and any(adjacent(other, c) for c in cells)
            ]
            if not options:
                break
            cell = rng.shuffled(options)[0]
            remaining.remove(cell)
            cells.append(cell)
        groups.append(cells)
    for cells in groups[:]:
        if len(cells) != 1:
            continue
        cell = cells[0]
        options = [
            other
            for other in groups
            if other is not cells
            and len(other) < MAX_CAGE_SIZE
            and solution[cell] not in {solution[c] for c in other}
            and any(adjacent(cell, c) for c in other)
        ]
        if options:
            options[rng.shuffled(range(len(options)))[0]].append(cell)
            groups.remove(cells)
    cages = tuple(
        sorted(
            (Cage(sum(solution[c] for c in cells), tuple(sorted(cells))) for cells in groups),
            key=lambda cage: cage.cells[0],
        )
    )
    givens = [0] * 81
    # Easy teaches cage combinations; other levels permit hidden singles and less help.
    max_givens = {"easy": 20, "medium": 12, "hard": 8}[level]
    for _ in range(max_givens + 1):
        grid = KillerGrid(tuple(givens), cages, level)
        result = deduce(grid, hidden_singles=level != "easy")
        if result.cells == solution:
            if (level == "medium" and not 1 <= result.hidden <= MEDIUM_HIDDEN_MAX) or (
                level == "hard" and result.hidden < HARD_HIDDEN_MIN
            ):
                return None
            return grid
        candidates = [i for i in range(81) if not result.cells[i] and not givens[i]]
        if not candidates:
            return None
        chosen = rng.shuffled(candidates)[0]
        givens[chosen] = solution[chosen]
    return None


def certify(grid: KillerGrid) -> LogicResult:
    exact = solve(grid)
    if len(exact.solutions) != 1 or not is_solution(grid, exact.solutions[0]):
        raise ValueError("Killer Sudoku must have one exhaustively verified solution")
    result = deduce(grid, hidden_singles=grid.level != "easy")
    if result.cells != exact.solutions[0]:
        raise ValueError("Killer Sudoku must be solvable with supported hints")
    if (grid.level == "medium" and not 1 <= result.hidden <= MEDIUM_HIDDEN_MAX) or (
        grid.level == "hard" and result.hidden < HARD_HIDDEN_MIN
    ):
        raise ValueError("Killer Sudoku does not meet its difficulty tier")
    return result


def generate(
    seed: int, level: Level, *, max_attempts: int = MAX_ATTEMPTS
) -> tuple[int, KillerGrid]:
    if type(seed) is not int or not 0 <= seed < 2**32 or level not in ("easy", "medium", "hard"):
        raise ValueError("invalid Killer Sudoku seed or level")
    for offset in range(max_attempts):
        actual = (seed + offset) % 2**32
        grid = candidate(actual, level)
        if grid is not None:
            try:
                certify(grid)
            except SudokuSearchLimitError:
                continue
            return actual, grid
    raise ValueError("no certified Killer Sudoku in generation budget")
