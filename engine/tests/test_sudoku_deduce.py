"""Small logical-rule positions; no broad generator sweep."""

import json
from pathlib import Path
from typing import cast

import pytest

from queens_engine.sudoku import SudokuGrid
from queens_engine.sudoku_deduce import Level, SudokuContradictionError, deduce, next_step


def test_shared_technique_positions() -> None:
    path = Path(__file__).resolve().parents[2] / "conformance/sudoku-preview/techniques.json"
    for case in json.loads(path.read_text()):
        masks = [511] * 81
        for cell, mask in case["changes"]:
            masks[cell] = mask
        step = next_step(tuple(masks), cast(Level, case["level"]))
        assert step is not None, case["name"]
        assert (step.cell, step.after, step.rule) == (case["cell"], case["after"], case["rule"])


def test_peer_and_hidden_single_and_stall() -> None:
    masks = [511] * 81
    masks[0] = 1
    step = next_step(tuple(masks), "easy")
    assert step and step.cell in (
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        18,
        19,
        20,
        27,
        36,
        45,
        54,
        63,
        72,
    )
    assert step.before & 1 and not step.after & 1
    masks = [511] * 81
    for cell in range(1, 9):
        masks[cell] &= ~1
    step = next_step(tuple(masks), "easy")
    assert step and (step.cell, step.after, step.rule) == (0, 1, "hidden-single")
    assert not deduce(SudokuGrid((0,) * 81), "hard").solved


def test_pairs_and_triples_are_gated_and_do_not_overreach() -> None:
    masks = [511] * 81
    masks[0] = masks[4] = 3
    assert next_step(tuple(masks), "easy") is None
    step = next_step(tuple(masks), "medium")
    assert step and step.rule == "naked-pair" and step.cell not in (0, 4)
    assert step.after & 3 == 0
    masks[4] = 7
    assert next_step(tuple(masks), "medium") is None
    masks[0], masks[4], masks[8] = 3, 5, 6
    assert next_step(tuple(masks), "medium") is None
    step = next_step(tuple(masks), "hard")
    assert step and step.rule == "naked-triple" and step.after & 7 == 0


def test_locked_candidate_and_xwing_both_orientations() -> None:
    for transpose in (False, True):

        def flip(cell: int, transposed: bool = transpose) -> int:
            return cell % 9 * 9 + cell // 9 if transposed else cell

        masks = [511] * 81
        for cell in (9, 10, 11, 18, 19, 20):
            masks[flip(cell)] &= ~1
        step = next_step(tuple(masks), "medium")
        assert step and step.rule == "locked-candidate" and not step.after & 1
        masks = [511] * 81
        for row in (0, 4):
            for col in range(9):
                if col not in (1, 6):
                    masks[flip(row * 9 + col)] &= ~1
        assert next_step(tuple(masks), "medium") is None
        step = next_step(tuple(masks), "hard")
        assert step and step.rule == "x-wing" and not step.after & 1
        masks[flip(0)] |= 1
        assert next_step(tuple(masks), "hard") is None


def test_impossible_candidates_are_not_a_stall() -> None:
    for masks in ([0] + [511] * 80, [510] * 9 + [511] * 72):
        with pytest.raises(SudokuContradictionError):
            next_step(tuple(masks), "hard")
