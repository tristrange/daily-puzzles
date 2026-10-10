"""The shared `conformance/schema-cases/` suite.

Every expectation here is asserted from the Python side too, so the two implementations
cannot drift apart on the file format.
"""

from __future__ import annotations

import json
import re
from typing import Any

import pytest

from queens_engine import PuzzleParseError, parse_puzzle, rulebook_for
from queens_engine.puzzle import CONFORMANCE_DIR

CASES_DIR = CONFORMANCE_DIR / "schema-cases"

_PREFIX = re.compile(r"^puzzle does not match schema at: ")


def load_manifest() -> list[dict[str, Any]]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    cases: Any = manifest["cases"]
    return cases


def error_paths(message: str) -> list[str]:
    """The rules a rejection names, sorted and deduplicated.

    Each entry is `keyword:path`, or `keyword:path:property` where the rule objected to
    one property, so `required:<root>:regions` and `additionalProperties:<root>:solution`
    stay distinct even though both rules fire at the document root.

    ajv wraps a failed `if` in its own error naming `then`, where jsonschema descends
    straight into the `then` subschema and reports only what is wrong inside it. The `if`
    wrapper carries no information the inner error does not already give, so it is
    dropped on both sides.
    """
    paths = _PREFIX.sub("", message).split("; ")
    return sorted({path for path in paths if not path.startswith("if:")})


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
        # Asked of the rulebook rather than read off the puzzle: a `Puzzle` has no
        # `size`, and a case that were not square would assert one number where the
        # contract answers with two.
        width, height = rulebook_for(puzzle.puzzle_type).dimensions(puzzle)
        assert (width, height) == (expected["size"], expected["size"])
        assert puzzle.seed == expected["seed"]
        assert puzzle.generator_version == expected["generatorVersion"]
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
