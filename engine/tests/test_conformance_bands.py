"""The shared `conformance/band-cases/` suite.

Asserted from the TypeScript side too, so the engine's `LEVEL_NAMES` — which its CLI
prints and `tools/verify` reports a ramp against — and the app's `DIFFICULTY_LABEL`, which
the player reads, cannot drift apart.

Both are keyed off the same 1-based integer in the puzzle file, so a rename on one side is
invisible on the other: nothing crashes, and `verify_replay` still passes, because it
compares boards. The only symptom is that the engine's own output calls a board Expert
while the archive card calls it Hard.
"""

from __future__ import annotations

import json
from functools import cache
from typing import Any

from jsonschema import Draft202012Validator

from queens_engine.difficulty import LEVEL_NAMES
from queens_engine.puzzle import CONFORMANCE_DIR, SCHEMA_PATH
from queens_engine.ramp import MAX_LEVEL, MIN_LEVEL, DifficultyTarget

CASES_DIR = CONFORMANCE_DIR / "band-cases"


def load_manifest() -> dict[str, Any]:
    manifest: Any = json.loads((CASES_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest


MANIFEST = load_manifest()
BANDS: list[dict[str, Any]] = MANIFEST["bands"]


def test_manifest_is_a_contiguous_one_based_range() -> None:
    """A gap or a zero-based start would make `level - 1` index the wrong name.

    Every lookup in the engine and the app is `level - 1` into an ordered list, so the
    manifest has to be exactly that shape rather than merely a set of names.
    """
    levels = [band["level"] for band in BANDS]
    assert levels == list(range(1, len(BANDS) + 1)), f"levels are not 1..{len(BANDS)}: {levels}"


def test_level_names_match_the_manifest() -> None:
    assert tuple(band["name"] for band in BANDS) == LEVEL_NAMES


def test_the_band_range_matches_the_manifest() -> None:
    """`MIN_LEVEL`/`MAX_LEVEL` derive from `LEVEL_NAMES`, so they follow automatically.

    Asserted anyway, because they are the numbers the ramp validates a target against, and
    a band added without the app's type union keeping up would pass silently.
    """
    assert MIN_LEVEL == 1
    assert len(BANDS) == MAX_LEVEL


def test_every_band_resolves_through_the_ramp() -> None:
    """`DifficultyTarget.level_name` is the engine's own lookup, checked per band.

    The ramp is what prints the name in `tools/verify`'s output and `tools/publish`'s
    notes, so this is the path a player-facing string actually travels.
    """
    for band in BANDS:
        target = DifficultyTarget(size=8, level=band["level"])
        assert target.level_name == band["name"]


def test_band_names_are_distinct() -> None:
    """Two bands sharing a name would make the label meaningless.

    Cheap to assert, and it is the failure that reads as a rendering bug rather than a
    data one, so it is worth naming here rather than leaving to review.
    """
    names = [band["name"] for band in BANDS]
    assert len(set(names)) == len(names), f"duplicate band names: {names}"


def test_the_schema_accepts_every_band_and_rejects_one_past_the_end() -> None:
    """The fourth copy: the schema's own `difficulty` bounds.

    Unlike the id pattern, this range is hand-written rather than generated from the
    manifest, so a band added to the manifest and to both registries while the schema
    stayed at `maximum: 5` would pass every other assertion here and then reject every
    puzzle using the new band — in both languages, at parse time, for a reason that has
    nothing to do with the puzzle.

    Asserting the behaviour rather than the numbers means this does not care how the
    bound is written, only what it allows.
    """
    for band in BANDS:
        assert not _schema_errors({"difficulty": band["level"]}), (
            f"schema rejects band {band['level']}, which the manifest declares"
        )
    assert _schema_errors({"difficulty": MAX_LEVEL + 1}), "schema accepts a band nobody declared"


def _schema_errors(overrides: dict[str, Any]) -> list[str]:
    """Schema failures for a valid queens puzzle carrying `overrides`."""
    document = {
        "id": "2026-10-11",
        "type": "queens",
        "seed": 1,
        "generatorVersion": 1,
        "board": {"size": 3, "regions": [0, 0, 0, 1, 1, 2, 2, 2, 2]},
        **overrides,
    }
    # jsonschema ships an untyped fallback in the iter_errors overload set, so the member
    # type is genuinely unknown to a strict checker. Suppressed here, as `puzzle.py` does.
    validator = _schema_validator()
    errors = validator.iter_errors(document)  # pyright: ignore[reportUnknownMemberType]
    return [error.message for error in errors]


@cache
def _schema_validator() -> Draft202012Validator:
    """The schema as both languages read it, validated once."""
    schema: Any = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)
