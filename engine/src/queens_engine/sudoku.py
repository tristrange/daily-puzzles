"""Standard 9x9 Sudoku and exact search, independent of logical techniques."""

from __future__ import annotations

from dataclasses import dataclass

SIDE = 9
CELL_COUNT = SIDE * SIDE
SOLUTION_LIMIT = 2
ROWS = tuple(tuple(r * 9 + c for c in range(9)) for r in range(9))
COLUMNS = tuple(tuple(r * 9 + c for r in range(9)) for c in range(9))
BOXES = tuple(
    tuple((br * 3 + r) * 9 + bc * 3 + c for r in range(3) for c in range(3))
    for br in range(3)
    for bc in range(3)
)
UNITS = ROWS + COLUMNS + BOXES
PEERS = tuple(
    tuple(sorted({other for unit in UNITS if cell in unit for other in unit} - {cell}))
    for cell in range(81)
)
ALL = 511


@dataclass(frozen=True)
class SudokuGrid:
    givens: tuple[int, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "givens", tuple(self.givens))
        if len(self.givens) != CELL_COUNT or any(
            type(v) is not int or not 0 <= v <= SIDE for v in self.givens
        ):
            raise ValueError("givens must contain 81 integers from 0 to 9")
        for unit in UNITS:
            digits = [self.givens[cell] for cell in unit if self.givens[cell]]
            if len(set(digits)) != len(digits):
                raise ValueError("duplicate given in a row, column or box")


def is_solution(grid: SudokuGrid, cells: tuple[int, ...]) -> bool:
    return (
        len(cells) == CELL_COUNT
        and all(type(v) is int and 1 <= v <= SIDE for v in cells)
        and all(not v or cells[i] == v for i, v in enumerate(grid.givens))
        and all(len({cells[i] for i in unit}) == SIDE for unit in UNITS)
    )


class SudokuSearchLimitError(RuntimeError):
    """Inconclusive exact search, never a unique-solution certificate."""


@dataclass(frozen=True)
class SolveResult:
    solutions: tuple[tuple[int, ...], ...]
    nodes: int


def solve(grid: SudokuGrid, *, max_nodes: int = 200_000) -> SolveResult:
    if type(max_nodes) is not int or max_nodes < 0:
        raise ValueError("max_nodes must be a nonnegative integer")
    cells = list(grid.givens)
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    for cell, value in enumerate(cells):
        if value:
            r, c = divmod(cell, 9)
            bit = 1 << (value - 1)
            rows[r] |= bit
            cols[c] |= bit
            boxes[r // 3 * 3 + c // 3] |= bit
    answers: list[tuple[int, ...]] = []
    nodes = 0

    def visit() -> None:
        nonlocal nodes
        target, available = -1, 0
        for cell, value in enumerate(cells):
            if value:
                continue
            r, c = divmod(cell, 9)
            mask = ALL & ~(rows[r] | cols[c] | boxes[r // 3 * 3 + c // 3])
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
        box = r // 3 * 3 + c // 3
        while available and len(answers) < SOLUTION_LIMIT:
            if nodes >= max_nodes:
                raise SudokuSearchLimitError("exact Sudoku search exhausted its node budget")
            nodes += 1
            bit = available & -available
            available ^= bit
            cells[target] = bit.bit_length()
            rows[r] |= bit
            cols[c] |= bit
            boxes[box] |= bit
            visit()
            rows[r] ^= bit
            cols[c] ^= bit
            boxes[box] ^= bit
            cells[target] = 0

    visit()
    return SolveResult(tuple(answers), nodes)
