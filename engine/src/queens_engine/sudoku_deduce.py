"""Human-style Sudoku restrictions; exact search never proves a step here."""

from __future__ import annotations

from dataclasses import dataclass, replace
from itertools import combinations
from typing import Literal

from .sudoku import ALL, CELL_COUNT, COLUMNS, PEERS, ROWS, UNITS, SudokuGrid, is_solution

Level = Literal["easy", "medium", "hard"]
PAIR = 2
LINE_COUNT = len(ROWS) + len(COLUMNS)
LEVELS: tuple[Level, ...] = ("easy", "medium", "hard")


class SudokuContradictionError(ValueError):
    """A digit has no legal position, or a cell has no candidate."""


@dataclass(frozen=True)
class Step:
    cell: int
    before: int
    after: int
    rule: str
    group: tuple[int, ...]
    dependencies: tuple[int, ...] = ()


@dataclass(frozen=True)
class DeductionResult:
    cells: tuple[int, ...]
    candidates: tuple[int, ...]
    steps: tuple[Step, ...]
    solved: bool


def single(mask: int) -> bool:
    return mask > 0 and mask & (mask - 1) == 0


# Ordered scan keeps the first proof deterministic in both language ports.
def next_step(candidates: tuple[int, ...], level: Level) -> Step | None:  # noqa: PLR0911, PLR0912, PLR0915
    if level not in LEVELS:
        raise ValueError("unknown Sudoku level")
    if len(candidates) != CELL_COUNT or any(
        type(m) is not int or not 0 < m <= ALL for m in candidates
    ):
        raise SudokuContradictionError("invalid or empty candidate domain")
    for unit in UNITS:
        fixed = [candidates[i] for i in unit if single(candidates[i])]
        if len(fixed) != len(set(fixed)) or any(
            not any(candidates[i] & (1 << digit) for i in unit) for digit in range(9)
        ):
            raise SudokuContradictionError("a unit cannot contain each digit once")

    def restrict(cell: int, allowed: int, rule: str, group: tuple[int, ...]) -> Step | None:
        before = candidates[cell]
        after = before & allowed
        if not after:
            raise SudokuContradictionError("a cell has no remaining digit")
        return Step(cell, before, after, rule, group) if after != before else None

    for cell, mask in enumerate(candidates):
        if single(mask):
            continue
        fixed = tuple(i for i in PEERS[cell] if single(candidates[i]))
        used = 0
        for peer in fixed:
            used |= candidates[peer]
        step = restrict(cell, ALL ^ used, "naked-single" if single(mask & ~used) else "peer", fixed)
        if step:
            return step
    for unit in UNITS:
        for digit in range(9):
            bit = 1 << digit
            places = tuple(i for i in unit if candidates[i] & bit)
            if len(places) == 1:
                step = restrict(places[0], bit, "hidden-single", unit)
                if step:
                    return step
    if level == "easy":
        return None
    for source_index, source in enumerate(UNITS):
        for digit in range(9):
            bit = 1 << digit
            places = tuple(i for i in source if candidates[i] & bit)
            if len(places) < PAIR:
                continue
            for dest_index, dest in enumerate(UNITS):
                if (source_index < LINE_COUNT) == (dest_index < LINE_COUNT) or not all(
                    i in dest for i in places
                ):
                    continue
                for cell in dest:
                    if cell not in source:
                        step = restrict(cell, ALL ^ bit, "locked-candidate", source)
                        if step:
                            return step
    for size in range(2, 4 if level == "hard" else 3):
        name = "pair" if size == PAIR else "triple"
        for unit in UNITS:
            open_cells = tuple(i for i in unit if 1 < candidates[i].bit_count() <= size)
            for selected in combinations(open_cells, size):
                union = 0
                for cell in selected:
                    union |= candidates[cell]
                if union.bit_count() != size:
                    continue
                for cell in unit:
                    if cell not in selected:
                        step = restrict(cell, ALL ^ union, f"naked-{name}", selected)
                        if step:
                            return step
            for digits in combinations(range(9), size):
                mask = sum(1 << digit for digit in digits)
                places = tuple(i for i in unit if candidates[i] & mask)
                if len(places) != size:
                    continue
                for cell in places:
                    step = restrict(cell, mask, f"hidden-{name}", unit)
                    if step:
                        return step
    if level == "hard":
        for lines in (ROWS, COLUMNS):
            for digit in range(9):
                bit = 1 << digit
                eligible = [
                    (
                        line,
                        tuple(offset for offset, cell in enumerate(line) if candidates[cell] & bit),
                    )
                    for line in lines
                ]
                for (first, a), (second, b) in combinations(eligible, 2):
                    if len(a) != PAIR or a != b:
                        continue
                    for line in lines:
                        if line in (first, second):
                            continue
                        for offset in a:
                            step = restrict(line[offset], ALL ^ bit, "x-wing", first + second)
                            if step:
                                return step
    return None


def deduce(grid: SudokuGrid, level: Level) -> DeductionResult:
    masks = [1 << (v - 1) if v else ALL for v in grid.givens]
    steps: list[Step] = []
    latest = [-1] * 81
    while step := next_step(tuple(masks), level):
        dependencies = tuple(
            sorted({latest[i] for i in (*step.group, step.cell) if latest[i] >= 0})
        )
        steps.append(replace(step, dependencies=dependencies))
        latest[step.cell] = len(steps) - 1
        masks[step.cell] = step.after
    cells = tuple(mask.bit_length() if single(mask) else 0 for mask in masks)
    return DeductionResult(cells, tuple(masks), tuple(steps), is_solution(grid, cells))
