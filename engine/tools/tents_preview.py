"""Curated Tents preview construction and exact verification."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.tents import (
    MAX_SIDE,
    MIN_SIDE,
    SOLUTION_LIMIT,
    TENT_TARGETS,
    candidate,
    neighbours,
    pairable,
    solutions,
)
from queens_engine.tents import TentsGrid as Tents

__all__ = [
    "MAX_SIDE",
    "MIN_SIDE",
    "SOLUTION_LIMIT",
    "TENT_TARGETS",
    "Tents",
    "candidate",
    "neighbours",
    "pairable",
    "solutions",
]

# Recipe order preserves board IDs and saved attempts; append new playtests.
PREVIEW_RECIPES = (
    (8, 1),
    (8, 2),
    (8, 3),
    (8, 148),
    (8, 866),
    (8, 916),
    (10, 140),
    (10, 321),
    (10, 733),
)
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/tents-previews.json"
REPORT = ROOT / "docs/measurements/tents-preview.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--generate", action="store_true", help="Reproduce the curated 8x8 and 10x10 preview boards"
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
    for size, seed in PREVIEW_RECIPES:
        board = candidate(seed, size=size)
        if board is None:
            raise ValueError(f"Cannot construct preview seed {seed}")
        begin = perf_counter()
        answers = solutions(board)
        if len(answers) != 1:
            raise ValueError(f"Preview seed {seed} does not have one solution")
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
    DATA.write_text(json.dumps(boards, indent=2) + "\n")
    REPORT.write_text(
        json.dumps(
            {"samples": samples, "totalSeconds": round(perf_counter() - started, 6)}, indent=2
        )
        + "\n"
    )
    print(f"Constructed {len(boards)} unique Tents previews in {perf_counter() - started:.3f}s")


if __name__ == "__main__":
    main()
