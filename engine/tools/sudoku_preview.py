"""Construct and certify original Sudoku previews; no production registration."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from time import perf_counter
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.sudoku import SudokuGrid, SudokuSearchLimitError
from queens_engine.sudoku_deduce import LEVELS
from queens_engine.sudoku_gen import candidate as generate
from queens_engine.sudoku_gen import certify

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/sudoku-previews.json"
REPORT = ROOT / "docs/measurements/sudoku-preview.json"
MAX_ATTEMPTS = 256


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
