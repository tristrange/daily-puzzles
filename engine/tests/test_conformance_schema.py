"""The shared `conformance/schema-cases/` suite.

Every expectation here is asserted from the Python side too, so the two implementations
cannot drift apart on the file format.
"""

from __future__ import annotations

import json
import re
from typing import Any

import pytest

from queens_engine import PuzzleParseError, parse_puzzle
from queens_engine.puzzle import CONFORMANCE_DIR

CASES_DIR = CONFORMANCE_DIR / "schema-cases"

_PREFIX = re.compile(r"^puzzle does not match schema at: ")


def load_manifest() -> list[dict[str, Any]]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    cases: Any = manifest["cases"]
    return cases


def error_paths(message: str) -> list[str]:
    """The document locations a rejection names, sorted and deduplicated.

    ajv and jsonschema report the same invalid document differently: an `if`/`then`
    that fires alongside a `required` failure is one error in Python and two in
    TypeScript, so `<root>; <root>` on one side is `<root>` on the other. Comparing
    the *set* of locations is what both parsers can actually agree on, and it still
    pins which rule fired — a rejection for the wrong reason names a different place.
    """
    paths = _PREFIX.sub("", message).split("; ")
    return sorted({path.lstrip("/") or "<root>" for path in paths})


MANIFEST = load_manifest()
CASE_IDS = [case["file"] for case in MANIFEST]


def test_every_fixture_file_is_listed_in_the_manifest() -> None:
    on_disk = sorted(path.name for path in CASES_DIR.glob("*.json") if path.name != "manifest.json")
    assert sorted(CASE_IDS) == on_disk


@pytest.mark.parametrize("case", MANIFEST, ids=CASE_IDS)
def test_schema_case(case: dict[str, Any]) -> None:
    raw: Any = json.loads((CASES_DIR / case["file"]).read_text(encoding="utf-8"))
    if case["valid"]:
        puzzle = parse_puzzle(raw)
        expected = case["expect"]
        assert puzzle.id == raw["id"]
        assert puzzle.puzzle_type.value == expected["type"]
        # A file writing `4.0` must parse as the integer 4, not as 4.0: every
        # downstream index and loop bound assumes ints.
        assert puzzle.size == expected["size"]
        assert puzzle.seed == expected["seed"]
        assert puzzle.generator_version == expected["generatorVersion"]
        # `==` alone would not notice: Python says 4.0 == 4, so a parser that kept
        # the float would pass. TypeScript has one number type and cannot catch this,
        # which is why the coercion is worth asserting where it is observable.
        assert all(
            isinstance(value, int)
            for value in (
                puzzle.size,
                puzzle.seed,
                puzzle.generator_version,
                *puzzle.board.regions,
                *puzzle.board.region_capacity,
            )
        )
        assert list(puzzle.board.region_capacity) == expected["regionCapacity"]
        assert puzzle.difficulty == expected["difficulty"]
    else:
        with pytest.raises(PuzzleParseError) as caught:
            parse_puzzle(raw)
        assert error_paths(str(caught.value)) == case["errorPaths"]


def test_reject_cases_all_declare_the_paths_they_reject_at() -> None:
    for case in MANIFEST:
        if not case["valid"]:
            assert case.get("errorPaths"), f"{case['file']} is a reject case with no errorPaths"


def test_accept_cases_all_declare_what_they_parse_to() -> None:
    # Asserting only that a file is accepted lets a parser accept it for the wrong
    # reason — reading `size` as a string, or defaulting a stated capacity to 1.
    for case in MANIFEST:
        if case["valid"]:
            assert case.get("expect"), f"{case['file']} is an accept case with no expect"
