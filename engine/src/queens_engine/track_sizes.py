"""Train Tracks variants, read from the shared ID contract."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Final, Literal, cast

type TrackSize = Literal["small", "medium", "large"]


@dataclass(frozen=True, slots=True)
class TrackVariant:
    name: TrackSize
    suffix: str
    side: int
    label: str


_PATH = Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json"
_CONTRACT = json.loads(_PATH.read_text(encoding="utf-8"))["trainTracks"]
TRACK_SIZES_START: Final = date.fromisoformat(_CONTRACT["activationDay"])
TRACK_VARIANTS: Final[tuple[TrackVariant, ...]] = tuple(
    TrackVariant(cast("TrackSize", v["name"]), v["suffix"], v["side"], v["label"])
    for v in _CONTRACT["variants"]
)


def track_variant(identifier: str) -> TrackVariant | None:
    """Classify a registered size suffix; ID parsers validate its calendar day."""
    return next((v for v in TRACK_VARIANTS if identifier.endswith(v.suffix)), None)
