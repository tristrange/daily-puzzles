"""Parsing and validation of committed puzzle files.

Structural validation is delegated to `schema/puzzle.schema.json` so the Python engine
and the TypeScript app share one definition of the file format. Everything the schema
cannot express (array length tied to `size`, contiguous region ids) is checked here and
mirrored in `app/src/domain/`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, Final, cast

from jsonschema import Draft202012Validator

from .board import Board, BoardError, PuzzleType

REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[3]
SCHEMA_PATH: Final[Path] = REPO_ROOT / "schema" / "puzzle.schema.json"
CONFORMANCE_DIR: Final[Path] = REPO_ROOT / "conformance"

type JsonValue = str | int | float | bool | list[JsonValue] | dict[str, JsonValue] | None


class PuzzleParseError(ValueError):
    """A puzzle file is malformed."""


@dataclass(frozen=True, slots=True)
class Puzzle:
    """A puzzle file after structural and semantic validation."""

    id: str
    puzzle_type: PuzzleType
    size: int
    seed: int
    generator_version: int
    board: Board
    #: Band index, 1-based into `LEVEL_NAMES`. `None` for boards published
    #: before the weekly ramp, and for anything generated outside a target.
    difficulty: int | None = None


@cache
def _validator() -> Draft202012Validator:
    schema = cast("dict[str, Any]", json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def parse_puzzle(data: object) -> Puzzle:
    """Validate raw JSON data and return the parsed `Puzzle`."""
    # jsonschema ships an untyped fallback in the iter_errors overload set, so the member
    # type is genuinely unknown to a strict checker. Suppressed here rather than project-wide.
    errors = sorted(
        _validator().iter_errors(cast("Any", data)),  # pyright: ignore[reportUnknownMemberType]
        key=lambda error: [str(part) for part in error.absolute_path],
    )
    if errors:
        paths = "; ".join(
            "/".join(str(part) for part in error.absolute_path) or "<root>" for error in errors
        )
        raise PuzzleParseError(f"puzzle does not match schema at: {paths}")

    if not isinstance(data, dict):
        raise PuzzleParseError("puzzle must be a JSON object")

    record = cast("dict[str, JsonValue]", data)
    size = _require_int(record.get("size"), "size")
    regions = tuple(
        _require_int(value, "regions[]")
        for value in _require_list(record.get("regions"), "regions")
    )

    if len(regions) != size * size:
        raise PuzzleParseError(f"regions has {len(regions)} entries, expected {size * size}")

    region_count = max(regions) + 1
    declared = record.get("regionCapacity")
    capacity = (
        tuple(
            _require_int(value, "regionCapacity[]")
            for value in _require_list(declared, "regionCapacity")
        )
        if declared is not None
        else (1,) * region_count
    )

    declared_level = record.get("difficulty")
    difficulty = None if declared_level is None else _require_int(declared_level, "difficulty")

    try:
        board = Board(
            size=size,
            regions=regions,
            region_capacity=capacity,
            puzzle_type=PuzzleType(_require_str(record.get("type"), "type")),
        )
    except (BoardError, ValueError) as error:
        raise PuzzleParseError(str(error)) from error

    return Puzzle(
        id=_require_str(record.get("id"), "id"),
        puzzle_type=board.puzzle_type,
        size=size,
        seed=_require_int(record.get("seed"), "seed"),
        generator_version=_require_int(record.get("generatorVersion"), "generatorVersion"),
        board=board,
        difficulty=difficulty,
    )


def load_puzzle(path: Path) -> Puzzle:
    """Read and validate a puzzle file from disk."""
    try:
        raw = cast(JsonValue, json.loads(path.read_text(encoding="utf-8")))
    except json.JSONDecodeError as error:
        raise PuzzleParseError(f"{path.name} is not valid JSON: {error}") from error
    return parse_puzzle(raw)


def puzzle_to_dict(puzzle: Puzzle) -> dict[str, JsonValue]:
    """The schema-shaped dict for `puzzle`, in the order the CLI writes it."""
    data: dict[str, JsonValue] = {
        "id": puzzle.id,
        "type": puzzle.puzzle_type.value,
        "size": puzzle.size,
        "seed": puzzle.seed,
        "generatorVersion": puzzle.generator_version,
        "regions": list(puzzle.board.regions),
    }
    if puzzle.puzzle_type is PuzzleType.STAR_BATTLE:
        data["regionCapacity"] = list(puzzle.board.region_capacity)
    if puzzle.difficulty is not None:
        data["difficulty"] = puzzle.difficulty
    return data


def dumps_puzzle(puzzle: Puzzle) -> str:
    """Serialise `puzzle` to the canonical file form.

    A puzzle file is a circle: it must parse back into the same `Puzzle`, so the
    file a CLI writes and the file CI re-verifies are byte-identical. Objects
    are indented two spaces but arrays stay on one line, matching the committed
    fixtures under `conformance/schema-cases/` so `diff` stays readable.
    """
    return canonical_dumps(puzzle_to_dict(puzzle))


def canonical_dumps(data: dict[str, JsonValue]) -> str:
    """Render `data` in the canonical file form: two-space objects, one-line arrays.

    Every committed artefact in this repo is written this way — puzzle files and
    the deduction baseline alike — so `git diff` shows a changed number rather
    than a reflowed document, and so a golden file can be regenerated and
    compared byte-for-byte. Key order is the caller's insertion order, not sorted:
    the order is chosen to read well and is part of what is being pinned.
    """
    lines: list[str] = ["{"]
    for i, (key, value) in enumerate(data.items()):
        rendered = _render(value)
        comma = "," if i < len(data) - 1 else ""
        lines.append(f"  {json.dumps(key)}: {rendered}{comma}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def _render(value: JsonValue) -> str:
    if isinstance(value, list):
        return "[" + ", ".join(_render(item) for item in value) + "]"
    return json.dumps(value)


def _require_str(value: JsonValue | None, field: str) -> str:
    if not isinstance(value, str):
        raise PuzzleParseError(f"{field} must be a string")
    return value


def _require_int(value: JsonValue | None, field: str) -> int:
    """Return value as an int, using the schema's definition of "integer".

    JSON Schema 2020-12 counts a number with a zero fractional part as an
    integer, so `4.0` is as valid as `4`. json.loads hands us a float where
    ajv hands TypeScript a plain number, so rejecting floats here would make
    the two parsers disagree on files the schema accepts.
    """
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise PuzzleParseError(f"{field} must be an integer")
    if isinstance(value, float):
        # is_integer() is False for nan and inf, so those are rejected too.
        if not value.is_integer():
            raise PuzzleParseError(f"{field} must be an integer")
        return int(value)
    return value


def _require_list(value: JsonValue | None, field: str) -> list[JsonValue]:
    if not isinstance(value, list):
        raise PuzzleParseError(f"{field} must be an array")
    return value


__all__ = [
    "CONFORMANCE_DIR",
    "SCHEMA_PATH",
    "JsonValue",
    "Puzzle",
    "PuzzleParseError",
    "canonical_dumps",
    "dumps_puzzle",
    "load_puzzle",
    "parse_puzzle",
    "puzzle_to_dict",
]
