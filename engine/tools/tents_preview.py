"""Isolated Tents preview construction and exact verification; no daily recipe yet."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations, pairwise
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.prng import Prng

MAX_SIDE = 8
MIN_SIDE = 2
SOLUTION_LIMIT = 2
TENT_TARGET = 12
PREVIEW_COUNT = 3
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/tents-previews.json"
REPORT = ROOT / "docs/measurements/tents-preview.json"


def neighbours(size: int, cell: int, *, diagonal: bool = False) -> tuple[int, ...]:
    row, col = divmod(cell, size)
    return tuple(
        r * size + c
        for r in range(max(0, row - 1), min(size, row + 2))
        for c in range(max(0, col - 1), min(size, col + 2))
        if (r, c) != (row, col) and (diagonal or abs(r - row) + abs(c - col) == 1)
    )


@dataclass(frozen=True)
class Tents:
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


def solutions(board: Tents, *, budget: int = 100_000) -> list[tuple[int, ...]]:
    """Enumerate at most two distinct placements; exhaustion is never a proof."""
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
        if len(found) == SOLUTION_LIMIT:
            return
        if row == size:
            if tuple(counts) == board.cols and pairable(size, board.trees, placed):
                found.append(placed)
            return
        for pattern in patterns[row]:
            work += 1
            if work > budget:
                raise RuntimeError("Tents search budget exhausted")
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
            if len(found) == SOLUTION_LIMIT:
                return

    visit(0, (), ())
    return found


def candidate(seed: int) -> Tents | None:
    """One cheap construction attempt; the exact counter decides acceptance."""
    rng = Prng(seed)
    tents: list[int] = []
    blocked: set[int] = set()
    for cell in rng.shuffled(list(range(MAX_SIDE**2))):
        if cell not in blocked:
            tents.append(cell)
            blocked.update((cell, *neighbours(MAX_SIDE, cell, diagonal=True)))
        if len(tents) == TENT_TARGET:
            break
    trees: list[int] = []
    for tent in tents:
        options = [n for n in neighbours(MAX_SIDE, tent) if n not in tents and n not in trees]
        if not options:
            return None
        trees.append(options[rng.below(len(options))])
    return Tents(
        MAX_SIDE,
        tuple(sorted(trees)),
        tuple(sum(t // MAX_SIDE == r for t in tents) for r in range(MAX_SIDE)),
        tuple(sum(t % MAX_SIDE == c for t in tents) for c in range(MAX_SIDE)),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--generate", action="store_true", help="Replace the unpublished preview batch"
    )
    args = parser.parse_args()
    started = perf_counter()
    if not args.generate:
        raw = json.loads(DATA.read_text())
        for item in raw:
            board = Tents(
                item["size"], tuple(item["trees"]), tuple(item["rowClues"]), tuple(item["colClues"])
            )
            if len(solutions(board)) != 1:
                raise ValueError(f"{item['id']} does not have one solution")
        print(f"Verified {len(raw)} Tents previews in {perf_counter() - started:.3f}s")
        return
    boards: list[dict[str, object]] = []
    samples: list[dict[str, object]] = []
    for seed in range(2000):
        board = candidate(seed)
        if board is None:
            continue
        begin = perf_counter()
        try:
            answers = solutions(board)
        except RuntimeError:
            continue
        if len(answers) != 1:
            continue
        generated: dict[str, object] = {
            "id": f"tents-preview-{len(boards) + 1}",
            "size": board.size,
            "trees": board.trees,
            "rowClues": board.rows,
            "colClues": board.cols,
        }
        boards.append(generated)
        samples.append(
            {
                "id": generated["id"],
                "seed": seed,
                "solution": answers[0],
                "verifySeconds": round(perf_counter() - begin, 6),
            }
        )
        if len(boards) == PREVIEW_COUNT:
            break
    if len(boards) != PREVIEW_COUNT:
        raise RuntimeError("Could not construct three unique previews in 2000 attempts")
    DATA.write_text(json.dumps(boards, indent=2) + "\n")
    REPORT.write_text(
        json.dumps(
            {"samples": samples, "totalSeconds": round(perf_counter() - started, 6)}, indent=2
        )
        + "\n"
    )
    print(f"Constructed three unique Tents previews in {perf_counter() - started:.3f}s")


if __name__ == "__main__":
    main()
