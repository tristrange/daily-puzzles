"""Fingerprint the input paths and bytes consumed by archive replay."""

import hashlib
import os
import platform
import subprocess
import sys
from pathlib import Path

INPUTS = (
    ".github/actions/verify-archive/action.yml",
    ".github/scripts/archive_fingerprint.py",
    ".github/workflows/ci.yml",
    ".github/workflows/publish.yml",
    ".gitignore",
    "engine",
    "schema",
    "conformance",
    ":(exclude)engine/tests",
)


def fingerprint(root: Path) -> str:
    paths = set(
        subprocess.check_output(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", *INPUTS],
            cwd=root,
        ).split(b"\0")
    )
    paths.discard(b"")
    # The publisher verifies new puzzle files before staging them.
    for path in (root / "app/public/puzzles").glob("*.json"):
        paths.add(os.fsencode(path.relative_to(root)))

    digest = hashlib.sha256()
    for value in (
        sys.version,
        sys.platform,
        platform.machine(),
        os.environ.get("ImageOS", ""),
        os.environ.get("ImageVersion", ""),
        os.environ.get("ARCHIVE_UV_VERSION", ""),
    ):
        digest.update(value.encode() + b"\0")
    for name in sorted(paths):
        digest.update(name + b"\0")
        digest.update(hashlib.sha256((root / os.fsdecode(name)).read_bytes()).digest())
    return digest.hexdigest()


if __name__ == "__main__":
    print(fingerprint(Path(__file__).resolve().parents[2]))
