from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest
from tools import publish, verify

from queens_engine import GenerationError, PuzzleType, load_puzzle, nurikabe_gen, rulebook_for
from queens_engine.nurikabe import NurikabeSearchLimitError, is_solution, solve
from queens_engine.nurikabe_gen import canonical_layout, generate
from queens_engine.prng import Prng

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "conformance/schema-cases/nurikabe.accept.json"


def test_frozen_seed_replays_and_has_an_exhaustively_unique_answer() -> None:
    grid = generate(1)
    digest = hashlib.sha256(json.dumps(list(grid.clues)).encode()).hexdigest()
    assert digest == "e45d2e9123ccacc698144b45394ed9c7b0331d42b07b31561bc1b8fc315c3bc8"
    result = solve(grid)
    assert len(result.solutions) == 1
    assert is_solution(grid, result.solutions[0])
    assert grid.size == 7 and max(grid.clues) <= 5


def test_inconclusive_exact_calls_consume_the_shared_allowance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    puzzle = load_puzzle(FIXTURE)
    grid = nurikabe_gen.NurikabeGrid(7, tuple(json.loads(FIXTURE.read_text())["board"]["clues"]))
    answer = solve(grid).solutions[0]

    def candidate(_rng: Prng) -> tuple[nurikabe_gen.NurikabeGrid, tuple[int, ...]]:
        return grid, answer

    monkeypatch.setattr(nurikabe_gen, "_candidate", candidate)
    monkeypatch.setattr(nurikabe_gen, "EXACT_WORK", nurikabe_gen.EXACT_NODES)
    calls: list[int] = []

    def inconclusive(_grid: nurikabe_gen.NurikabeGrid, *, max_nodes: int) -> None:
        calls.append(max_nodes)
        raise NurikabeSearchLimitError("inconclusive after a possible first answer")

    monkeypatch.setattr(nurikabe_gen, "solve", inconclusive)
    with pytest.raises(nurikabe_gen.NurikabeGenerationError, match="inconclusive"):
        generate(puzzle.seed)
    assert calls == [nurikabe_gen.EXACT_NODES]


@pytest.mark.parametrize("seed", [-1, 2**32, True, 1.5])
def test_rejects_invalid_generation_seeds(seed: int) -> None:
    with pytest.raises(ValueError):
        generate(seed)


def test_daily_contract_and_unknown_generator_version() -> None:
    book = rulebook_for(PuzzleType.NURIKABE)
    puzzle = load_puzzle(FIXTURE)
    assert book.daily_ids(date(2026, 10, 11)) == ()
    assert book.daily_ids(date(2026, 10, 12)) == ("2026-10-12-nurikabe",)
    assert not book.rated and not book.logic_only and book.deduce(puzzle.board) is None
    assert book.dimensions(puzzle) == (7, 7)
    assert book.count_solutions(puzzle.board, limit=1) == 1
    with pytest.raises(ValueError, match="1 or 2"):
        book.count_solutions(puzzle.board, limit=3)
    with pytest.raises(GenerationError, match="unsupported"):
        book.replay(replace(puzzle, generator_version=2))
    with pytest.raises(GenerationError, match="without overrides"):
        book.generate(seed=1, puzzle_id=puzzle.id, size=7)


def test_canonical_layout_covers_rotation_and_reflection() -> None:
    assert canonical_layout(2, (1, 2, 3, 4)) == canonical_layout(2, (3, 1, 4, 2))
    assert canonical_layout(2, (1, 2, 3, 4)) == canonical_layout(2, (2, 1, 4, 3))
    assert canonical_layout(2, (1, 2, 3, 4)) != canonical_layout(2, (1, 1, 3, 4))


def test_repeat_admission_and_archive_verification_use_complete_layouts(tmp_path: Path) -> None:
    puzzle = load_puzzle(FIXTURE)
    assert isinstance(puzzle.board, nurikabe_gen.NurikabeGrid)
    layout = canonical_layout(7, solve(puzzle.board).solutions[0])
    seen: list[tuple[date, tuple[int, ...]]] = []
    assert verify._nurikabe_repeat_problem(date(2026, 10, 20), puzzle, seen) is None  # pyright: ignore[reportPrivateUsage]
    assert verify._nurikabe_repeat_problem(date(2026, 10, 25), puzzle, seen) is not None  # pyright: ignore[reportPrivateUsage]
    path = tmp_path / "2026-10-25-nurikabe.json"
    path.write_bytes(FIXTURE.read_bytes())
    assert publish._nearby_nurikabe_layouts(tmp_path, date(2026, 10, 12)) == {layout}  # pyright: ignore[reportPrivateUsage]
    assert publish._nearby_nurikabe_layouts(tmp_path, date(2026, 10, 10)) == set()  # pyright: ignore[reportPrivateUsage]
