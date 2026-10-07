"""Parsing puzzle files, and the invariants the schema cannot express."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from queens_engine import PuzzleParseError, PuzzleType, parse_puzzle
from queens_engine.puzzle import load_puzzle


def minimal(size: int = 4) -> dict[str, Any]:
    return {
        "id": "2026-09-30",
        "type": "queens",
        "size": size,
        "seed": 1,
        "generatorVersion": 1,
        "regions": [row for row in range(size) for _ in range(size)],
    }


class TestDefaults:
    def test_region_capacity_defaults_to_one_per_region(self) -> None:
        puzzle = parse_puzzle(minimal(5))
        assert puzzle.board.region_capacity == (1, 1, 1, 1, 1)

    def test_explicit_capacity_is_used_verbatim(self) -> None:
        data = minimal(4) | {"regionCapacity": [1, 1, 1, 1]}
        puzzle = parse_puzzle(data)
        assert puzzle.board.region_capacity == (1, 1, 1, 1)

    def test_puzzle_type_is_parsed(self) -> None:
        data = minimal(4) | {"type": "star-battle", "regionCapacity": [1, 1, 1, 1]}
        assert parse_puzzle(data).puzzle_type is PuzzleType.STAR_BATTLE

    def test_metadata_is_preserved(self) -> None:
        data = minimal() | {"id": "2027-01-31", "seed": 4294967295, "generatorVersion": 3}
        puzzle = parse_puzzle(data)
        assert puzzle.id == "2027-01-31"
        assert puzzle.seed == 4294967295
        assert puzzle.generator_version == 3


class TestSemanticChecks:
    def test_region_array_length_must_match_size_squared(self) -> None:
        data = minimal(4)
        data["regions"] = [0, 0, 0, 0, 1, 1]
        with pytest.raises(PuzzleParseError, match="expected 16"):
            parse_puzzle(data)

    def test_schema_violation_is_reported(self) -> None:
        data = minimal(4) | {"id": "not-a-date"}
        with pytest.raises(PuzzleParseError, match="does not match schema"):
            parse_puzzle(data)

    def test_board_rule_violation_is_reported(self) -> None:
        data = minimal(4) | {"type": "star-battle", "regionCapacity": [1, 1, 1, 1]}
        data["regions"] = [0, 1, 1, 1, 2, 2, 2, 2, 0, 3, 3, 3, 3, 3, 3, 3]
        with pytest.raises(PuzzleParseError, match="not orthogonally connected"):
            parse_puzzle(data)

    def test_non_object_input_is_rejected(self) -> None:
        with pytest.raises(PuzzleParseError, match="does not match schema"):
            parse_puzzle([1, 2, 3])


class TestNumberRepresentation:
    """A number with a zero fractional part is an integer, per the schema.

    json.loads yields a float for `4.0` where ajv yields a plain number, so
    these cases exist to stop the two parsers drifting apart on files the
    shared schema accepts.
    """

    def test_integral_floats_are_accepted_and_normalised(self) -> None:
        data = minimal()
        data["size"] = 4.0
        data["seed"] = 1.0
        data["generatorVersion"] = 1.0
        data["regions"] = [float(region) for region in data["regions"]]
        puzzle = parse_puzzle(data)
        assert puzzle.board.size == 4
        assert isinstance(puzzle.board.size, int)
        assert puzzle.seed == 1
        assert isinstance(puzzle.seed, int)
        assert puzzle.board.regions == (0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3)
        assert all(isinstance(region, int) for region in puzzle.board.regions)

    @pytest.mark.parametrize("value", [4.5, "4", True, None, [4]])
    def test_values_that_are_not_numbers_are_rejected(self, value: object) -> None:
        data = minimal()
        data["size"] = value
        with pytest.raises(PuzzleParseError, match="does not match schema"):
            parse_puzzle(data)


class TestLoadingFromDisk:
    def test_loads_a_file(self, tmp_path: Path) -> None:
        path = tmp_path / "2026-09-30.json"
        path.write_text(json.dumps(minimal(5)), encoding="utf-8")
        assert load_puzzle(path).board.size == 5

    def test_malformed_json_is_reported(self, tmp_path: Path) -> None:
        path = tmp_path / "broken.json"
        path.write_text("{", encoding="utf-8")
        with pytest.raises(PuzzleParseError, match="not valid JSON"):
            load_puzzle(path)
