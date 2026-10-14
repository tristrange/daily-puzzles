"""Experimental English word paths; not registered for daily publication.

Uniqueness is relative to the supplied vocabulary, never to all English words.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path
from typing import Final

MAX_DIMENSION: Final = 7
MIN_WORD_LENGTH: Final = 3
MAX_WORD_LENGTH: Final = 6
PILOT_VOCABULARY_PATH: Final = Path(__file__).with_name("data") / "word-paths-en-pilot.txt"


class WordGridError(ValueError):
    """A grid, vocabulary or player path violates the word-path contract."""


@dataclass(frozen=True)
class WordGrid:
    width: int
    height: int
    letters: tuple[str | None, ...]
    word_lengths: tuple[int, ...]

    def __post_init__(self) -> None:
        if any(
            type(n) is not int or not 1 <= n <= MAX_DIMENSION for n in (self.width, self.height)
        ):
            raise WordGridError("dimensions must be integers from 1 to 7")
        if len(self.letters) != self.cell_count:
            raise WordGridError("letter count must match the dimensions")
        if any(letter is not None and not _is_letter(letter) for letter in self.letters):
            raise WordGridError("cells must contain one A-Z letter or None for a blocker")
        if not self.word_lengths or any(
            type(n) is not int or not MIN_WORD_LENGTH <= n <= MAX_WORD_LENGTH
            for n in self.word_lengths
        ):
            raise WordGridError("word lengths must be integers from 3 to 6")
        if len(set(self.word_lengths)) != len(self.word_lengths):
            raise WordGridError("the pilot requires distinct word lengths")
        if sum(self.word_lengths) != sum(letter is not None for letter in self.letters):
            raise WordGridError("word lengths must cover every letter exactly once")

    @property
    def cell_count(self) -> int:
        return self.width * self.height

    def neighbours(self, cell: int) -> tuple[int, ...]:
        row, col = divmod(cell, self.width)
        return tuple(
            r * self.width + c
            for r, c in ((row - 1, col), (row, col + 1), (row + 1, col), (row, col - 1))
            if 0 <= r < self.height and 0 <= c < self.width
        )


def _is_letter(letter: str) -> bool:
    return isinstance(letter, str) and len(letter) == 1 and "A" <= letter <= "Z"


def spell_path(grid: WordGrid, cells: tuple[int, ...]) -> str:
    """Validate a player's geometry; dictionary and unused-slot checks are separate."""
    if not cells or len(set(cells)) != len(cells):
        raise WordGridError("a path must be nonempty and cannot reuse a cell")
    letters: list[str] = []
    for index, cell in enumerate(cells):
        if type(cell) is not int or not 0 <= cell < grid.cell_count:
            raise WordGridError("path cell is out of range")
        letter = grid.letters[cell]
        if letter is None:
            raise WordGridError("a path cannot enter a blocked cell")
        if index and cell not in grid.neighbours(cells[index - 1]):
            raise WordGridError("path steps must be orthogonally adjacent")
        letters.append(letter)
    return "".join(letters)


def _validate_vocabulary(words: Collection[str]) -> None:
    if not words or len(set(words)) != len(words):
        raise WordGridError("vocabulary must be nonempty and contain no duplicates")
    if any(
        not MIN_WORD_LENGTH <= len(word) <= MAX_WORD_LENGTH
        or not all(_is_letter(letter) for letter in word)
        for word in words
    ):
        raise WordGridError("vocabulary words must contain 3 to 6 A-Z letters")


def pilot_vocabulary() -> tuple[str, ...]:
    """Load the authored pilot list, with no external service or runtime downloads."""
    words = tuple(
        line.strip()
        for line in PILOT_VOCABULARY_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    )
    _validate_vocabulary(words)
    return tuple(sorted(words))
