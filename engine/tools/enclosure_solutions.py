"""Generate or check immutable optimal Enclosure witnesses."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, cast

from queens_engine.board import PuzzleType
from queens_engine.enclosure import EnclosureGrid
from queens_engine.enclosure_solution import Solution, make_solution, validate_solution
from queens_engine.puzzle import load_puzzle

ROOT = Path(__file__).resolve().parents[2]
MAX_PREVIEWS = 31


def grid_from_board(board: Any) -> EnclosureGrid:
    if not isinstance(board, dict):
        raise ValueError("invalid board")
    board = cast(dict[str, Any], board)
    if not isinstance(board.get("water"), list):
        raise ValueError("invalid board")
    water = cast(list[Any], board["water"])
    try:
        return EnclosureGrid(
            board["size"],
            tuple(water),
            board["horse"],
            board["wallBudget"],
            board["optimalScore"],
        )
    except (KeyError, TypeError) as exc:
        raise ValueError("invalid board") from exc


def encoded(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False) + "\n"


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc


def canonical(value: Solution) -> Solution:
    return {
        "version": value["version"],
        "id": value["id"],
        "board": value["board"],
        "walls": value["walls"],
    }


def existing(path: Path, puzzle_id: str, grid: EnclosureGrid) -> Solution:
    value = read_json(path)
    validate_solution(value, puzzle_id, grid)
    if path.read_text(encoding="utf-8") != encoded(canonical(value)):
        raise ValueError(f"noncanonical solution: {path}")
    return value


def run(puzzles: Path, out: Path, previews: Path, preview_out: Path, *, check: bool) -> None:  # noqa: PLR0912
    if not puzzles.is_dir():
        raise ValueError(f"missing puzzle directory: {puzzles}")
    boards: list[tuple[str, EnclosureGrid]] = []
    for path in sorted(puzzles.glob("*-enclosure.json")):
        puzzle = load_puzzle(path)
        if (
            puzzle.id != path.stem
            or puzzle.puzzle_type is not PuzzleType.ENCLOSURE
            or not isinstance(puzzle.board, EnclosureGrid)
        ):
            raise ValueError(f"invalid puzzle: {path}")
        boards.append((puzzle.id, puzzle.board))
    preview_boards = read_json(previews)
    if not isinstance(preview_boards, list) or len(cast(list[Any], preview_boards)) > MAX_PREVIEWS:
        raise ValueError("invalid previews")
    preview_boards = cast(list[Any], preview_boards)
    preview_grids = [
        (f"2000-01-{i:02d}-enclosure", grid_from_board(board))
        for i, board in enumerate(preview_boards, 1)
    ]
    expected = {f"{puzzle_id}.json" for puzzle_id, _ in boards}
    if out.exists():
        orphans = {p.name for p in out.glob("*.json")} - expected
        if orphans:
            raise ValueError(f"orphan solutions: {sorted(orphans)}")
    pending: list[tuple[Path, str]] = []
    for puzzle_id, grid in boards:
        path = out / f"{puzzle_id}.json"
        if path.exists():
            existing(path, puzzle_id, grid)
        elif check:
            raise ValueError(f"missing solution: {path}")
        # Certify even stored witnesses against the current solver bound.
        generated = make_solution(puzzle_id, grid)
        if not path.exists():
            pending.append((path, encoded(generated)))
    if preview_out.exists():
        values = read_json(preview_out)
        if not isinstance(values, list) or len(cast(list[Any], values)) != len(preview_grids):
            raise ValueError("invalid preview solutions")
        values = cast(list[Any], values)
        for value, (puzzle_id, grid) in zip(values, preview_grids, strict=True):
            validate_solution(value, puzzle_id, grid)
        if preview_out.read_text(encoding="utf-8") != encoded([canonical(v) for v in values]):
            raise ValueError("noncanonical preview solutions")
    elif check:
        raise ValueError(f"missing preview solutions: {preview_out}")
    generated_previews = [make_solution(puzzle_id, grid) for puzzle_id, grid in preview_grids]
    if not preview_out.exists():
        pending.append((preview_out, encoded(generated_previews)))
    for path, contents in pending:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        try:
            temporary.write_text(contents, encoding="utf-8")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--puzzles", type=Path, default=ROOT / "app/public/puzzles")
    parser.add_argument("--out", type=Path, default=ROOT / "app/public/solutions/enclosure")
    parser.add_argument(
        "--previews", type=Path, default=ROOT / "app/src/domain/enclosurePreviews.json"
    )
    parser.add_argument(
        "--preview-out", type=Path, default=ROOT / "app/src/domain/enclosurePreviewSolutions.json"
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    run(args.puzzles, args.out, args.previews, args.preview_out, check=args.check)


if __name__ == "__main__":
    main()
