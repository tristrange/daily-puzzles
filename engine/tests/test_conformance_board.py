"""The shared `conformance/board-cases/` suite.

Every expectation here is asserted from the TypeScript side too, so the two
implementations cannot drift on what a board is allowed to be. `schema-cases/`
covers reading the same bytes; this covers *reasoning* about the result, which is
where the two languages have separate code for the same rules.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from queens_engine.board import Board, BoardError
from queens_engine.puzzle import CONFORMANCE_DIR, PuzzleType

CASES_DIR = CONFORMANCE_DIR / "board-cases"


def load_manifest() -> dict[str, Any]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest


MANIFEST = load_manifest()
CASES = MANIFEST["cases"]
CASE_IDS = [case["file"] for case in CASES]


def load_case(case: dict[str, Any]) -> Any:
    return json.loads((CASES_DIR / case["file"]).read_text(encoding="utf-8"))


def build_board(raw: dict[str, Any]) -> Board:
    return Board(
        size=raw["size"],
        regions=tuple(raw["regions"]),
        region_capacity=tuple(raw["regionCapacity"]),
        puzzle_type=PuzzleType(raw["type"]),
    )


def test_every_fixture_file_is_listed_in_the_manifest() -> None:
    on_disk = sorted(path.name for path in CASES_DIR.glob("*.json") if path.name != "manifest.json")
    assert sorted(CASE_IDS) == on_disk


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_board_case(case: dict[str, Any]) -> None:
    raw = load_case(case)
    if case["valid"]:
        build_board(raw)
        return
    with pytest.raises(BoardError) as caught:
        build_board(raw)
    # Which rule fired, not merely that one did. Several rules can apply to the same
    # board — a queens board with a capacity of 0 is both "not 1" and "below one" —
    # and accepting the board for the wrong reason would let a fixture stop testing
    # what it claims to test.
    assert case["error"] in str(caught.value)


@pytest.mark.parametrize("case", MANIFEST["access"], ids=[c["name"] for c in MANIFEST["access"]])
def test_board_access_case(case: dict[str, Any]) -> None:
    """Out-of-range access must fail the same way in both languages."""
    board = build_board(
        {
            "size": 4,
            "type": "queens",
            "regions": [0] * 4 + [1] * 4 + [2] * 4 + [3] * 4,
            "regionCapacity": [1, 1, 1, 1],
        }
    )
    with pytest.raises(BoardError) as caught:
        board.region_at(case["cell"])
    assert case["error"] in str(caught.value)
