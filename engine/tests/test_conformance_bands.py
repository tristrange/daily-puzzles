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
from typing import Any

from queens_engine.difficulty import LEVEL_NAMES
from queens_engine.puzzle import CONFORMANCE_DIR
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
