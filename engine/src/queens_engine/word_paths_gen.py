"""Experimental 5x5 construction, deliberately outside the daily rulebook.

Place four words along a randomized self-avoiding walk, leaving seven blockers.
Reject ambiguity against every pilot word, not just the constructor's answers.
This recipe and vocabulary are provisional until editorial validation and rollout.
"""

from __future__ import annotations

from typing import Final

from .generator import MAX_SEED
from .prng import Prng
from .word_paths import (
    SearchBudget,
    WordGrid,
    WordGridError,
    count_solutions,
    validate_vocabulary,
    vocabulary_paths,
)

SIDE: Final = 5
WORD_LENGTHS: Final = (3, 4, 5, 6)
MAX_EXTRA_PATHS: Final = 2


class WordGenerationError(ValueError):
    """No proven unique board was constructed under the requested policy."""


def _route(rng: Prng, budget: SearchBudget) -> tuple[int, ...]:
    needed = sum(WORD_LENGTHS)

    def walk(path: tuple[int, ...]) -> tuple[int, ...] | None:
        budget.step()
        if len(path) == needed:
            return path
        row, col = divmod(path[-1], SIDE)
        neighbours = [
            r * SIDE + c
            for r, c in ((row - 1, col), (row, col + 1), (row + 1, col), (row, col - 1))
            if 0 <= r < SIDE and 0 <= c < SIDE and r * SIDE + c not in path
        ]
        for cell in rng.shuffled(neighbours):
            result = walk((*path, cell))
            if result is not None:
                return result
        return None

    route = walk((rng.below(SIDE * SIDE),))
    if route is None:
        raise WordGenerationError("no placement route found")
    return route


def generate_grid(
    *, seed: int, vocabulary: tuple[str, ...], budget: SearchBudget, max_attempts: int = 50
) -> WordGrid:
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise WordGridError("seed must be an unsigned 32-bit integer")
    if type(max_attempts) is not int or max_attempts <= 0:
        raise WordGridError("max_attempts must be a positive integer")
    validate_vocabulary(vocabulary)
    by_length = {
        length: tuple(sorted(word for word in vocabulary if len(word) == length))
        for length in WORD_LENGTHS
    }
    if any(not words for words in by_length.values()):
        raise WordGenerationError("vocabulary needs a word for each length 3, 4, 5 and 6")
    rng = Prng(seed)
    for _ in range(max_attempts):
        route = _route(rng, budget)
        letters: list[str | None] = [None] * (SIDE * SIDE)
        offset = 0
        for index in rng.shuffled(list(range(len(WORD_LENGTHS)))):
            length = WORD_LENGTHS[index]
            options = by_length[length]
            word = options[rng.below(len(options))]
            for cell, letter in zip(route[offset : offset + length], word, strict=True):
                letters[cell] = letter
            offset += length
        grid = WordGrid(SIDE, SIDE, tuple(letters), WORD_LENGTHS)
        if (
            len(vocabulary_paths(grid, vocabulary, budget=budget))
            > len(WORD_LENGTHS) + MAX_EXTRA_PATHS
        ):
            continue
        if count_solutions(grid, vocabulary, budget=budget) == 1:
            return grid
    raise WordGenerationError(f"no unique board within {max_attempts} attempts")
