import copy
import json

import pytest
from tools.star_battle_chains import (
    DATA,
    ROOT,
    Chain,
    all_pairs_separated,
    certify,
    source_has_choices,
    verify,
)

from queens_engine.board import Board, PuzzleType


def test_all_chains_have_certified_sources_and_complete_answers() -> None:
    verify()
    lessons = json.loads(DATA.read_text())
    assert len({lesson["source"] for lesson in lessons}) == 3
    assert [len(lesson["answers"]) for lesson in lessons] == [2, 2, 1]


def test_rejects_line_where_no_touch_forces_the_endpoints() -> None:
    geometry = json.loads(DATA.read_text())[0]["board"]
    board = Board(
        geometry["size"],
        tuple(geometry["regions"]),
        tuple(geometry["regionCapacity"]),
        PuzzleType.STAR_BATTLE,
    )
    assert not all_pairs_separated(board, {27, 36, 45})
    assert all_pairs_separated(board, {45, 47, 53})
    assert not source_has_choices(board, {"kind": "row", "index": 0, "need": 1, "candidates": [0]})
    assert source_has_choices(board, {"kind": "row", "index": 0, "need": 1, "candidates": [0, 1]})


@pytest.mark.parametrize("change", ["witness", "answer", "exclusion"])
def test_rejects_bad_reservations_and_incomplete_answers(change: str) -> None:
    exercise: Chain = copy.deepcopy(json.loads(DATA.read_text())[1])
    baseline = json.loads((ROOT / "engine/tests/fixtures/hint-baseline.json").read_text())
    if change == "witness":
        exercise["witness"]["sources"][0]["candidates"].pop()
    elif change == "answer":
        exercise["answers"].pop()
    else:
        exercise["first"]["cell"] = exercise["answers"][0]
    with pytest.raises(ValueError):
        certify(exercise, baseline)
