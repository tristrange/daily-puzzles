"""The shared `conformance/id-cases/` suite.

Every expectation here is asserted from the Python side too, so the publisher's id
naming and the app's id routing cannot drift apart. A spelling the two disagree on
is a puzzle that is published, correct, and unfindable.
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from tools.schema_ids import current_pattern, expected_pattern

from queens_engine.board import PuzzleType
from queens_engine.puzzle import CONFORMANCE_DIR, PuzzleParseError, parse_puzzle
from queens_engine.rulebook import puzzle_id, rulebook_for, rulebooks, split_puzzle_id
from queens_engine.track_sizes import TRACK_SIZES_START, TRACK_VARIANTS

CASES_DIR = CONFORMANCE_DIR / "id-cases"

# Tried in order until one the manifest does not declare, so the negative test stays
# valid when a family ships with any of the suffixes a real game might pick.
_SENTINEL_SUFFIXES = ("-train", "-tracks", "-tango", "-logic", "-ladder", "-mines")


def load_manifest() -> dict[str, Any]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest


MANIFEST = load_manifest()
CASE_IDS = [case["id"] for case in MANIFEST["cases"]]
UNPARSED_IDS = list(MANIFEST["unparsed"])


def test_every_declared_suffix_is_the_whole_id_after_the_day() -> None:
    """The whole generated id, not just its tail.

    Checking `endswith` would pass for a suffix that is merely a suffix of the real
    one: an engine emitting `-foo-train` still ends with `-train`, so the publisher
    would be writing ids the app cannot route with both suites green. The id is
    `day + suffix` by definition, so assert that and nothing weaker.
    """
    for entry in MANIFEST["types"]:
        suffix = (
            "-sudoku-easy"
            if entry["type"] == "sudoku"
            else "-killer-sudoku-easy"
            if entry["type"] == "killer-sudoku"
            else entry["suffix"]
        )
        assert puzzle_id(date(2026, 10, 4), entry["type"]) == f"2026-10-04{suffix}"


def test_schema_accepts_every_declared_family_id() -> None:
    """The schema's `id` pattern must accept each family's id, from the same manifest.

    The pattern is shape only — it also accepts impossible dates like `2026-02-30`,
    which the parsers reject — so this asserts the suffixes agree and leaves calendar
    validity to `split_puzzle_id`.
    """
    compiled = re.compile(current_pattern())
    for entry in MANIFEST["types"]:
        suffix = (
            "-sudoku-easy"
            if entry["type"] == "sudoku"
            else "-killer-sudoku-easy"
            if entry["type"] == "killer-sudoku"
            else entry["suffix"]
        )
        identifier = f"2026-10-04{suffix}"
        assert compiled.match(identifier), f"schema rejects {identifier}"


def test_checked_in_schema_pattern_is_not_stale() -> None:
    """The pattern must be what the manifest implies, not a hand-written copy.

    `tools/schema_ids` is the only thing that writes it, so this is the assertion
    that a family added to the manifest without regenerating fails on rather than
    quietly rejecting its own published puzzles.
    """
    assert current_pattern() == expected_pattern(MANIFEST)


def test_schema_rejects_a_suffix_nobody_declared() -> None:
    """The loud failure: a family the manifest does not know cannot pass validation.

    Better than a puzzle that validates and then cannot be routed, and the reason the
    schema's suffix list is derived rather than widened to any suffix.

    The sentinel is chosen as one the manifest does not declare, rather than a fixed
    string. A hardcoded `-train` would start failing the day Train Tracks ships with
    that suffix — correctly wired registries, and a test failing for the wrong reason.
    """
    declared = {entry["suffix"] for entry in MANIFEST["types"]}
    sentinel = next(s for s in _SENTINEL_SUFFIXES if s not in declared)
    assert not re.compile(current_pattern()).match(f"2026-10-04{sentinel}")


def test_every_declared_family_has_a_case() -> None:
    """A family in the registry with no case is asserted only against itself.

    The round-trip and split cases below are what pin the app to the engine; a
    family missing from `cases` is checked by each side's own registry and no
    shared expectation, which is precisely the drift the suite exists to catch.
    """
    declared = {entry["type"] for entry in MANIFEST["types"]}
    assert {case["type"] for case in MANIFEST["cases"]} == declared


TYPE_ENTRIES = MANIFEST["types"]


@pytest.mark.parametrize("entry", TYPE_ENTRIES, ids=[entry["type"] for entry in TYPE_ENTRIES])
def test_puzzle_id_round_trips_through_split(entry: dict[str, Any]) -> None:
    generated = puzzle_id(date(2026, 10, 4), entry["type"])
    assert split_puzzle_id(generated) == (date(2026, 10, 4), entry["type"])


@pytest.mark.parametrize("case", MANIFEST["cases"], ids=CASE_IDS)
def test_id_case_splits_as_declared(case: dict[str, Any]) -> None:
    assert split_puzzle_id(case["id"]) == (date.fromisoformat(case["day"]), case["type"])


@pytest.mark.parametrize("value", UNPARSED_IDS, ids=UNPARSED_IDS)
def test_unparsable_ids_are_rejected(value: str) -> None:
    assert split_puzzle_id(value) is None


def test_variant_metadata_and_named_id_builders_agree() -> None:
    assert date(2026, 10, 14) == TRACK_SIZES_START
    assert [(v.name, v.side, v.label) for v in TRACK_VARIANTS] == [
        ("small", 8, "Small"),
        ("medium", 10, "Medium"),
        ("large", 12, "Large"),
    ]
    for variant in TRACK_VARIANTS:
        assert (
            puzzle_id(date(2026, 10, 17), PuzzleType.TRAIN_TRACKS, track_size=variant.name)
            == f"2026-10-17{variant.suffix}"
        )
    with pytest.raises(ValueError):
        puzzle_id(date(2026, 10, 17), PuzzleType.QUEENS, track_size="small")


@pytest.mark.parametrize("case", MANIFEST.get("boardCases", []))
def test_sized_envelope_contract(case: dict[str, Any]) -> None:
    data = json.loads((CASES_DIR / case["file"]).read_text(encoding="utf-8"))
    data.update(case.get("overrides", {}))
    if case["valid"]:
        puzzle = parse_puzzle(data)
        assert puzzle.id == data["id"]
        width, height = rulebook_for(puzzle.puzzle_type).dimensions(puzzle)
        board = data["board"]
        assert (width, height) == (
            board.get("width", board.get("size")),
            board.get("height", board.get("size")),
        )
    else:
        with pytest.raises(PuzzleParseError):
            parse_puzzle(data)


@pytest.mark.parametrize("case", MANIFEST["dailyCases"])
def test_daily_slots_agree_with_shared_contract(case: dict[str, Any]) -> None:
    day = date.fromisoformat(case["day"])
    assert [
        identifier for book in rulebooks() if book.published for identifier in book.daily_ids(day)
    ] == case["ids"]


def test_backfilled_archive_has_every_daily_slot_and_original_tracks() -> None:
    archive = Path(__file__).resolve().parents[2] / "app/public/puzzles"
    for offset in range(25):
        day = date(2026, 9, 26) + timedelta(days=offset)
        ids = [
            identifier
            for book in rulebooks()
            if book.published
            for identifier in book.daily_ids(day)
        ]
        assert len(ids) == 15
        assert all((archive / f"{identifier}.json").is_file() for identifier in ids)
        if day <= date(2026, 10, 16):
            assert (archive / f"{day}-tracks.json").is_file()
