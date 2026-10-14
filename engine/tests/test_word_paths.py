"""Word paths must be legal, and a complete cover must use every letter once."""

from itertools import product
from pathlib import Path
from typing import cast

import pytest
from hypothesis import given
from hypothesis import strategies as st

import queens_engine.word_paths as words
from queens_engine.word_paths import WordGrid, WordGridError, pilot_vocabulary, spell_path


def test_turning_path_spells_letters_in_order() -> None:
    grid = WordGrid(2, 2, ("C", "A", None, "T"), (3,))
    assert spell_path(grid, (0, 1, 3)) == "CAT"


def test_caller_mutation_cannot_change_an_accepted_grid() -> None:
    letters, lengths = ["C", "A", "T"], [3]
    grid = WordGrid(3, 1, cast("tuple[str | None, ...]", letters), cast("tuple[int, ...]", lengths))
    letters[0], lengths[0] = "D", 4
    assert words.count_solutions(grid, ("CAT",)) == 1


@pytest.mark.parametrize(
    "width,height,letters,lengths",
    [
        (0, 1, (), (3,)),
        (True, 3, ("C", "A", "T"), (3,)),
        (8, 1, ("A",) * 8, (3, 5)),
        (3, 1, ("C", "A"), (3,)),
        (3, 1, ("C", "a", "T"), (3,)),
        (3, 1, ("C", "AB", "T"), (3,)),
        (3, 1, ("C", "Å", "T"), (3,)),
        (3, 1, ("C", "A", "T"), (4,)),
        (3, 1, ("C", "A", "T"), (True,)),
        (2, 1, ("A", "T"), (2,)),
        (6, 1, ("C", "A", "T", "D", "O", "G"), (3, 3)),
    ],
)
def test_malformed_grids_are_rejected(
    width: int, height: int, letters: tuple[str | None, ...], lengths: tuple[int, ...]
) -> None:
    with pytest.raises(WordGridError):
        WordGrid(width, height, letters, lengths)


@pytest.mark.parametrize("cells", [(0, 3, 1), (0, 1, 0), (0, 2, 3), (0, 1, 4), (True, 1, 3)])
def test_illegal_paths_are_rejected(cells: tuple[int, ...]) -> None:
    grid = WordGrid(2, 2, ("C", "A", None, "T"), (3,))
    with pytest.raises(WordGridError):
        spell_path(grid, cells)


def test_an_empty_path_is_not_a_word() -> None:
    with pytest.raises(WordGridError):
        spell_path(WordGrid(3, 1, ("C", "A", "T"), (3,)), ())


def test_pilot_vocabulary_can_supply_each_required_length() -> None:
    words = pilot_vocabulary()
    assert all(word.isascii() and word.isalpha() and word.isupper() for word in words)
    assert len(words) == len(set(words))
    assert {len(word) for word in words} == {3, 4, 5, 6}
    assert {"CAT", "LION", "APPLE", "GARDEN"}.issubset(words)


@pytest.mark.parametrize("contents", ["CAT\ncat\n", "CAT\nCAT\n", "CAT\nA-B\n", ""])
def test_vocabulary_loader_refuses_malformed_data(
    contents: str, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    data = tmp_path / "vocabulary.txt"
    data.write_text(contents)
    monkeypatch.setattr(words, "PILOT_VOCABULARY_PATH", data)
    with pytest.raises(words.WordGridError):
        words.pilot_vocabulary()


@pytest.mark.parametrize(
    "letters,vocabulary,expected",
    [("XYZ", ("CAT",), 0), ("CAT", ("CAT",), 1), ("CAT", ("CAT", "TAC"), 2)],
)
def test_counts_zero_one_and_two_covers(
    letters: str, vocabulary: tuple[str, ...], expected: int
) -> None:
    assert words.count_solutions(WordGrid(3, 1, tuple(letters), (3,)), vocabulary) == expected


def test_unintended_vocabulary_word_exposes_a_second_cover() -> None:
    grid = WordGrid(7, 1, tuple("CATLION"), (3, 4))
    assert words.count_solutions(grid, ("CAT", "LION")) == 1
    assert words.count_solutions(grid, ("CAT", "LION", "TAC")) == 2


def test_submission_order_does_not_multiply_covers() -> None:
    grid = WordGrid(7, 1, tuple("CATLION"), (4, 3))
    answers = list(words.iter_solutions(grid, ("LION", "CAT")))
    assert len(answers) == 1
    assert {(path.word, path.cells) for path in answers[0]} == {
        ("CAT", (0, 1, 2)),
        ("LION", (3, 4, 5, 6)),
    }


def test_reversed_palindrome_is_one_path() -> None:
    assert words.count_solutions(WordGrid(3, 1, tuple("ABA"), (3,)), ("ABA",)) == 1


def test_same_word_and_cell_set_can_have_distinct_paths() -> None:
    # Four choices of omitted square edge, each with two equivalent directions.
    grid = WordGrid(2, 2, tuple("AAAA"), (4,))
    assert words.count_solutions(grid, ("AAAA",), limit=10) == 4


def test_blockers_cannot_connect_a_word() -> None:
    grid = WordGrid(2, 2, ("C", None, "A", "T"), (3,))
    answers = list(words.iter_solutions(grid, ("CAT",)))
    assert len(answers) == 1
    assert answers[0][0].cells == (0, 2, 3)


def test_budget_exhaustion_is_not_a_uniqueness_proof() -> None:
    grid = WordGrid(7, 1, tuple("CATLION"), (3, 4))
    vocabulary = ("CAT", "TAC", "LION")
    budget = words.SearchBudget(10_000)
    answers = words.iter_solutions(grid, vocabulary, budget=budget)
    next(answers)
    first_answer_work = budget.spent
    with pytest.raises(words.WordSearchLimitError):
        words.count_solutions(grid, vocabulary, budget=words.SearchBudget(first_answer_work))
    assert words.count_solutions(grid, vocabulary) == 2


def test_path_enumeration_consumes_the_search_budget() -> None:
    grid = WordGrid(3, 1, tuple("CAT"), (3,))
    with pytest.raises(words.WordSearchLimitError):
        next(words.iter_solutions(grid, ("CAT",), budget=words.SearchBudget(0)))
    budget = words.SearchBudget(10_000)
    assert words.count_solutions(grid, ("CAT",), budget=budget) == 1
    assert budget.spent > 3


@pytest.mark.parametrize("limit", [0, -1, True])
def test_invalid_count_limit_is_rejected(limit: int) -> None:
    with pytest.raises(WordGridError):
        words.count_solutions(WordGrid(3, 1, tuple("CAT"), (3,)), ("CAT",), limit=limit)


@pytest.mark.parametrize("max_states", [-1, True])
def test_invalid_budget_is_rejected(max_states: int) -> None:
    with pytest.raises(WordGridError):
        words.SearchBudget(max_states)


@pytest.mark.parametrize("vocabulary", [("cat",), ("CAT", "CAT"), ("A-B",), ()])
def test_solver_rejects_invalid_vocabulary(vocabulary: tuple[str, ...]) -> None:
    with pytest.raises(WordGridError):
        words.count_solutions(WordGrid(3, 1, tuple("CAT"), (3,)), vocabulary)


AnswerKey = tuple[tuple[str, tuple[int, ...]], ...]


def reference_covers(grid: WordGrid, vocabulary: tuple[str, ...]) -> set[AnswerKey]:
    """Tiny-board reference: direct letter matching, sets and a Cartesian product.

    No production path enumeration, neighbours, prefix pruning or cover recursion.
    """
    choices: dict[int, set[tuple[str, tuple[int, ...]]]] = {n: set() for n in grid.word_lengths}
    for word in vocabulary:
        if len(word) not in choices:
            continue
        stack: list[tuple[int, ...]] = [
            (cell,) for cell, letter in enumerate(grid.letters) if letter == word[0]
        ]
        while stack:
            path = stack.pop()
            if len(path) == len(word):
                canonical = min(path, path[::-1]) if word == word[::-1] else path
                choices[len(word)].add((word, canonical))
                continue
            row, col = divmod(path[-1], grid.width)
            for cell, letter in enumerate(grid.letters):
                r, c = divmod(cell, grid.width)
                if (
                    cell not in path
                    and letter == word[len(path)]
                    and abs(r - row) + abs(c - col) == 1
                ):
                    stack.append((*path, cell))
    result: set[AnswerKey] = set()
    letter_cells = {cell for cell, letter in enumerate(grid.letters) if letter is not None}
    for assignment in product(*(choices[n] for n in sorted(choices))):
        cells = [cell for _, path in assignment for cell in path]
        if len(cells) == len(set(cells)) and set(cells) == letter_cells:
            result.add(tuple(sorted(assignment)))
    return result


@given(
    letters=st.lists(st.sampled_from(("A", "B")), min_size=4, max_size=4),
    vocabulary=st.sets(st.text(alphabet="AB", min_size=4, max_size=4), min_size=1),
)
def test_exact_solver_agrees_with_independent_tiny_reference(
    letters: list[str], vocabulary: set[str]
) -> None:
    grid = WordGrid(2, 2, tuple(letters), (4,))
    actual = {
        tuple(sorted((path.word, path.cells) for path in cover))
        for cover in words.iter_solutions(grid, tuple(sorted(vocabulary)))
    }
    assert actual == reference_covers(grid, tuple(sorted(vocabulary)))


@given(
    letters=st.lists(st.sampled_from(("A", "B")), min_size=8, max_size=8),
    vocabulary=st.sets(
        st.one_of(
            st.text(alphabet="AB", min_size=3, max_size=3),
            st.text(alphabet="AB", min_size=5, max_size=5),
        ),
        min_size=1,
        max_size=12,
    ),
)
def test_multiword_covers_agree_with_independent_reference(
    letters: list[str], vocabulary: set[str]
) -> None:
    grid = WordGrid(2, 4, tuple(letters), (3, 5))
    actual = {
        tuple(sorted((path.word, path.cells) for path in cover))
        for cover in words.iter_solutions(grid, tuple(sorted(vocabulary)))
    }
    assert actual == reference_covers(grid, tuple(sorted(vocabulary)))
