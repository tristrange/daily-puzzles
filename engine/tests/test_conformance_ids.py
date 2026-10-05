"""The shared `conformance/id-cases/` suite.

Every expectation here is asserted from the Python side too, so the publisher's id
naming and the app's id routing cannot drift apart. A spelling the two disagree on
is a puzzle that is published, correct, and unfindable.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

import pytest
from tools.schema_ids import current_pattern, expected_pattern

from queens_engine.puzzle import CONFORMANCE_DIR
from queens_engine.rulebook import puzzle_id, split_puzzle_id

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
        assert puzzle_id(date(2026, 10, 4), entry["type"]) == f"2026-10-04{entry['suffix']}"


def test_schema_accepts_every_declared_family_id() -> None:
    """The schema's `id` pattern must accept each family's id, from the same manifest.

    The pattern is shape only — it also accepts impossible dates like `2026-02-30`,
    which the parsers reject — so this asserts the suffixes agree and leaves calendar
    validity to `split_puzzle_id`.
    """
    compiled = re.compile(current_pattern())
    for entry in MANIFEST["types"]:
        identifier = f"2026-10-04{entry['suffix']}"
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
