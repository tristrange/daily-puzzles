"""Frozen version 3 construction: six by six, five words from three to seven.

The larger board is the difficulty lever. Version 1's four familiar answers fit
a 5x5 grid; a fifth, longer answer needs the extra cells, and the eleven
blockers still leave room for false starts. Reject boards above the legal-path
cap so the noisiest candidates do not become dailies, then prove one exact cover
against the whole version 3 vocabulary. Keep this recipe unchanged for replay;
editorial changes need a new version.
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
    v3_answer_vocabulary,
    v3_vocabulary,
    validate_vocabulary,
    vocabulary_paths,
)

SIDE: Final = 6
WORD_LENGTHS: Final = (3, 4, 5, 6, 7)
MAX_LEGAL_PATHS: Final = 50
MAX_ATTEMPTS: Final = 20


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


def generate_grid(*, seed: int, budget: SearchBudget, max_attempts: int = MAX_ATTEMPTS) -> WordGrid:
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise WordGridError("seed must be an unsigned 32-bit integer")
    if type(max_attempts) is not int or max_attempts <= 0:
        raise WordGridError("max_attempts must be a positive integer")
    answers = v3_answer_vocabulary()
    accepted = v3_vocabulary()
    validate_vocabulary(answers)
    by_length = {
        length: tuple(sorted(word for word in answers if len(word) == length))
        for length in WORD_LENGTHS
    }
    if any(not words for words in by_length.values()):
        raise WordGenerationError("vocabulary needs a word for each length 3, 4, 5, 6 and 7")
    rng = Prng(seed)
    for _ in range(max_attempts):
        try:
            route = _route(rng, budget)
        except WordGenerationError:
            continue
        letters: list[str | None] = [None] * (SIDE * SIDE)
        offset = 0
        for index in rng.shuffled(list(range(len(WORD_LENGTHS)))):
            length = WORD_LENGTHS[index]
            options = by_length[length]
            word = options[rng.below(len(options))]
            for cell, letter in zip(route[offset : offset + length], word, strict=True):
                letters[cell] = letter
            offset += length
        grid = WordGrid(SIDE, SIDE, tuple(letters), WORD_LENGTHS, vocabulary_version=3)
        if len(vocabulary_paths(grid, accepted, budget=budget)) > MAX_LEGAL_PATHS:
            continue
        if count_solutions(grid, accepted, budget=budget) == 1:
            return grid
    raise WordGenerationError(f"no unique board within {max_attempts} attempts")
