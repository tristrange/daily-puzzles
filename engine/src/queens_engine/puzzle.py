"""Parsing and validation of committed puzzle files.

Structural validation is delegated to `schema/puzzle.schema.json` so the Python engine
and the TypeScript app share one definition of the file format. Everything the schema
cannot express (array length tied to `size`, contiguous region ids) is checked here and
mirrored in `app/src/domain/`.
"""

from __future__ import annotations

import json
import re
from functools import cache
from pathlib import Path
from typing import Any, Final, cast

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from .board import BoardError, JsonValue, Puzzle, PuzzleType, require_int
from .rulebook import rulebook_for

REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[3]
SCHEMA_PATH: Final[Path] = REPO_ROOT / "schema" / "puzzle.schema.json"
CONFORMANCE_DIR: Final[Path] = REPO_ROOT / "conformance"


class PuzzleParseError(ValueError):
    """A puzzle file is malformed."""


def _schema_error_key(error: ValidationError) -> str:
    """Where a rejection happened, what rule fired, and which property it named.

    A path alone does not identify a rule: `required`, `additionalProperties` and a
    failing `if` all report the document root, so three different rules would share
    one expectation. Naming the keyword and the property it objected to is what makes
    "rejected for the right reason" assertable, and the app builds the same key from
    ajv so the two messages can be compared directly.
    """
    path = "/".join(str(part) for part in error.absolute_path) or "<root>"
    if error.validator == "required":
        missing = _missing_property(error)
        return f"required:{path}:{missing}" if missing else f"required:{path}"
    if error.validator == "additionalProperties":
        unexpected = _unexpected_property(error)
        if unexpected:
            return f"additionalProperties:{path}:{unexpected}"
    return f"{error.validator}:{path}"


def _subschema_keys(error: ValidationError) -> tuple[frozenset[str], frozenset[str]]:
    """The property names a subschema allows, as (explicit, pattern-derived)."""
    schema = cast("dict[str, Any]", error.schema)
    declared = schema.get("properties", {})
    patterns = schema.get("patternProperties", {})
    return (
        frozenset(declared),
        frozenset(
            name
            for name, pattern in patterns.items()
            if re.search(cast("str", pattern), cast("str", name))
        ),
    )


def _missing_property(error: ValidationError) -> str | None:
    """The one required property absent from the document.

    jsonschema reports the whole `required` list, so the missing name is whichever
    entry the document does not have. When several are absent at once the first in
    schema order is named, since the document is already invalid either way.
    """
    present = cast("dict[str, Any]", error.instance)
    required = cast("list[str]", error.validator_value)
    return next((name for name in required if name not in present), None)


def _unexpected_property(error: ValidationError) -> str | None:
    """The property the document has that the subschema does not declare."""
    declared, patterns = _subschema_keys(error)
    instance = cast("dict[str, Any]", error.instance)
    return next(
        (name for name in sorted(instance) if name not in declared and name not in patterns),
        None,
    )


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
        paths = "; ".join(sorted(_schema_error_key(error) for error in errors))
        raise PuzzleParseError(f"puzzle does not match schema at: {paths}")

    if not isinstance(data, dict):
        raise PuzzleParseError("puzzle must be a JSON object")

    record = cast("dict[str, JsonValue]", data)
    puzzle_type = PuzzleType(_require_str(record.get("type"), "type"))

    # Which board a file holds is the rulebook's answer, not this module's. `puzzle.py`
    # used to read `size`, `regions` and `regionCapacity` itself and hand them to a
    # `Board`, which meant a genre whose board is not made of regions could not be
    # parsed here at all without a branch on the enum appearing in this file.
    board_record = _require_object(record.get("board"), "board")
    try:
        board = rulebook_for(puzzle_type).parse_board(board_record)
    except (BoardError, ValueError) as error:
        raise PuzzleParseError(str(error)) from error

    declared_level = record.get("difficulty")
    difficulty = None if declared_level is None else _require_int(declared_level, "difficulty")

    return Puzzle(
        id=_require_str(record.get("id"), "id"),
        puzzle_type=board.puzzle_type,
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
        "seed": puzzle.seed,
        "generatorVersion": puzzle.generator_version,
        "board": rulebook_for(puzzle.puzzle_type).board_to_dict(puzzle.board),
    }
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

    A nested object is written inline, on the one line its key is on. It is a
    leaf group of values (`board` holds `size` and two arrays, not a tree), so
    splitting it across lines would put a two-line region array in every file
    and make the diff of a changed number unreadable — which is the whole reason
    this renderer exists.
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
    if isinstance(value, dict):
        inner = ", ".join(f"{json.dumps(k)}: {_render(v)}" for k, v in value.items())
        return "{" + inner + "}"
    return json.dumps(value)


def _require_object(value: JsonValue | None, field: str) -> dict[str, JsonValue]:
    """The nested `board` object, or a parse error naming the field path.

    The schema has already refused a `board` that is not an object, so this is
    the guard for the direct `parse_puzzle` callers that skip straight to the
    per-field checks, and it keeps the field path in one convention with
    `_require_list` so a message points at `board.size` rather than `size`.
    """
    if not isinstance(value, dict):
        raise PuzzleParseError(f"{field} must be an object")
    return cast("dict[str, JsonValue]", value)


def _require_str(value: JsonValue | None, field: str) -> str:
    if not isinstance(value, str):
        raise PuzzleParseError(f"{field} must be a string")
    return value


def _require_int(value: JsonValue | None, field: str) -> int:
    """The envelope's integer fields, reusing the board's coercion.

    One definition of what the schema's "integer" means, for both halves of a file:
    a copy here is a second answer to the same question, and the two parsers'
    agreement on `4.0` is exactly what depends on there being only one.
    """
    try:
        return require_int(value, field)
    except BoardError as error:
        raise PuzzleParseError(str(error)) from error


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
