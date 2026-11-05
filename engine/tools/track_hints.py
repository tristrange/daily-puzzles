"""Check a generated Train Tracks puzzle with the app's actual hint engine."""

from __future__ import annotations

import subprocess
from pathlib import Path

from queens_engine import Puzzle, dumps_puzzle

_CHECKER = Path(__file__).resolve().parents[2] / "app" / "scripts" / "verify-track-hints.mjs"
_TIMEOUT_SECONDS = 60


def tracks_hints_solve(puzzle: Puzzle) -> bool:
    """Return false for a stalled board; fail closed on checker errors or timeouts."""
    try:
        result = subprocess.run(
            ["node", str(_CHECKER)],
            input=dumps_puzzle(puzzle),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"Train Tracks hint check could not run: {error}") from error
    if result.returncode == 0 and result.stdout.strip() == "solved":
        return True
    if result.returncode == 1 and result.stdout.strip() == "stalled":
        return False
    detail = result.stderr.strip() or f"exit code {result.returncode}"
    raise RuntimeError(f"Train Tracks hint check failed: {detail}")
