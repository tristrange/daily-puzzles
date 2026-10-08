"""The hint baseline is enforced, and the checker is known to work.

A golden-file test whose comparison silently compares nothing is worse than no
test at all, so `differences` is exercised against a deliberately altered
baseline rather than trusted — the lesson `test_trace_baseline` already records
after an earlier version of that checker skipped a corrupt entry.
"""

from __future__ import annotations

import copy
import io
import json
from collections.abc import Generator
from contextlib import contextmanager, redirect_stderr
from pathlib import Path
from typing import Any, cast

from tools.hint_baseline import ARCHIVE, BASELINE_PATH, build_baseline, differences, main

from queens_engine import canonical_dumps


@contextmanager
def _capture_stderr() -> Generator[io.StringIO]:
    buffer = io.StringIO()
    with redirect_stderr(buffer):
        yield buffer


def test_every_position_matches_the_committed_baseline() -> None:
    assert main([]) == 0, "tools.hint_baseline reported a changed hint"


def test_the_baseline_covers_every_committed_puzzle() -> None:
    """Guards the fixture against a stale or hand-trimmed file.

    If a puzzle is published and `--write` is not re-run, the checker still passes
    on the puzzles it has, so pin the key set rather than trusting the file.
    """
    committed = cast("dict[str, Any]", json.loads(BASELINE_PATH.read_text(encoding="utf-8")))
    on_disk = {path.stem for path in ARCHIVE.glob("*.json")}
    assert set(committed) == on_disk


def test_every_position_records_a_move_or_the_absence_of_one() -> None:
    """A position's expected answer is pinned either way.

    A generator that stopped emitting rows would otherwise shrink the corpus and
    the checker would pass on what was left.
    """
    for key, positions in build_baseline().items():
        rows = cast("list[list[Any]]", positions)
        assert rows, f"{key}: no positions recorded"
        for row in rows:
            assert len(row) == 3, f"{key}: malformed position {row}"


def test_the_corpus_asks_for_a_cross_as_well_as_a_placement() -> None:
    """Guards the mistake a cheaper generator makes.

    Recording only the saturated position — every known cross already applied —
    means the only hint left can be a placement or nothing, so all 428 expectations
    came out `queen` or `null` and the sweep never asked the app for a cross. A
    cross is the more common hint a player is given, so that corpus would have
    passed a port that could not produce one at all.
    """
    actions: set[str] = set()
    for positions in build_baseline().values():
        for row in cast("list[list[Any]]", positions):
            move = cast("list[Any] | None", row[2])
            if move is not None:
                actions.add(cast("str", move[1]))
    assert actions == {"queen", "x"}, f"only saw {sorted(actions)}"


def test_a_changed_move_is_reported_with_its_position() -> None:
    """A wrong hint must fail, and name the position that moved."""
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    key = next(iter(altered))
    rows = cast("list[list[Any]]", altered[key])
    rows[2][2] = [0, "x", "subset"]

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert key in lines[0]
    assert "positions [2]" in lines[0]


def test_a_dropped_position_is_reported() -> None:
    """A shrunken corpus must fail rather than pass on the rows that remain."""
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    key = next(iter(altered))
    before = len(cast("list[Any]", expected[key]))
    cast("list[Any]", altered[key]).pop()

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert f"{before} positions in the baseline, {before - 1} this run" in lines[0]


def test_a_non_list_entry_is_a_difference_not_a_match() -> None:
    """A puzzle pinned as `null` is unpinned, and must not report as matching.

    The keys are all still present, so a key-set check passes and the suite claims
    every position matches while one puzzle has none at all. The golden file is
    hand-editable, which is exactly how this state arises.
    """
    expected = build_baseline()
    key = next(iter(expected))
    altered = copy.deepcopy(expected)
    altered[key] = None

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert key in lines[0]
    assert "not a list" in lines[0]


def test_main_rejects_a_non_object_baseline(tmp_path: Path) -> None:
    """`main` reports a corrupt file as corrupt, not as a changed hint.

    Counting it among the differences would send a reader looking at the engine
    when the engine is behaving exactly as the committed file describes.
    """
    baseline = tmp_path / "baseline.json"
    baseline.write_text("[]\n", encoding="utf-8")

    with _capture_stderr() as captured:
        result = main(["--baseline", str(baseline)])

    assert result == 1
    assert "not a JSON object" in captured.getvalue()


def test_main_rejects_a_malformed_baseline(tmp_path: Path) -> None:
    expected = build_baseline()
    key = next(iter(expected))
    expected[key] = None
    baseline = tmp_path / "baseline.json"
    baseline.write_text(canonical_dumps(expected), encoding="utf-8")

    with _capture_stderr() as captured:
        result = main(["--baseline", str(baseline)])

    assert result == 1
    assert "is malformed" in captured.getvalue()


def test_a_missing_baseline_says_how_to_make_one(tmp_path: Path) -> None:
    with _capture_stderr() as captured:
        result = main(["--baseline", str(tmp_path / "absent.json")])
    assert result == 1
    assert "--write" in captured.getvalue() or "missing" in captured.getvalue()
