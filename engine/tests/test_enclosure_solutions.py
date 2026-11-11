import json
from pathlib import Path
from typing import Any

import pytest
from tools.enclosure_solutions import run

from queens_engine.enclosure import EnclosureGrid
from queens_engine.enclosure_solution import make_solution, validate_solution
from queens_engine.enclosure_solver import InconclusiveResult, OptimalResult


def test_witness_binds_grid_and_rejects_illegal_walls() -> None:
    grid = EnclosureGrid(3, (), 4, 4, 1)
    witness = make_solution("2000-01-01-enclosure", grid)
    assert witness == {
        "version": 1,
        "id": "2000-01-01-enclosure",
        "board": "[3,[],4,4,1]",
        "walls": [1, 3, 5, 7],
    }
    validate_solution(witness, "2000-01-01-enclosure", grid)
    for altered in (
        {**witness, "board": "stale"},
        {**witness, "walls": [4]},
        {**witness, "walls": [1, 3, 5]},
        {**witness, "version": True},
    ):
        with pytest.raises(ValueError):
            validate_solution(altered, "2000-01-01-enclosure", grid)


def test_cli_writes_missing_only_and_checks_corrupt_and_orphan(tmp_path: Path) -> None:
    puzzles, out = tmp_path / "puzzles", tmp_path / "out"
    puzzles.mkdir()
    source = Path(__file__).resolve().parents[2] / "app/public/puzzles/2026-10-21-enclosure.json"
    puzzle: dict[str, Any] = json.loads(source.read_text())
    board = puzzle["board"]
    puzzle["id"] = "2026-01-01-enclosure"
    (puzzles / "2026-01-01-enclosure.json").write_text(json.dumps(puzzle))
    previews, preview_out = tmp_path / "previews.json", tmp_path / "preview-out.json"
    previews.write_text(json.dumps([board, board]))
    with pytest.raises(ValueError):
        run(puzzles, out, previews, preview_out, check=True)
    run(puzzles, out, previews, preview_out, check=False)
    original = (out / "2026-01-01-enclosure.json").read_bytes()
    assert [p["id"] for p in json.loads(preview_out.read_text())] == [
        "2000-01-01-enclosure",
        "2000-01-02-enclosure",
    ]
    run(puzzles, out, previews, preview_out, check=True)
    run(puzzles, out, previews, preview_out, check=False)
    assert (out / "2026-01-01-enclosure.json").read_bytes() == original
    (out / "orphan.json").write_text("{}")
    with pytest.raises(ValueError):
        run(puzzles, out, previews, preview_out, check=True)
    (out / "orphan.json").unlink()
    witness_path = out / "2026-01-01-enclosure.json"
    witness_path.write_text(json.dumps(json.loads(original), indent=2))
    with pytest.raises(ValueError):
        run(puzzles, out, previews, preview_out, check=True)
    witness_path.write_bytes(original)
    (out / "2026-01-01-enclosure.json").write_text("{}")
    with pytest.raises(ValueError):
        run(puzzles, out, previews, preview_out, check=False)


def test_generation_rejects_unproven_or_inconsistent_optimum(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    grid = EnclosureGrid(3, (), 4, 4, 1)
    for result in (
        InconclusiveResult(1),
        OptimalResult(1, (1, 3, 5, 7), 2, 0, 0),
        OptimalResult(1, (1, 3, 5), 1, 0, 0),
    ):

        def fake_solve(
            _grid: EnclosureGrid, response: InconclusiveResult | OptimalResult = result
        ) -> InconclusiveResult | OptimalResult:
            return response

        monkeypatch.setattr("queens_engine.enclosure_solution.solve_optimal", fake_solve)
        with pytest.raises(ValueError):
            make_solution("2000-01-01-enclosure", grid)


@pytest.mark.parametrize(
    "puzzle_id,puzzle_type",
    [
        ("2026-02-30-enclosure", "enclosure"),
        ("2026-01-01-enclosure", "queens"),
    ],
)
def test_daily_rejects_bad_calendar_or_family(
    tmp_path: Path, puzzle_id: str, puzzle_type: str
) -> None:
    puzzles = tmp_path / "puzzles"
    puzzles.mkdir()
    source = Path(__file__).resolve().parents[2] / "app/public/puzzles/2026-10-21-enclosure.json"
    puzzle = json.loads(source.read_text())
    puzzle.update(id=puzzle_id, type=puzzle_type)
    (puzzles / f"{puzzle_id}.json").write_text(json.dumps(puzzle))
    previews = tmp_path / "previews.json"
    previews.write_text("[]")
    with pytest.raises(ValueError):
        run(puzzles, tmp_path / "out", previews, tmp_path / "preview-out.json", check=False)


def test_failed_temporary_write_leaves_no_final_or_partial_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    puzzles = tmp_path / "puzzles"
    puzzles.mkdir()
    source = Path(__file__).resolve().parents[2] / "app/public/puzzles/2026-10-21-enclosure.json"
    (puzzles / source.name).write_bytes(source.read_bytes())
    previews = tmp_path / "previews.json"
    previews.write_text("[]")
    original_write = Path.write_text

    def fail_temp(path: Path, data: str, *args: Any, **kwargs: Any) -> int:
        if path.suffix == ".tmp":
            original_write(path, "partial")
            raise OSError("simulated interrupted write")
        return original_write(path, data, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", fail_temp)
    out = tmp_path / "out"
    with pytest.raises(OSError, match="simulated"):
        run(puzzles, out, previews, tmp_path / "preview-out.json", check=False)
    assert not (out / source.name).exists()
    assert not list(out.glob("*.tmp"))
