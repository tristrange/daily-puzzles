"""Certify the twelve frozen Star Battle positions without searching for lesson content."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Literal, TypedDict, cast

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.board import Board, PuzzleType
from queens_engine.deduce import first_forced_move
from queens_engine.solver import count_solutions, iter_solutions

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/src/data/star-battle-lessons.json"
REPORT = ROOT / "docs/measurements/star-battle-lessons.json"
TECHNIQUES = ("last-space", "fill", "intersection", "subset")
EXERCISE_COUNT = 3
MIN_SUBSET = 2
KINDS = ("region", "row", "column")
type Kind = Literal["region", "row", "column"]


class Geometry(TypedDict):
    size: int
    regions: list[int]
    regionCapacity: list[int]


class Move(TypedDict):
    cell: int
    action: Literal["queen", "x"]
    rule: str


class Group(TypedDict):
    kind: Kind
    index: int
    need: int
    candidates: list[int]


class Witness(TypedDict):
    sources: list[Group]
    homes: list[Group]


class Exercise(TypedDict):
    id: str
    source: str
    baselineIndex: int
    board: Geometry
    queens: list[int]
    marks: list[int]
    expected: Move
    cue: str
    witness: Witness


class Technique(TypedDict):
    id: str
    title: str
    stage: str
    introduction: str
    exercises: list[Exercise]


def object_schema(properties: dict[str, object]) -> dict[str, object]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


INTEGER = {"type": "integer", "minimum": 0}
TEXT = {"type": "string", "minLength": 1}
CELLS = {"type": "array", "items": INTEGER, "uniqueItems": True}
GROUP = object_schema(
    {"kind": {"enum": list(KINDS)}, "index": INTEGER, "need": INTEGER, "candidates": CELLS}
)
GEOMETRY = object_schema(
    {
        "size": INTEGER,
        "regions": {"type": "array", "items": INTEGER},
        "regionCapacity": {"type": "array", "items": INTEGER},
    }
)
EXERCISE = object_schema(
    {
        "id": TEXT,
        "source": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}-star$"},
        "baselineIndex": INTEGER,
        "board": GEOMETRY,
        "queens": CELLS,
        "marks": CELLS,
        "expected": object_schema(
            {
                "cell": INTEGER,
                "action": {"enum": ["queen", "x"]},
                "rule": {
                    "enum": [
                        "single-region",
                        "single-row",
                        "single-column",
                        "fill",
                        "intersection",
                        "subset",
                    ]
                },
            }
        ),
        "cue": TEXT,
        "witness": object_schema(
            {
                "sources": {"type": "array", "items": GROUP, "minItems": 1},
                "homes": {"type": "array", "items": GROUP},
            }
        ),
    }
)
SCHEMA = {
    "type": "array",
    "items": object_schema(
        {
            "id": TEXT,
            "title": TEXT,
            "stage": TEXT,
            "introduction": TEXT,
            "exercises": {
                "type": "array",
                "items": EXERCISE,
                "minItems": EXERCISE_COUNT,
                "maxItems": EXERCISE_COUNT,
            },
        }
    ),
}


def read_catalog(data: Path) -> list[Technique]:
    raw: object = json.loads(data.read_text())
    jsonschema.validate(raw, SCHEMA)
    catalog = cast(list[Technique], raw)
    if [item["id"] for item in catalog] != list(TECHNIQUES):
        raise ValueError("catalog must preserve the four ordered techniques")
    layouts: set[str] = set()
    states: set[str] = set()
    for technique in catalog:
        for index, exercise in enumerate(technique["exercises"]):
            suffix = "" if index == 0 else f"-{index + 1}"
            if exercise["id"] != f"star-battle-{technique['id']}{suffix}":
                raise ValueError("exercise IDs must preserve course order")
            layout = json.dumps(exercise["board"], sort_keys=True)
            state = json.dumps([layout, exercise["queens"], exercise["marks"]])
            if layout in layouts or state in states:
                raise ValueError("exercises must have distinct boards and prepared positions")
            layouts.add(layout)
            states.add(state)
    return catalog


def group_cells(board: Board, kind: Kind, index: int) -> set[int]:
    if not 0 <= index < board.size:
        raise ValueError("witness group index out of bounds")
    if kind == "region":
        return {cell for cell, region in enumerate(board.regions) if region == index}
    return {
        cell
        for cell in range(board.cell_count)
        if (cell // board.size if kind == "row" else cell % board.size) == index
    }


def reconstruct(board: Board, queens: set[int], marks: set[int]) -> tuple[set[int], set[int]]:
    full = set[int]().union(
        *(
            group_cells(board, kind, index)
            for kind in KINDS
            for index in range(board.size)
            if len(group_cells(board, kind, index) & queens) == board.stars_per_row
        )
    )
    touching = {
        cell
        for cell in range(board.cell_count)
        for star in queens
        if max(
            abs(cell // board.size - star // board.size), abs(cell % board.size - star % board.size)
        )
        <= 1
    }
    blocked = (full | touching) - queens
    return set(range(board.cell_count)) - queens - marks - blocked, blocked


def check_partition(
    board: Board, partition: list[Group], queens: set[int], available: set[int]
) -> None:
    if not partition:
        return
    if len({group["kind"] for group in partition}) != 1:
        raise ValueError("witness groups must share one partition kind")
    if len({group["index"] for group in partition}) != len(partition):
        raise ValueError("witness groups must be distinct and disjoint")
    for group in partition:
        cells = group_cells(board, group["kind"], group["index"])
        need = board.stars_per_row - len(cells & queens)
        if group["need"] != need or group["candidates"] != sorted(cells & available):
            raise ValueError("witness must list exact remaining needs and candidates")


def check_witness(board: Board, exercise: Exercise, available: set[int]) -> None:
    witness, move = exercise["witness"], exercise["expected"]
    queens = set(exercise["queens"])
    sources, homes = witness["sources"], witness["homes"]
    if not sources:
        raise ValueError("witness needs source groups")
    check_partition(board, sources, queens, available)
    check_partition(board, homes, queens, available)
    if any(group["need"] <= 0 for group in sources) or move["cell"] not in available:
        raise ValueError("witness needs positive source capacity and an available target")
    source_cells = set[int]().union(*(group_cells(board, g["kind"], g["index"]) for g in sources))
    candidates = set[int]().union(*(set(g["candidates"]) for g in sources))
    need = sum(g["need"] for g in sources)
    rule = move["rule"]
    if rule.startswith("single-") or rule == "fill":
        if (
            len(sources) != 1
            or homes
            or len(candidates) != need
            or move["cell"] not in candidates
            or move["action"] != "queen"
        ):
            raise ValueError("placement witness must fill all remaining spaces")
        if rule.startswith("single-") and (need != 1 or rule != f"single-{sources[0]['kind']}"):
            raise ValueError("single witness must owe exactly one star in the named group")
        if rule == "fill" and need < MIN_SUBSET:
            raise ValueError("fill witness must owe at least two stars")
        return
    home_cells = set[int]().union(*(group_cells(board, g["kind"], g["index"]) for g in homes))
    if (
        not homes
        or sources[0]["kind"] == homes[0]["kind"]
        or not candidates
        or not candidates <= home_cells
        or any(not set(g["candidates"]) & candidates for g in homes)
        or need != sum(g["need"] for g in homes)
        or move["cell"] not in home_cells - source_cells
        or move["action"] != "x"
    ):
        raise ValueError("reservation witness must balance source demand and reached home capacity")
    if (rule == "intersection" and len(sources) != 1) or (
        rule == "subset" and len(sources) < MIN_SUBSET
    ):
        raise ValueError("reservation witness has the wrong number of source groups")


def evidence_support(board: Board, exercise: Exercise) -> list[int]:
    sources = set[int]().union(
        *(group_cells(board, g["kind"], g["index"]) for g in exercise["witness"]["sources"])
    )
    homes = set[int]().union(
        *(group_cells(board, g["kind"], g["index"]) for g in exercise["witness"]["homes"])
    )
    queens = set(exercise["queens"])
    support = sources | homes
    for star in queens:
        row, column = divmod(star, board.size)
        full_row = len(group_cells(board, "row", row) & queens) == board.stars_per_row
        full_column = len(group_cells(board, "column", column) & queens) == board.stars_per_row
        region = board.regions[star]
        full_region = len(group_cells(board, "region", region) & queens) == board.stars_per_row
        if any(
            (cell // board.size == row and full_row)
            or (cell % board.size == column and full_column)
            or (board.regions[cell] == region and full_region)
            or max(abs(cell // board.size - row), abs(cell % board.size - column)) <= 1
            for cell in sources
        ):
            support.add(star)
    return sorted(support - {exercise["expected"]["cell"]})


def certify(exercise: Exercise, technique: str) -> dict[str, object]:
    geometry = exercise["board"]
    board = Board(
        geometry["size"],
        tuple(geometry["regions"]),
        tuple(geometry["regionCapacity"]),
        PuzzleType.STAR_BATTLE,
    )
    queens, marks = set(exercise["queens"]), set(exercise["marks"])
    move = exercise["expected"]
    rules = {
        "last-space": {"single-region", "single-row", "single-column"},
        "fill": {"fill"},
        "intersection": {"intersection"},
        "subset": {"subset"},
    }
    if move["rule"] not in rules[technique]:
        raise ValueError("advertised rule does not match the technique")
    if queens & marks or any(
        not 0 <= c < board.cell_count for c in queens | marks | {move["cell"]}
    ):
        raise ValueError("invalid prepared cell state")
    source_path = ROOT / f"app/public/puzzles/{exercise['source']}.json"
    source = cast(dict[str, object], json.loads(source_path.read_text()))
    baseline = cast(
        dict[str, list[list[object]]],
        json.loads((ROOT / "engine/tests/fixtures/hint-baseline.json").read_text()),
    )
    source_position = baseline[exercise["source"]][exercise["baselineIndex"]]
    original_marks = set(cast(list[int], source_position[1]))
    available, blocked = reconstruct(board, queens, marks)
    if (
        source["board"] != geometry
        or source_position[0] != exercise["queens"]
        or source_position[2] != [move["cell"], move["action"], move["rule"]]
        or marks != original_marks | blocked
    ):
        raise ValueError("prepared position must match fixed provenance plus all basic crosses")
    if count_solutions(board, limit=2) != 1:
        raise ValueError("source board must have exactly one solution")
    solution = set(next(iter_solutions(board)))
    if (
        not queens <= solution
        or marks & solution
        or ((move["cell"] in solution) != (move["action"] == "queen"))
    ):
        raise ValueError("prepared position or answer contradicts exact solution")
    actual = first_forced_move(board, queens=queens, marks=marks)
    if actual is None or [actual.cell, actual.action, actual.rule] != [
        move["cell"],
        move["action"],
        move["rule"],
    ]:
        raise ValueError("first forced move must match the frozen target exactly")
    check_witness(board, exercise, available)
    return {
        "id": exercise["id"],
        "source": exercise["source"],
        "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "baseline_index": exercise["baselineIndex"],
        "unique_solution": sorted(solution),
        "queens": exercise["queens"],
        "marks": exercise["marks"],
        "move": move,
        "available": sorted(available),
        "basic_blocked": sorted(blocked),
        "witness": exercise["witness"],
        "support": evidence_support(board, exercise),
    }


def verify(data: Path = DATA, report: Path = REPORT, *, write_report: bool = False) -> None:
    catalog = read_catalog(data)
    certificates = [
        certify(exercise, technique["id"])
        for technique in catalog
        for exercise in technique["exercises"]
    ]
    document = {
        "purpose": (
            "Fixed-corpus exact uniqueness, first-move and independent capacity "
            "witnesses. Solutions are review-only."
        ),
        "lessons": certificates,
    }
    if write_report:
        formatted = json.dumps(document, indent=2)
        formatted = re.sub(
            r"\[\n\s+(\d+(?:,\n\s+\d+)*)\n\s+\]",
            lambda match: "[" + re.sub(r",\n\s+", ", ", match[1]) + "]",
            formatted,
        )
        report.write_text(formatted + "\n")
    elif json.loads(report.read_text()) != document:
        raise ValueError("lesson certificates differ from frozen positions")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true")
    args = parser.parse_args()
    verify(write_report=args.write_report)
    print(
        "Verified 12 Star Battle exercises against exact solutions, "
        "first moves and capacity witnesses"
    )


if __name__ == "__main__":
    main()
