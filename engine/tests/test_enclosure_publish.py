# pyright: reportPrivateUsage=false
from dataclasses import replace
from datetime import date, timedelta

import pytest
from tools import generate as generate_tool
from tools import publish, verify

from queens_engine import Puzzle, PuzzleType, verify_replay
from queens_engine.enclosure import EnclosureGrid
from queens_engine.enclosure_gen import generate, terrain_layout


def test_publisher_requires_the_backlog_from_october_12_only() -> None:
    before = date(2026, 10, 11)
    start = date(2026, 10, 12)
    assert not any(identifier.endswith("-enclosure") for identifier in publish._ids_for_day(before))
    assert publish._ids_for_day(start)[-1] == "2026-10-12-enclosure"
    existing = set(publish._ids_for_day(before)) | set(publish._ids_for_day(start))
    existing.remove("2026-10-12-enclosure")
    assert publish._first_incomplete_day(existing, before, start) == start


def test_terrain_identity_ignores_budget_and_publisher_bumps_a_repeat_seed() -> None:
    grid = generate(0)
    assert terrain_layout(grid) == terrain_layout(replace(grid, wall_budget=grid.wall_budget - 1))
    puzzle, _ = publish._generate(
        PuzzleType.ENCLOSURE,
        "2026-11-11-enclosure",
        0,
        avoid_enclosure_layouts={terrain_layout(grid)},
    )
    assert puzzle.seed != 0
    assert isinstance(puzzle.board, EnclosureGrid)
    assert terrain_layout(puzzle.board) != terrain_layout(grid)
    assert verify_replay(puzzle) == puzzle


def test_verifier_rejects_a_nearby_repeat_but_allows_a_distant_one() -> None:
    grid = generate(0)
    day = date(2026, 11, 11)
    first = Puzzle("2026-11-11-enclosure", PuzzleType.ENCLOSURE, 0, 1, grid)
    seen: list[tuple[date, tuple[int, ...]]] = []
    assert verify._enclosure_repeat_problem(day, first, seen) is None
    repeated = replace(
        first, id="2026-11-12-enclosure", board=replace(grid, wall_budget=grid.wall_budget - 1)
    )
    assert verify._enclosure_repeat_problem(day + timedelta(days=1), repeated, seen)
    assert verify._enclosure_repeat_problem(day + timedelta(days=15), repeated, seen) is None


def test_cli_reports_optimal_score_without_claiming_unique_walls(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert generate_tool.main(["--date", "2026-11-11", "--type", "enclosure", "--seed", "0"]) == 0
    output = capsys.readouterr().out
    assert "optimal score: 21 (verified)" in output
    assert "unique" not in output
