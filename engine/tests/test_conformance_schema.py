"""The shared `conformance/schema-cases/` suite.

Every expectation here is asserted from the Python side too, so the two implementations
cannot drift apart on the file format.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from queens_engine import PuzzleParseError, parse_puzzle
from queens_engine.puzzle import CONFORMANCE_DIR

CASES_DIR = CONFORMANCE_DIR / "schema-cases"


def load_manifest() -> list[dict[str, Any]]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    cases: list[dict[str, Any]] = manifest["cases"]
    return cases


MANIFEST = load_manifest()
CASE_IDS = [case["file"] for case in MANIFEST]


def test_every_fixture_file_is_listed_in_the_manifest() -> None:
    on_disk = sorted(path.name for path in CASES_DIR.glob("*.json") if path.name != "manifest.json")
    assert sorted(CASE_IDS) == on_disk


@pytest.mark.parametrize("case", MANIFEST, ids=CASE_IDS)
def test_schema_case(case: dict[str, Any]) -> None:
    raw: Any = json.loads((CASES_DIR / case["file"]).read_text(encoding="utf-8"))
    if case["valid"]:
        assert parse_puzzle(raw).id == raw["id"]
    else:
        with pytest.raises(PuzzleParseError):
            parse_puzzle(raw)


def test_reject_cases_all_declare_a_reason() -> None:
    for case in MANIFEST:
        if not case["valid"]:
            assert case.get("reason"), f"{case['file']} is a reject case with no reason"
