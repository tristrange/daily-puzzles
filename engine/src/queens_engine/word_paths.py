"""English Word Paths rules; not yet published daily.

Uniqueness is relative to the supplied vocabulary, never to all English words.
"""

from __future__ import annotations

import hashlib
from collections.abc import Collection, Iterator
from dataclasses import dataclass
from functools import cache
from itertools import islice
from pathlib import Path
from typing import Final

from .solver import DEFAULT_LIMIT

MAX_DIMENSION: Final = 7
MIN_WORD_LENGTH: Final = 3
MAX_WORD_LENGTH: Final = 7
PILOT_VOCABULARY_PATH: Final = Path(__file__).with_name("data") / "word-paths-en-v1.txt"


class WordGridError(ValueError):
    """A grid, vocabulary or player path violates the word-path contract."""


@dataclass(frozen=True)
class WordGrid:
    width: int
    height: int
    letters: tuple[str | None, ...]
    word_lengths: tuple[int, ...]
    vocabulary_version: int = 1

    def __post_init__(self) -> None:
        if type(self.vocabulary_version) is not int or self.vocabulary_version not in (1, 2, 3):
            raise WordGridError("unsupported vocabulary version")
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
            raise WordGridError("word lengths must be integers from 3 to 7")
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
        or not (word.isascii() and word.isalpha() and word.isupper())
        for word in words
    ):
        raise WordGridError("vocabulary words must contain 3 to 7 A-Z letters")


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


@cache
def v2_vocabulary() -> tuple[str, ...]:
    """Frozen SCOWL acceptance list, broader than the familiar answer pool."""
    words = tuple(
        line.strip()
        for line in PILOT_VOCABULARY_PATH.with_name("word-paths-en-v2.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip() and not line.startswith("#")
    )
    validate_vocabulary(words)
    digest = hashlib.sha256("\n".join(words).encode()).hexdigest()
    if digest != "b5ffd19f0acf8e99fe2d2160ec86329e72bf6eeb6fe75f3786f013fc47da689a":
        raise WordGridError("version 2 vocabulary digest mismatch; introduce a new version")
    return words


@cache
def v3_seven_letter_vocabulary() -> tuple[str, ...]:
    """The authored seven-letter answers added for version 3.

    Versions 1 and 2 stop at six letters, so a five-word board needs a longer
    answer pool. The three- to six-letter answers stay in `v1_vocabulary`;
    generation draws from both.
    """
    words = tuple(
        line.strip()
        for line in PILOT_VOCABULARY_PATH.with_name("word-paths-en-v3-seven.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip() and not line.startswith("#")
    )
    if not words or any(len(word) != MAX_WORD_LENGTH for word in words):
        raise WordGridError("version 3 answer additions must be seven-letter words")
    validate_vocabulary(words)
    digest = hashlib.sha256("\n".join(words).encode()).hexdigest()
    if digest != "00d8a6a540b234315bd883a9b114fbc32eb93cd1c5b2f16a8f8e969081860b74":
        raise WordGridError("version 3 answer digest mismatch; introduce a new version")
    return words


def v3_answer_vocabulary() -> tuple[str, ...]:
    """The familiar answer pool for version 3: v1 plus the seven-letter additions."""
    return tuple(sorted((*v1_vocabulary(), *v3_seven_letter_vocabulary())))


@cache
def v3_vocabulary() -> tuple[str, ...]:
    """Frozen SCOWL acceptance list for version 3, now including seven-letter words."""
    words = tuple(
        line.strip()
        for line in PILOT_VOCABULARY_PATH.with_name("word-paths-en-v3.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip() and not line.startswith("#")
    )
    validate_vocabulary(words)
    if not set(v1_vocabulary()) <= set(words):
        raise WordGridError("version 3 acceptance must contain every earlier answer")
    digest = hashlib.sha256("\n".join(words).encode()).hexdigest()
    if digest != "1fbbc6ebccabbf7a17457c6e83fb61b15ec78d49fcc9cf5a9ffec43974ba536c":
        raise WordGridError("version 3 vocabulary digest mismatch; introduce a new version")
    return words


def vocabulary_for_version(version: int) -> tuple[str, ...]:
    vocabularies = {1: v1_vocabulary, 2: v2_vocabulary, 3: v3_vocabulary}
    if type(version) is not int or version not in vocabularies:
        raise WordGridError("unsupported vocabulary version")
    return vocabularies[version]()


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
