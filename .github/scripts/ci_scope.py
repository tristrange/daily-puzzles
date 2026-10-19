"""Skip engine work only for known frontend/documentation changes."""

import os
import subprocess


def engine_required() -> bool:
    base = os.environ.get("BASE_SHA", "")
    if (
        os.environ.get("GITHUB_EVENT_NAME") != "pull_request"
        or not base
        or set(base) == {"0"}
    ):
        return True
    diff = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            base,
            os.environ.get("HEAD_SHA", "HEAD"),
        ],
        capture_output=True,
        check=False,
    )
    if diff.returncode:
        return True
    for path in os.fsdecode(diff.stdout).split("\0"):
        if not path:
            continue
        if path.startswith("app/public/puzzles/"):
            return True
        if path.startswith(("app/", "docs/", "backend/leaderboard/")) or path in {
            "README.md",
            "AGENTS.md",
            "LICENSE",
            ".gitignore",
        }:
            continue
        return True
    return False


if __name__ == "__main__":
    print(f"engine={str(engine_required()).lower()}")
