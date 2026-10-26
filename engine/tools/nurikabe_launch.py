"""Certify the frozen daily Nurikabe launch batch and its preview boundary."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tools.nurikabe_preview import DATA as PREVIEWS
from tools.nurikabe_preview import load_previews

from queens_engine import load_puzzle, verify_replay
from queens_engine.nurikabe import NurikabeGrid, is_solution, solve
from queens_engine.nurikabe_gen import EXACT_NODES, SIDE, canonical_layout
from queens_engine.rulebook import NURIKABE_START

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/measurements/daily-nurikabe-launch.json"
PUZZLES = ROOT / "app/public/puzzles"


def certify(start: date, end: date, directory: Path = PUZZLES) -> dict[str, object]:
    if start != NURIKABE_START or end < start:
        raise ValueError("launch range must begin at the registered activation day")
    preview_layouts: set[tuple[int, ...]] = set()
    preview_clues: set[tuple[int, ...]] = set()
    for preview in load_previews(PREVIEWS):
        if preview.grid.size == SIDE:
            result = solve(preview.grid, max_nodes=EXACT_NODES)
            if len(result.solutions) != 1:
                raise ValueError("preview does not have an exhaustive uniqueness certificate")
            preview_layouts.add(canonical_layout(SIDE, result.solutions[0]))
            preview_clues.add(canonical_layout(SIDE, preview.grid.clues))
    layouts: set[tuple[int, ...]] = set()
    clues: set[tuple[int, ...]] = set()
    samples: list[dict[str, object]] = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        identifier = f"{day}-nurikabe"
        puzzle = load_puzzle(directory / f"{identifier}.json")
        if puzzle.id != identifier or not isinstance(puzzle.board, NurikabeGrid):
            raise ValueError("launch file has the wrong family or id")
        grid = puzzle.board
        verify_replay(puzzle)
        result = solve(grid, max_nodes=EXACT_NODES)
        if len(result.solutions) != 1 or not is_solution(grid, result.solutions[0]):
            raise ValueError(f"{identifier} lacks an exhaustive unique valid answer")
        layout = canonical_layout(SIDE, result.solutions[0])
        numbered = canonical_layout(SIDE, grid.clues)
        if layout in layouts | preview_layouts or numbered in clues | preview_clues:
            raise ValueError(f"{identifier} repeats a launch or preview board up to symmetry")
        layouts.add(layout)
        clues.add(numbered)
        samples.append(
            {
                "id": identifier,
                "seed": puzzle.seed,
                "generatorVersion": puzzle.generator_version,
                "size": grid.size,
                "clues": list(grid.clues),
                "solution": list(result.solutions[0]),
                "solutionCount": len(result.solutions),
                "nodes": result.nodes,
            }
        )
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "count": len(samples),
        "origin": "Original local deterministic solution-first construction, generator version 1.",
        "verification": (
            "Exhaustive uniqueness, independent complete-board rules, "
            "seed replay and eight-symmetry clue/layout diversity."
        ),
        "limits": (
            "No human difficulty rating, live hints or guarantee of solving without guessing."
        ),
        "encoding": (
            "Offline solutions use 0 for sea and 1 for land. "
            "Answers are not shipped in puzzle files."
        ),
        "maxNodes": EXACT_NODES,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true")
    parser.add_argument("--end", type=date.fromisoformat, help="last launch date when writing")
    args = parser.parse_args()
    if args.write_report:
        if args.end is None:
            parser.error("--write-report requires --end")
        report = certify(NURIKABE_START, args.end)
        REPORT.write_text(json.dumps(report, indent=2) + "\n")
    else:
        committed = cast(dict[str, object], json.loads(REPORT.read_text()))
        report = certify(
            date.fromisoformat(str(committed["start"])), date.fromisoformat(str(committed["end"]))
        )
        if report != committed:
            raise ValueError("daily Nurikabe launch certificate differs from its verified files")
    print(f"Verified {report['count']} daily Nurikabe boards and the frozen launch certificate")


if __name__ == "__main__":
    main()
