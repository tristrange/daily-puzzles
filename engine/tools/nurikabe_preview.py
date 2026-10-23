"""Certify the original Nurikabe preview catalog without shipping its answers."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.nurikabe import NurikabeGrid, is_solution, solve

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/nurikabe-previews.json"
REPORT = ROOT / "docs/measurements/nurikabe-preview.json"
PREVIEW_SIZES = (5, 7, 7)
MAX_NODES = 200_000


@dataclass(frozen=True)
class PreviewBoard:
    id: str
    grid: NurikabeGrid


def load_previews(path: Path) -> tuple[PreviewBoard, ...]:
    raw: object = json.loads(path.read_text())
    if not isinstance(raw, list):
        raise ValueError("Preview catalog must contain exactly three boards")
    catalog = cast(list[object], raw)
    if len(catalog) != len(PREVIEW_SIZES):
        raise ValueError("Preview catalog must contain exactly three boards")
    boards: list[PreviewBoard] = []
    for index, item in enumerate(catalog):
        if not isinstance(item, dict):
            raise ValueError("Preview fields must be exactly id, size and clues")
        fields = cast(dict[str, object], item)
        if set(fields) != {"id", "size", "clues"}:
            raise ValueError("Preview fields must be exactly id, size and clues")
        board_id = f"nurikabe-preview-{index + 1}"
        size, clues = fields["size"], fields["clues"]
        if fields["id"] != board_id or type(size) is not int or size != PREVIEW_SIZES[index]:
            raise ValueError("Preview IDs and board sizes must preserve their catalog order")
        if not isinstance(clues, list) or any(
            type(value) is not int for value in cast(list[object], clues)
        ):
            raise ValueError("Preview clues must be an array of integers")
        grid = NurikabeGrid(size, tuple(cast(list[int], clues)))
        if any(board.grid == grid for board in boards):
            raise ValueError("Preview boards must be distinct")
        boards.append(PreviewBoard(board_id, grid))
    return tuple(boards)


def certify_previews(
    boards: tuple[PreviewBoard, ...], *, max_nodes: int = MAX_NODES
) -> dict[str, object]:
    samples: list[dict[str, object]] = []
    for board in boards:
        result = solve(board.grid, max_nodes=max_nodes)
        if len(result.solutions) != 1 or not is_solution(board.grid, result.solutions[0]):
            raise ValueError(f"{board.id} does not have exactly one valid solution")
        samples.append(
            {
                "id": board.id,
                "size": board.grid.size,
                "clues": list(board.grid.clues),
                "solution": list(result.solutions[0]),
                "solutionCount": len(result.solutions),
                "nodes": result.nodes,
            }
        )
    return {
        "origin": "Original local boards. The 5x5 introduction preserves the first engine fixture.",
        "encoding": "Solutions use 0 for sea and 1 for land.",
        "verification": "Exhaustive uniqueness within the exact solver work budget.",
        "limits": "No human difficulty rating or guarantee of solving without guessing.",
        "maxNodes": max_nodes,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-report", action="store_true", help="Refresh the offline certificate"
    )
    args = parser.parse_args()
    report = certify_previews(load_previews(DATA))
    if args.write_report:
        REPORT.write_text(json.dumps(report, indent=2) + "\n")
    else:
        committed: object = json.loads(REPORT.read_text())
        if json.dumps(committed, sort_keys=True) != json.dumps(report, sort_keys=True):
            raise ValueError("Preview certificate does not match the verified catalog")
    print(f"Verified {len(PREVIEW_SIZES)} original Nurikabe previews and their offline certificate")


if __name__ == "__main__":
    main()
