"""Trio v1: a fixed 9x9 sun/moon/star puzzle.

Exact line-pattern search does not use the candidate deduction engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from itertools import product
from typing import Literal

from .prng import Prng

SIDE = 9
CELL_COUNT = SIDE * SIDE
SYMBOLS = (1, 2, 3)
COUNT_PER_SYMBOL = SIDE // len(SYMBOLS)
MAX_RUN = 2
ALL_CANDIDATES = 0b111
ROWS = tuple(tuple(r * SIDE + c for c in range(SIDE)) for r in range(SIDE))
COLUMNS = tuple(tuple(r * SIDE + c for r in range(SIDE)) for c in range(SIDE))
LINES = ROWS + COLUMNS
WINDOWS = tuple(line[i : i + 3] for line in LINES for i in range(SIDE - 2))
Rule = Literal["row-count", "column-count", "no-three", "same", "different"]


class TrioSearchLimitError(RuntimeError):
    """The exact search is inconclusive, never evidence for uniqueness."""


class TrioContradictionError(ValueError):
    """Deductions reveal that this position cannot be completed."""


@dataclass(frozen=True)
class Relation:
    first: int
    second: int
    kind: Literal["same", "different"]

    def __post_init__(self) -> None:
        if any(type(cell) is not int for cell in (self.first, self.second)):
            raise ValueError("relation cells must be integer indices")
        if not 0 <= self.first < self.second < CELL_COUNT:
            raise ValueError("relation indices must be ordered and in range")
        r1, c1 = divmod(self.first, SIDE)
        r2, c2 = divmod(self.second, SIDE)
        if abs(r1 - r2) + abs(c1 - c2) != 1:
            raise ValueError("relation cells must be orthogonally adjacent")
        if self.kind not in ("same", "different"):
            raise ValueError("relation kind must be same or different")


@dataclass(frozen=True)
class TrioGrid:
    givens: tuple[int, ...]
    relations: tuple[Relation, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "givens", tuple(self.givens))
        object.__setattr__(self, "relations", tuple(self.relations))
        if len(self.givens) != CELL_COUNT or any(
            type(v) is not int or v not in (0, *SYMBOLS) for v in self.givens
        ):
            raise ValueError("givens must contain 81 integers from 0 to 3")
        if any(type(edge) is not Relation for edge in self.relations):
            raise ValueError("relations must contain Relation values")
        if len({(edge.first, edge.second) for edge in self.relations}) != len(self.relations):
            raise ValueError("a cell pair can have only one relation")


def is_solution(grid: TrioGrid, cells: tuple[int, ...]) -> bool:
    """Check all actual rules, including givens; no stored answer is consulted."""
    if len(cells) != CELL_COUNT or any(type(v) is not int or v not in SYMBOLS for v in cells):
        return False
    if any(given and cells[i] != given for i, given in enumerate(grid.givens)):
        return False
    if any(
        sum(cells[i] == symbol for i in line) != COUNT_PER_SYMBOL
        for line in LINES
        for symbol in SYMBOLS
    ):
        return False
    if any(len({cells[i] for i in window}) == 1 for window in WINDOWS):
        return False
    return all(
        (cells[edge.first] == cells[edge.second]) == (edge.kind == "same")
        for edge in grid.relations
    )


@cache
def _row_patterns() -> tuple[tuple[int, ...], ...]:
    return tuple(
        row
        for row in product(SYMBOLS, repeat=SIDE)
        if all(row.count(symbol) == COUNT_PER_SYMBOL for symbol in SYMBOLS)
        and all(not row[i] == row[i + 1] == row[i + 2] for i in range(SIDE - 2))
    )


@dataclass(frozen=True)
class SearchResult:
    solutions: tuple[tuple[int, ...], ...]
    line_attempts: int


def solve(grid: TrioGrid, *, max_attempts: int = 100_000) -> SearchResult:
    """Count up to two completions. One result means all alternatives were exhausted."""
    return _search(grid, 2, max_attempts)


def count_solutions(grid: TrioGrid, *, limit: int = 2) -> int:
    """Count up to `limit`; exhaustion raises instead of claiming uniqueness."""
    if type(limit) is not int or limit < 1:
        raise ValueError("limit must be a positive integer")
    return len(_search(grid, limit, 100_000).solutions)


def random_completion(prng: Prng, *, max_attempts: int = 100_000) -> tuple[int, ...]:
    """Draw a bounded construction answer, never a published puzzle."""
    return _search(TrioGrid((0,) * CELL_COUNT), 1, max_attempts, prng).solutions[0]


def _search(
    grid: TrioGrid, limit: int, max_attempts: int, prng: Prng | None = None
) -> SearchResult:
    if type(max_attempts) is not int or max_attempts < 0:
        raise ValueError("max_attempts must be a nonnegative integer")
    domains: list[tuple[tuple[int, ...], ...]] = []
    for line in LINES:
        edges = tuple(e for e in grid.relations if e.first in line and e.second in line)
        positions = tuple((line.index(e.first), line.index(e.second), e.kind) for e in edges)
        matching = tuple(
            pattern
            for pattern in _row_patterns()
            if all(
                not grid.givens[cell] or grid.givens[cell] == pattern[c]
                for c, cell in enumerate(line)
            )
            and all((pattern[a] == pattern[b]) == (kind == "same") for a, b, kind in positions)
        )
        domains.append(matching)
    results: list[tuple[int, ...]] = []
    attempts = 0

    def propagate(lines: list[tuple[tuple[int, ...], ...]]) -> bool:
        # Each candidate is already a complete, legal line. Intersect row/column
        # support at every crossing; this is independent of the cell-rule trace.
        while True:
            if any(not patterns for patterns in lines):
                return False
            supports: list[list[int]] = []
            for patterns in lines:
                masks = [0] * SIDE
                for pattern in patterns:
                    for c, symbol in enumerate(pattern):
                        masks[c] |= 1 << (symbol - 1)
                supports.append(masks)
            changed = False
            for i, line in enumerate(LINES):
                allowed = tuple(
                    supports[cell // SIDE][cell % SIDE] & supports[SIDE + cell % SIDE][cell // SIDE]
                    for cell in line
                )
                kept = tuple(
                    pattern
                    for pattern in lines[i]
                    if all(mask & (1 << (v - 1)) for mask, v in zip(allowed, pattern, strict=True))
                )
                changed |= len(kept) != len(lines[i])
                lines[i] = kept
            if not changed:
                return True

    def visit(lines: list[tuple[tuple[int, ...], ...]]) -> None:
        nonlocal attempts
        if not propagate(lines):
            return
        if all(len(patterns) == 1 for patterns in lines):
            cells = tuple(value for patterns in lines[:SIDE] for value in patterns[0])
            if not is_solution(grid, cells):
                raise AssertionError("line search returned an invalid completion")
            results.append(cells)
            return
        index = min((i for i, p in enumerate(lines) if len(p) > 1), key=lambda i: len(lines[i]))
        order = list(range(len(lines[index])))
        if prng is not None:
            order = prng.shuffled(order)
        for candidate in order:
            attempts += 1
            if attempts > max_attempts:
                raise TrioSearchLimitError(
                    f"search exceeded {max_attempts} candidate-line attempts"
                )
            branch = lines.copy()
            branch[index] = (lines[index][candidate],)
            visit(branch)
            if len(results) >= limit:
                return

    visit(domains)
    return SearchResult(tuple(results), attempts)


@dataclass(frozen=True)
class Deduction:
    cell: int
    before: int
    after: int
    rule: Rule
    group: tuple[int, ...]


@dataclass(frozen=True)
class LogicResult:
    candidates: tuple[int, ...]
    steps: tuple[Deduction, ...]

    @property
    def solved(self) -> bool:
        return all(mask.bit_count() == 1 for mask in self.candidates)

    @property
    def cells(self) -> tuple[int, ...]:
        """Unresolved cells remain zero; candidate masks are not guesses."""
        return tuple(mask.bit_length() if mask.bit_count() == 1 else 0 for mask in self.candidates)


def deduce(grid: TrioGrid) -> LogicResult:  # noqa: PLR0912 — keep the fixed-point rules together
    """Only direct count, no-three and relation deductions; stop instead of guessing."""
    candidates = [1 << (v - 1) if v else ALL_CANDIDATES for v in grid.givens]
    steps: list[Deduction] = []

    def restrict(cell: int, allowed: int, rule: Rule, group: tuple[int, ...]) -> None:
        before = candidates[cell]
        after = before & allowed
        if not after:
            raise TrioContradictionError(f"{rule} leaves cell {cell} without a candidate")
        if after != before:
            candidates[cell] = after
            steps.append(Deduction(cell, before, after, rule, group))

    while True:
        previous = len(steps)
        for index, line in enumerate(LINES):
            rule: Rule = "row-count" if index < SIDE else "column-count"
            for bit in (1, 2, 4):
                fixed = sum(candidates[cell] == bit for cell in line)
                possible = tuple(cell for cell in line if candidates[cell] & bit)
                if fixed > COUNT_PER_SYMBOL or len(possible) < COUNT_PER_SYMBOL:
                    raise TrioContradictionError(f"{rule} cannot contain three of each symbol")
                if fixed == COUNT_PER_SYMBOL:
                    for cell in possible:
                        if candidates[cell] != bit:
                            restrict(cell, ALL_CANDIDATES ^ bit, rule, line)
                elif len(possible) == COUNT_PER_SYMBOL:
                    for cell in possible:
                        restrict(cell, bit, rule, line)
        for window in WINDOWS:
            for bit in (1, 2, 4):
                fixed = tuple(cell for cell in window if candidates[cell] == bit)
                if len(fixed) > MAX_RUN:
                    raise TrioContradictionError("three consecutive identical symbols")
                if len(fixed) == MAX_RUN:
                    for cell in window:
                        if cell not in fixed:
                            restrict(cell, ALL_CANDIDATES ^ bit, "no-three", window)
        for edge in grid.relations:
            a, b = edge.first, edge.second
            group = (a, b)
            if edge.kind == "same":
                shared = candidates[a] & candidates[b]
                restrict(a, shared, "same", group)
                restrict(b, shared, "same", group)
            else:
                if candidates[a].bit_count() == 1:
                    restrict(b, ALL_CANDIDATES ^ candidates[a], "different", group)
                if candidates[b].bit_count() == 1:
                    restrict(a, ALL_CANDIDATES ^ candidates[b], "different", group)
        if len(steps) == previous:
            return LogicResult(tuple(candidates), tuple(steps))
