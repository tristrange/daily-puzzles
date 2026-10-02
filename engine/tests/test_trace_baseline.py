"""The deduction trace baseline is enforced, and the checker is known to work.

A golden-file test whose comparison silently compares nothing is worse than no
test at all, so `differences` is exercised against a deliberately altered
baseline rather than trusted.
"""

from __future__ import annotations

import copy
import io
import json
from collections.abc import Generator
from contextlib import contextmanager, redirect_stderr
from pathlib import Path
from typing import Any, cast

from tools.trace_baseline import (
    BASELINE_PATH,
    TRACES_SEEDS,
    TRACES_SIZES,
    build_baseline,
    differences,
    main,
)

from queens_engine import canonical_dumps


@contextmanager
def _capture_stderr() -> Generator[io.StringIO]:
    """The failure report goes to stderr, so that is where the assertions look."""
    buffer = io.StringIO()
    with redirect_stderr(buffer):
        yield buffer


def test_every_traced_board_matches_the_committed_baseline() -> None:
    assert main([]) == 0, "tools.trace_baseline reported a changed trace"


def test_the_baseline_covers_every_board_in_the_set() -> None:
    """Guards the fixture against a stale or hand-trimmed file.

    If the board set grows and `--write` is not re-run, the checker still passes
    on the boards it has, so pin the count rather than trusting the file.
    """
    expected = {f"{size}:{seed}" for size in TRACES_SIZES for seed in TRACES_SEEDS}
    committed = cast("dict[str, Any]", json.loads(BASELINE_PATH.read_text(encoding="utf-8")))
    assert set(committed) == expected


def test_a_changed_step_is_reported() -> None:
    """A dropped rule application must fail, and name the fields that moved."""
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    first = cast("dict[str, Any]", next(iter(altered.values())))
    full = cast("list[list[Any]]", first["full"])
    full.pop()

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "full" in lines[0]
    # Only the step list changed: the outcome counters are a separate claim.
    assert "rounds" not in lines[0]


def test_a_changed_counter_is_reported() -> None:
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    first = cast("dict[str, Any]", next(iter(altered.values())))
    first["level"] = 5

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "level" in lines[0]


def test_a_missing_board_is_reported() -> None:
    expected = build_baseline()
    altered = copy.deepcopy(expected)
    del altered[next(iter(altered))]

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert "absent" in lines[0]


def test_a_non_object_entry_is_a_difference_not_a_match() -> None:
    """A board pinned as `null` is unpinned, and must not report as matching.

    The keys are all still present, so a key-set check passes and the suite claims
    every trace matches while one board has no trace at all. The golden file is
    hand-editable, which is exactly how this state arises.
    """
    expected = build_baseline()
    key = next(iter(expected))
    altered = copy.deepcopy(expected)
    altered[key] = None

    lines = differences(expected, altered)
    assert len(lines) == 1
    assert key in lines[0]
    assert "not an object" in lines[0]


def test_main_rejects_a_malformed_baseline(tmp_path: Path) -> None:
    """`main` reports a corrupt file as corrupt, not as a changed trace.

    Counting it among the changed traces would send a reader looking at the
    engine when the engine is behaving exactly as the committed file describes.
    """
    expected = build_baseline()
    key = next(iter(expected))
    expected[key] = None
    baseline = tmp_path / "baseline.json"
    baseline.write_text(canonical_dumps(expected), encoding="utf-8")

    with _capture_stderr() as captured:
        result = main(["--baseline", str(baseline)])

    assert result == 1
    assert "is malformed" in captured.getvalue()


def test_main_rejects_a_non_object_baseline(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline.json"
    baseline.write_text("[]\n", encoding="utf-8")

    with _capture_stderr() as captured:
        result = main(["--baseline", str(baseline)])

    assert result == 1
    assert "not a JSON object" in captured.getvalue()
