"""Experimental English word paths; not registered for daily publication.

Uniqueness is relative to the supplied vocabulary, never to all English words.
"""

from __future__ import annotations

import hashlib
from collections.abc import Collection, Iterator
from dataclasses import dataclass
from itertools import islice
from pathlib import Path
from typing import Final

from .solver import DEFAULT_LIMIT

MAX_DIMENSION: Final = 7
MIN_WORD_LENGTH: Final = 3
MAX_WORD_LENGTH: Final = 6
PILOT_VOCABULARY_PATH: Final = Path(__file__).with_name("data") / "word-paths-en-v1.txt"


class WordGridError(ValueError):
    """A grid, vocabulary or player path violates the word-path contract."""


@dataclass(frozen=True)
class WordGrid:
    width: int
    height: int
    letters: tuple[str | None, ...]
    word_lengths: tuple[int, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "letters", tuple(self.letters))
        object.__setattr__(self, "word_lengths", tuple(self.word_lengths))
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


def _is_letter(letter: object) -> bool:
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


def validate_vocabulary(words: Collection[str]) -> None:
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
    validate_vocabulary(words)
    return tuple(sorted(words))


def v1_vocabulary() -> tuple[str, ...]:
    """The immutable acceptance vocabulary bound to generator version 1."""
    words = pilot_vocabulary()
    digest = hashlib.sha256("\n".join(words).encode()).hexdigest()
    if digest != "e054967cc550e50a1f0d245fab7e18979870922f0c41e2d4cc7ff2010d93f0ce":
        raise WordGridError("version 1 vocabulary digest mismatch; introduce a new version")
    return words


class WordSearchLimitError(RuntimeError):
    """The proof is incomplete; callers must not interpret it as a solution count."""


class SearchBudget:
    """A shared deterministic work limit for construction, paths and covers."""

    def __init__(self, max_states: int) -> None:
        if type(max_states) is not int or max_states < 0:
            raise WordGridError("max_states must be a nonnegative integer")
        self._max_states = max_states
        self._spent = 0

    @property
    def spent(self) -> int:
        return self._spent

    def step(self) -> None:
        if self._spent >= self._max_states:
            raise WordSearchLimitError(f"word-path search exhausted {self._max_states} states")
        self._spent += 1


@dataclass(frozen=True)
class WordPath:
    word: str
    cells: tuple[int, ...]

    @property
    def mask(self) -> int:
        return sum(1 << cell for cell in self.cells)


def vocabulary_paths(
    grid: WordGrid, vocabulary: Collection[str], *, budget: SearchBudget | None = None
) -> tuple[WordPath, ...]:
    """Enumerate all legal words, preserving distinct paths with the same cell set."""
    validate_vocabulary(vocabulary)
    allowed = {word for word in vocabulary if len(word) in grid.word_lengths}
    prefixes = {word[:length] for word in allowed for length in range(1, len(word) + 1)}
    found: set[WordPath] = set()

    def walk(cell: int, prefix: str, path: tuple[int, ...], used: int) -> None:
        if budget is not None:
            budget.step()
        letter = grid.letters[cell]
        if letter is None:
            return
        word = prefix + letter
        if word not in prefixes:
            return
        path = (*path, cell)
        used |= 1 << cell
        if word in allowed:
            canonical = min(path, path[::-1]) if word == word[::-1] else path
            found.add(WordPath(word, canonical))
        if len(word) < max(grid.word_lengths):
            for other in grid.neighbours(cell):
                if not used & (1 << other) and grid.letters[other] is not None:
                    walk(other, word, path, used)

    for cell, letter in enumerate(grid.letters):
        if letter is not None:
            walk(cell, "", (), 0)
    return tuple(sorted(found, key=lambda path: (len(path.word), path.word, path.cells)))


def iter_solutions(
    grid: WordGrid, vocabulary: Collection[str], *, budget: SearchBudget | None = None
) -> Iterator[tuple[WordPath, ...]]:
    """Exhaustive covers; an early yielded answer alone is not proof of uniqueness."""
    paths = vocabulary_paths(grid, vocabulary, budget=budget)
    by_length = {
        length: tuple(path for path in paths if len(path.word) == length)
        for length in grid.word_lengths
    }
    lengths = sorted(grid.word_lengths, key=lambda length: (len(by_length[length]), length))
    all_letters = sum(1 << cell for cell, letter in enumerate(grid.letters) if letter is not None)

    def cover(
        index: int, used: int, chosen: tuple[WordPath, ...]
    ) -> Iterator[tuple[WordPath, ...]]:
        if budget is not None:
            budget.step()
        if index == len(lengths):
            if used == all_letters:
                yield tuple(sorted(chosen, key=lambda path: len(path.word)))
            return
        # Fix one length per search depth: submission order cannot multiply covers.
        for path in by_length[lengths[index]]:
            mask = path.mask
            if not used & mask:
                yield from cover(index + 1, used | mask, (*chosen, path))

    yield from cover(0, 0, ())


def count_solutions(
    grid: WordGrid,
    vocabulary: Collection[str],
    *,
    limit: int = DEFAULT_LIMIT,
    budget: SearchBudget | None = None,
) -> int:
    """Count up to `limit`; limit=2 distinguishes impossible, unique and ambiguous."""
    if type(limit) is not int or limit <= 0:
        raise WordGridError("solution limit must be a positive integer")
    return sum(1 for _ in islice(iter_solutions(grid, vocabulary, budget=budget), limit))
