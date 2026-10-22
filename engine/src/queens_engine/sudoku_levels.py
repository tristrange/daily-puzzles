"""Sudoku levels and activation, read from the shared ID contract."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Final, cast

from .sudoku import Level


@dataclass(frozen=True, slots=True)
class SudokuVariant:
    name: Level
    suffix: str
    label: str


_PATH = Path(__file__).resolve().parents[3] / "conformance/id-cases/manifest.json"
_CONTRACT = json.loads(_PATH.read_text(encoding="utf-8"))["sudoku"]
SUDOKU_START: Final = date.fromisoformat(_CONTRACT["activationDay"])
SUDOKU_VARIANTS: Final[tuple[SudokuVariant, ...]] = tuple(
    SudokuVariant(cast("Level", v["name"]), v["suffix"], v["label"]) for v in _CONTRACT["variants"]
)


def sudoku_variant(identifier: str) -> SudokuVariant | None:
    """Classify the suffix; the shared ID parser validates the calendar day."""
    return next((v for v in SUDOKU_VARIANTS if identifier.endswith(v.suffix)), None)
