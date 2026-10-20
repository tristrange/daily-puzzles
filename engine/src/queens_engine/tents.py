"""Tents grids and bounded exact counting shared by previews and daily publishing."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations, pairwise

from .prng import Prng


class TentsSearchLimitError(RuntimeError):
    """A bounded search is inconclusive, never a proof of uniqueness."""


MAX_SIDE = 10
MIN_SIDE = 2
SOLUTION_LIMIT = 2
TENT_TARGETS = {8: 12, 10: 18}


def neighbours(size: int, cell: int, *, diagonal: bool = False) -> tuple[int, ...]:
    row, col = divmod(cell, size)
    return tuple(
        r * size + c
        for r in range(max(0, row - 1), min(size, row + 2))
        for c in range(max(0, col - 1), min(size, col + 2))
        if (r, c) != (row, col) and (diagonal or abs(r - row) + abs(c - col) == 1)
    )


@dataclass(frozen=True)
class TentsGrid:
    size: int
    trees: tuple[int, ...]
    rows: tuple[int, ...]
    cols: tuple[int, ...]

    def __post_init__(self) -> None:
        if (
            type(self.size) is not int
            or not MIN_SIDE <= self.size <= MAX_SIDE
            or not self.trees
            or len(set(self.trees)) != len(self.trees)
            or any(type(t) is not int or not 0 <= t < self.size**2 for t in self.trees)
            or len(self.rows) != self.size
            or len(self.cols) != self.size
            or any(type(n) is not int or not 0 <= n <= self.size for n in (*self.rows, *self.cols))
            or sum(self.rows) != len(self.trees)
            or sum(self.cols) != len(self.trees)
        ):
            raise ValueError("Invalid Tents board")

    @property
    def width(self) -> int:
        return self.size

    @property
    def height(self) -> int:
        return self.size

    @property
    def cell_count(self) -> int:
        return self.size**2


def pairable(size: int, trees: Sequence[int], tents: Sequence[int]) -> bool:
    """Can every supplied tent own a different neighbouring tree?"""
    owner: dict[int, int] = {}
    tree_set = set(trees)

    def assign(tent: int, seen: set[int]) -> bool:
        for tree in neighbours(size, tent):
            if tree not in tree_set or tree in seen:
                continue
            seen.add(tree)
            if tree not in owner or assign(owner[tree], seen):
                owner[tree] = tent
                return True
        return False

    return all(assign(tent, set()) for tent in tents)


def solutions(
    board: TentsGrid, *, budget: int = 100_000, limit: int = SOLUTION_LIMIT
) -> list[tuple[int, ...]]:
    """Enumerate bounded distinct placements; exhaustion is never a proof."""
    if type(limit) is not int or limit < 1:
        raise ValueError("solution limit must be a positive integer")
    size = board.size
    trees = set(board.trees)
    allowed = {cell for tree in trees for cell in neighbours(size, tree)} - trees
    patterns: list[list[tuple[int, ...]]] = []
    for row, count in enumerate(board.rows):
        cells = sorted(cell for cell in allowed if cell // size == row)
        patterns.append(
            [
                pattern
                for pattern in combinations(cells, count)
                if all(b - a > 1 for a, b in pairwise(pattern))
            ]
        )
    found: list[tuple[int, ...]] = []
    counts = [0] * size
    work = 0

    def visit(row: int, placed: tuple[int, ...], previous: tuple[int, ...]) -> None:
        nonlocal work
        if len(found) == limit:
            return
        if row == size:
            if tuple(counts) == board.cols and pairable(size, board.trees, placed):
                found.append(placed)
            return
        for pattern in patterns[row]:
            work += 1
            if work > budget:
                raise TentsSearchLimitError("Tents search budget exhausted")
            cols = {cell % size for cell in pattern}
            if any(abs(a % size - b % size) <= 1 for a in previous for b in pattern):
                continue
            after = [counts[c] + (c in cols) for c in range(size)]
            remaining_rows = size - row - 1
            if any(
                n > board.cols[c] or n + remaining_rows < board.cols[c] for c, n in enumerate(after)
            ):
                continue
            next_placed = (*placed, *pattern)
            if not pairable(size, board.trees, next_placed):
                continue
            counts[:] = after
            visit(row + 1, next_placed, pattern)
            for col in cols:
                counts[col] -= 1
            if len(found) == limit:
                return

    visit(0, (), ())
    return found


def candidate(seed: int, *, size: int = 8) -> TentsGrid | None:
    """One cheap construction attempt; the exact counter decides acceptance."""
    rng = Prng(seed)
    target = TENT_TARGETS[size]
    tents: list[int] = []
    blocked: set[int] = set()
    for cell in rng.shuffled(list(range(size**2))):
        if cell not in blocked:
            tents.append(cell)
            blocked.update((cell, *neighbours(size, cell, diagonal=True)))
        if len(tents) == target:
            break
    if len(tents) != target:
        return None
    trees: list[int] = []
    for tent in tents:
        options = [n for n in neighbours(size, tent) if n not in tents and n not in trees]
        if not options:
            return None
        trees.append(options[rng.below(len(options))])
    return TentsGrid(
        size,
        tuple(sorted(trees)),
        tuple(sum(t // size == r for t in tents) for r in range(size)),
        tuple(sum(t % size == c for t in tents) for c in range(size)),
    )
