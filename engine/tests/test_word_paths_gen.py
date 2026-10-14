"""The pilot constructor must prove full-vocabulary uniqueness or fail explicitly."""

import pytest

from queens_engine import word_paths_gen as gen
from queens_engine.word_paths import (
    SearchBudget,
    WordGridError,
    WordSearchLimitError,
    count_solutions,
    pilot_vocabulary,
    vocabulary_paths,
)


@pytest.mark.parametrize("seed", [0, 1, 7, 42, 99])
def test_constructed_board_has_the_pilot_shape_and_a_unique_cover(seed: int) -> None:
    vocabulary = pilot_vocabulary()
    grid = gen.generate_grid(seed=seed, vocabulary=vocabulary, budget=SearchBudget(250_000))
    assert (grid.width, grid.height) == (5, 5)
    assert grid.word_lengths == (3, 4, 5, 6)
    assert sum(letter is None for letter in grid.letters) == 7
    assert count_solutions(grid, vocabulary) == 1


def test_replay_is_independent_of_input_vocabulary_order() -> None:
    vocabulary = pilot_vocabulary()
    first_budget, second_budget = SearchBudget(250_000), SearchBudget(250_000)
    first = gen.generate_grid(seed=7, vocabulary=vocabulary, budget=first_budget)
    second = gen.generate_grid(seed=7, vocabulary=vocabulary[::-1], budget=second_budget)
    assert first == second
    assert first_budget.spent == second_budget.spent


def test_constructor_limits_misleading_paths() -> None:
    vocabulary = pilot_vocabulary()
    grid = gen.generate_grid(seed=1, vocabulary=vocabulary, budget=SearchBudget(250_000))
    assert (
        len(vocabulary_paths(grid, vocabulary)) <= 6
    )  # Four answers and at most two alternatives.


def test_constructor_does_not_ignore_unintended_reverse_words() -> None:
    # Every possible selected three-letter answer has a second, different word
    # in reverse on those same cells. A target-words-only proof would miss it.
    with pytest.raises(gen.WordGenerationError):
        gen.generate_grid(
            seed=7,
            vocabulary=("CAT", "TAC", "LION", "APPLE", "GARDEN"),
            budget=SearchBudget(250_000),
            max_attempts=2,
        )


def test_exhausted_budget_never_returns_a_fallback_board() -> None:
    with pytest.raises(WordSearchLimitError):
        gen.generate_grid(seed=0, vocabulary=pilot_vocabulary(), budget=SearchBudget(0))


def test_each_length_needs_an_eligible_word() -> None:
    with pytest.raises(gen.WordGenerationError):
        gen.generate_grid(seed=0, vocabulary=("CAT", "LION", "APPLE"), budget=SearchBudget(100))


@pytest.mark.parametrize("seed", [-1, 2**32, True])
def test_invalid_seed_is_rejected(seed: int) -> None:
    with pytest.raises(WordGridError):
        gen.generate_grid(seed=seed, vocabulary=pilot_vocabulary(), budget=SearchBudget(100))


@pytest.mark.parametrize("attempts", [0, -1, True])
def test_invalid_attempt_limit_is_rejected(attempts: int) -> None:
    with pytest.raises(WordGridError):
        gen.generate_grid(
            seed=0, vocabulary=pilot_vocabulary(), budget=SearchBudget(100), max_attempts=attempts
        )
