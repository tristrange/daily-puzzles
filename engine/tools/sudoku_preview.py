"""Construct and certify original Sudoku previews; no production registration."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from time import perf_counter
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.prng import Prng
from queens_engine.sudoku import SudokuGrid, SudokuSearchLimitError, is_solution, solve
from queens_engine.sudoku_deduce import LEVELS, Level, deduce

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/sudoku-previews.json"
REPORT = ROOT / "docs/measurements/sudoku-preview.json"
MAX_ATTEMPTS = 256


def certify(grid: SudokuGrid, level: Level) -> dict[str, object]:
    exact = solve(grid)
    if len(exact.solutions) != 1:
        raise ValueError("preview must have exactly one solution")
    result = deduce(grid, level)
    if (
        not result.solved
        or result.cells != exact.solutions[0]
        or not is_solution(grid, result.cells)
    ):
        raise ValueError("preview does not finish through its supported logic")
    tier = LEVELS.index(level)
    if tier and deduce(grid, LEVELS[tier - 1]).solved:
        raise ValueError("preview does not require its advertised level")
    for index, step in enumerate(result.steps):
        if not step.after & (1 << (exact.solutions[0][step.cell] - 1)):
            raise AssertionError("logical restriction removed the independently verified answer")
        if not step.after or step.after == step.before or step.after & step.before != step.after:
            raise AssertionError("trace is not a strict candidate restriction")
        if any(dependency >= index or dependency < 0 for dependency in step.dependencies):
            raise AssertionError("trace dependency is not an earlier step")
    return {
        "level": level,
        "solution": exact.solutions[0],
        "nodes": exact.nodes,
        "givens": sum(bool(v) for v in grid.givens),
        "rules": dict(Counter(step.rule for step in result.steps)),
        "trace": [asdict(step) for step in result.steps],
    }


def generate(seed: int, level: Level) -> SudokuGrid | None:
    prng = Prng(seed)
    rows = [band * 3 + row for band in prng.shuffled(range(3)) for row in prng.shuffled(range(3))]
    cols = [stack * 3 + col for stack in prng.shuffled(range(3)) for col in prng.shuffled(range(3))]
    digits = prng.shuffled(range(1, 10))
    cells = [digits[(r * 3 + r // 3 + c) % 9] for r in rows for c in cols]
    # Clue targets sample different positions; certificates, never counts, assign the level.
    target = {"easy": 36, "medium": 28, "hard": 24}[level]
    remaining = 81
    for cell in prng.shuffled(range(81)):
        previous = cells[cell]
        cells[cell] = 0
        if len(solve(SudokuGrid(tuple(cells))).solutions) != 1:
            cells[cell] = previous
        else:
            remaining -= 1
        if remaining <= target:
            break
    grid = SudokuGrid(tuple(cells))
    if not deduce(grid, level).solved:
        return None
    tier = LEVELS.index(level)
    return None if tier and deduce(grid, LEVELS[tier - 1]).solved else grid


def verify(raw: object) -> list[dict[str, object]]:
    if not isinstance(raw, list):
        raise ValueError("expected exactly three preview boards")
    entries = cast(list[object], raw)
    if len(entries) != len(LEVELS):
        raise ValueError("expected exactly three preview boards")
    certificates: list[dict[str, object]] = []
    for index, (item, level) in enumerate(zip(entries, LEVELS, strict=True), 1):
        if not isinstance(item, dict):
            raise ValueError("invalid Sudoku preview entry")
        item = cast(dict[str, object], item)
        if (
            set(item) != {"id", "level", "givens"}
            or item.get("id") != f"sudoku-preview-{index}"
            or item.get("level") != level
            or not isinstance(item.get("givens"), list)
        ):
            raise ValueError("invalid Sudoku preview identity or fields")
        certificates.append(certify(SudokuGrid(tuple(cast(list[int], item["givens"]))), level))
    return certificates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", action="store_true")
    args = parser.parse_args()
    if not args.generate:
        verify(json.loads(DATA.read_text()))
        print("Verified three Sudoku previews and their technique bands")
        return
    boards: list[dict[str, object]] = []
    samples: list[dict[str, object]] = []
    for index, level in enumerate(LEVELS):
        started = perf_counter()
        exhausted = 0
        for offset in range(MAX_ATTEMPTS):
            seed = index * 10_000 + offset
            try:
                grid = generate(seed, level)
            except SudokuSearchLimitError:
                exhausted += 1
                continue
            if grid is None:
                continue
            certificate = certify(grid, level)
            boards.append(
                {"id": f"sudoku-preview-{index + 1}", "level": level, "givens": grid.givens}
            )
            samples.append(
                {
                    "seed": seed,
                    "attempts": offset + 1,
                    "exhausted": exhausted,
                    "seconds": round(perf_counter() - started, 6),
                    **certificate,
                }
            )
            print(f"Certified {level}: seed {seed}, {offset + 1} attempts", flush=True)
            break
        else:
            raise RuntimeError(f"No certified {level} preview in {MAX_ATTEMPTS} attempts")
    # Only replace artifacts after the entire batch has a certificate.
    DATA.write_text(json.dumps(boards, indent=2) + "\n")
    REPORT.write_text(
        json.dumps(
            {
                "purpose": "Preview certificates; answers are offline review data",
                "samples": samples,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
