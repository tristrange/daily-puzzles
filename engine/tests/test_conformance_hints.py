"""The shared `conformance/hint-cases/` suite, asserted from the Python side.

Each case records the *first* forced move the deduction engine finds — either on
an empty board or from an explicit player state (queens placed and cells marked,
in the player model of `app/src/domain/game.ts`). The TypeScript app replays the
same rules for its on-player hint engine in `app/src/domain/hints.ts`, so it must
produce an identical answer. The app's hint never contradicts the engine that
rated the puzzle.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from queens_engine import first_forced_move, parse_puzzle
from queens_engine.puzzle import CONFORMANCE_DIR

CASES_DIR = CONFORMANCE_DIR / "hint-cases"


def to_hint(move: Any) -> dict[str, Any]:
    return {"cell": move.cell, "action": move.action, "rule": move.rule}


def load_cases() -> list[dict[str, Any]]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest["cases"]


MANIFEST = load_cases()
CASE_IDS = [f"{case['file']}#{index}" for index, case in enumerate(MANIFEST)]
NON_CASE_FILES = ("manifest.json",)


def test_every_fixture_file_is_listed_in_the_manifest() -> None:
    on_disk = sorted(
        path.name for path in CASES_DIR.glob("*.json") if path.name not in NON_CASE_FILES
    )
    assert sorted({case["file"] for case in MANIFEST}) == on_disk


@pytest.mark.parametrize("case", MANIFEST, ids=CASE_IDS)
def test_first_moves_match_fixture(case: dict[str, Any]) -> None:
    raw: Any = json.loads((CASES_DIR / case["file"]).read_text(encoding="utf-8"))
    board = parse_puzzle(raw).board
    state = case.get("state")
    if state is None:
        move = first_forced_move(board)
    else:
        move = first_forced_move(board, queens=state["queens"], marks=state["marks"])
    assert move is not None
    assert to_hint(move) == case["hint"]
