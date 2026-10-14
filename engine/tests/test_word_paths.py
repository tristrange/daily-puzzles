"""Word paths must be legal, and a complete cover must use every letter once."""

from pathlib import Path

import pytest

import queens_engine.word_paths as words
from queens_engine.word_paths import WordGrid, WordGridError, pilot_vocabulary, spell_path


def test_turning_path_spells_letters_in_order() -> None:
    grid = WordGrid(2, 2, ("C", "A", None, "T"), (3,))
    assert spell_path(grid, (0, 1, 3)) == "CAT"


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
