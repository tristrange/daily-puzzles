"""Familiar v1 answers, re-proven against the broader frozen v2 acceptance list."""

from dataclasses import replace

from .generator import MAX_SEED
from .word_paths import (
    SearchBudget,
    WordGrid,
    WordGridError,
    count_solutions,
    v1_vocabulary,
    v2_vocabulary,
    vocabulary_paths,
)
from .word_paths_gen import WordGenerationError
from .word_paths_gen import generate_grid as generate_v1

MAX_CANDIDATES = 50
MAX_EXTRA_PATHS = 8


def generate_grid(*, seed: int, budget: SearchBudget) -> WordGrid:
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise WordGridError("seed must be an unsigned 32-bit integer")
    answers = v1_vocabulary()
    accepted = v2_vocabulary()
    for attempt in range(MAX_CANDIDATES):
        try:
            grid = generate_v1(
                seed=(seed + attempt) % (MAX_SEED + 1), vocabulary=answers, budget=budget
            )
        except WordGenerationError:
            continue
        if (
            len(vocabulary_paths(grid, accepted, budget=budget))
            > len(grid.word_lengths) + MAX_EXTRA_PATHS
        ):
            continue
        if count_solutions(grid, accepted, budget=budget) == 1:
            return replace(grid, vocabulary_version=2)
    raise WordGenerationError(
        f"no broad-dictionary unique board within {MAX_CANDIDATES} candidates"
    )
