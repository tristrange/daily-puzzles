"""Verify the prepared Star Battle reservation chains."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from itertools import combinations
from pathlib import Path
from typing import TypedDict, cast

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tools.star_battle_lessons import (
    CELLS,
    EXERCISE,
    GROUP,
    INTEGER,
    ROOT,
    Exercise,
    Geometry,
    Group,
    Move,
    Witness,
    check_partition,
    check_witness,
    group_cells,
    reconstruct,
)

from queens_engine.board import Board, PuzzleType
from queens_engine.solver import count_solutions, iter_solutions

DATA = ROOT / "app/src/data/star-battle-chains.json"
REPORT = ROOT / "docs/measurements/star-battle-chains.json"
STARS_PER_LINE = 2


class Chain(TypedDict):
    id: str
    source: str
    baselineIndex: int
    board: Geometry
    queens: list[int]
    marks: list[int]
    first: Move
    witness: Witness
    group: Group
    answers: list[int]


def all_pairs_separated(board: Board, candidates: set[int]) -> bool:
    return all(
        max(abs(a // board.size - b // board.size), abs(a % board.size - b % board.size)) > 1
        for a, b in combinations(candidates, 2)
    )


def source_has_choices(board: Board, group: Group) -> bool:
    options = [
        set(cells)
        for cells in combinations(group["candidates"], group["need"])
        if all_pairs_separated(board, set(cells))
    ]
    return len(options) > 1 and not options[0].intersection(*options[1:])


def has_smaller_reservation(board: Board, exercise: Chain, queens: set[int]) -> bool:
    sources = exercise["witness"]["sources"]
    homes = exercise["witness"]["homes"]
    target = exercise["first"]["cell"]
    for count in range(1, len(sources)):
        for subset in combinations(sources, count):
            candidate_cells = set[int]().union(*(set(group["candidates"]) for group in subset))
            source_cells = set[int]().union(
                *(group_cells(board, group["kind"], group["index"]) for group in subset)
            )
            reached = [
                group
                for group in homes
                if candidate_cells & group_cells(board, group["kind"], group["index"])
            ]
            if (
                target not in source_cells
                and any(
                    target in group_cells(board, group["kind"], group["index"]) for group in reached
                )
                and sum(group["need"] for group in subset)
                == sum(
                    board.stars_per_row
                    - len(group_cells(board, group["kind"], group["index"]) & queens)
                    for group in reached
                )
            ):
                return True
    return False


def check_shortcuts(board: Board, exercise: Chain, queens: set[int], available: set[int]) -> None:
    if not all(source_has_choices(board, group) for group in exercise["witness"]["sources"]):
        raise ValueError("a source group already forces a star")
    if has_smaller_reservation(board, exercise, queens):
        raise ValueError("a smaller reservation already excludes the target")
    if exercise["group"]["need"] > 1 and not all_pairs_separated(
        board, set(exercise["group"]["candidates"])
    ):
        raise ValueError("the line's no-touch rule already forces a star")
    answers = set(exercise["answers"])
    for kind in ("row", "column", "region"):
        for index in range(board.size):
            cells = group_cells(board, kind, index)
            need = board.stars_per_row - len(cells & queens)
            if need > 0 and len(cells & available) == need and answers & cells:
                raise ValueError("an answer is already forced by a direct fill")


properties = cast(dict[str, object], EXERCISE["properties"])
SCHEMA = {
    "type": "array",
    "minItems": 3,
    "maxItems": 3,
    "items": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "id": properties["id"],
            "source": properties["source"],
            "baselineIndex": INTEGER,
            "board": properties["board"],
            "queens": CELLS,
            "marks": CELLS,
            "first": properties["expected"],
            "witness": properties["witness"],
            "group": GROUP,
            "answers": CELLS,
        },
        "required": [
            "id",
            "source",
            "baselineIndex",
            "board",
            "queens",
            "marks",
            "first",
            "witness",
            "group",
            "answers",
        ],
    },
}


def certify(exercise: Chain, baseline: dict[str, list[list[object]]]) -> dict[str, object]:
    geometry = exercise["board"]
    board = Board(
        geometry["size"],
        tuple(geometry["regions"]),
        tuple(geometry["regionCapacity"]),
        PuzzleType.STAR_BATTLE,
    )
    queens, marks = set(exercise["queens"]), set(exercise["marks"])
    available, blocked = reconstruct(board, queens, marks)
    source_path = ROOT / f"app/public/puzzles/{exercise['source']}.json"
    source = cast(dict[str, object], json.loads(source_path.read_text()))
    position = baseline[exercise["source"]][exercise["baselineIndex"]]
    if (
        source["board"] != geometry
        or position[0] != exercise["queens"]
        or not blocked <= marks
        or not marks - blocked <= set(cast(list[int], position[1]))
        or queens & marks
    ):
        raise ValueError("prepared position must match its published board and baseline")
    if count_solutions(board, limit=2) != 1:
        raise ValueError("source must have a unique solution")
    solution = set(next(iter_solutions(board)))
    if not queens <= solution or marks & solution:
        raise ValueError("prepared position contradicts its solution")
    first = exercise["first"]
    if first["rule"] not in ("intersection", "subset") or first["action"] != "x":
        raise ValueError("first step must be a reservation exclusion")
    witness_exercise: Exercise = {
        "id": exercise["id"],
        "source": exercise["source"],
        "baselineIndex": exercise["baselineIndex"],
        "board": geometry,
        "queens": exercise["queens"],
        "marks": exercise["marks"],
        "expected": first,
        "cue": "",
        "witness": exercise["witness"],
    }
    check_witness(board, witness_exercise, available)
    check_shortcuts(board, exercise, queens, available)
    group = exercise["group"]
    if group["kind"] not in ("row", "column"):
        raise ValueError("the final group must be a line")
    check_partition(board, [group], queens, available)
    candidates, answers = set(group["candidates"]), set(exercise["answers"])
    if (
        group["need"] not in (1, STARS_PER_LINE)
        or len(candidates) != group["need"] + 1
        or first["cell"] not in candidates
        or answers != candidates - {first["cell"]}
    ):
        raise ValueError("the exclusion must leave exactly enough spaces in the line")
    if first["cell"] in solution or not answers <= solution:
        raise ValueError("the chain does not match the unique solution")
    return {
        "id": exercise["id"],
        "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "unique_solution": sorted(solution),
        "answers": sorted(answers),
    }


def verify(*, write_report: bool = False) -> None:
    raw: object = json.loads(DATA.read_text())
    jsonschema.validate(raw, SCHEMA)
    catalog = cast(list[Chain], raw)
    if [e["id"] for e in catalog] != [
        "star-battle-chains",
        "star-battle-chains-2",
        "star-battle-chains-3",
    ]:
        raise ValueError("lesson IDs must be ordered and unique")
    if len({e["source"] for e in catalog}) != len(catalog):
        raise ValueError("lessons must use distinct boards")
    baseline = cast(
        dict[str, list[list[object]]],
        json.loads((ROOT / "engine/tests/fixtures/hint-baseline.json").read_text()),
    )
    report = {"lessons": [certify(exercise, baseline) for exercise in catalog]}
    if write_report:
        REPORT.write_text(json.dumps(report, indent=2) + "\n")
    elif json.loads(REPORT.read_text()) != report:
        raise ValueError("chain certificates differ from the fixed lessons")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true")
    verify(write_report=parser.parse_args().write_report)
    print("Verified three reservation chains and every answer")
