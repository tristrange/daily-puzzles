"""Rewrite the schema's `id` suffix pattern from the shared conformance manifest.

Usage:
    python -m tools.schema_ids            # rewrite the pattern in place
    python -m tools.schema_ids --check    # fail if the checked-in pattern is stale

`schema/puzzle.schema.json` carries a regex naming the suffixes a puzzle id may
end in. That is the one place in the format that cannot be a reference to a
registry — JSON Schema is data, so the pattern has to be spelled out. Leaving it
hand-written made it a fourth copy of the naming that `conformance/id-cases/`
already pins between the engine and the app, so adding a family meant four edits
and a stale pattern would fail a puzzle's validation for a reason unrelated to the
puzzle.

So the pattern is generated from the manifest's `types` block instead, and `--check`
is what CI and the tests run: it exits non-zero when the file on disk disagrees with
what the manifest implies. Keeping the checked-in file is the point — the schema is
read by both languages at runtime and has to exist as a file.

Escaping is deliberately not `re.escape`. ajv compiles patterns with the `u` flag
and ECMA-262 has no `\\-` escape, so a Python-style escaped hyphen is a syntax error
in the app while Python's `re` accepts it. Only characters that are unsafe outside a
character class in *both* flavours are escaped, and `test_conformance_ids` asserts
the pattern is accepted by ajv as well as by `re`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine.puzzle import CONFORMANCE_DIR, SCHEMA_PATH

MANIFEST_PATH: Path = CONFORMANCE_DIR / "id-cases" / "manifest.json"

# Safe unescaped outside a character class in both Python `re` and ECMA-262.
# The hyphen is deliberately absent: it is literal in both, and `\-` breaks ajv.
_UNSAFE = re.compile(r"[^A-Za-z0-9_/ -]")


def escape_suffix(suffix: str) -> str:
    """Escape one suffix for a pattern both regex flavours will compile."""
    return _UNSAFE.sub(lambda m: "\\" + m.group(0), suffix)


def expected_pattern(manifest: dict[str, Any]) -> str:
    """The `id` pattern implied by the manifest's declared suffixes."""
    suffixes = [entry["suffix"] for entry in manifest["types"] if entry["suffix"] != ""]
    # Longest first so a suffix that is a prefix of another still matches, which
    # `test_conformance_ids` asserts is not a case we have but should not allow.
    # Joined with `|`: concatenating would turn `-star` and `-tracks` into a single
    # `-star-tracks` suffix, which matches neither.
    alternation = "|".join(escape_suffix(s) for s in sorted(suffixes, key=len, reverse=True))
    return f"^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}({alternation})?$"


def load_manifest() -> dict[str, Any]:
    manifest: Any = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return manifest


def current_pattern() -> str:
    schema: Any = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return str(schema["properties"]["id"]["pattern"])


def write_pattern(pattern: str) -> bool:
    """Put `pattern` into the schema. Returns whether the file changed."""
    original = SCHEMA_PATH.read_text(encoding="utf-8")
    updated = re.sub(
        r'("pattern": ")\^\[0-9\].*?\$"',
        lambda m: m.group(1) + pattern.replace("\\", "\\\\") + '"',
        original,
        count=1,
    )
    if updated == original:
        return False
    SCHEMA_PATH.write_text(updated, encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.schema_ids")
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if the checked-in pattern is stale, instead of rewriting it",
    )
    args = parser.parse_args(argv)

    wanted = expected_pattern(load_manifest())
    if args.check:
        found = current_pattern()
        if found != wanted:
            print(
                f"schema id pattern is stale.\n  on disk: {found}\n  manifest: {wanted}\n"
                "Run: python -m tools.schema_ids",
                file=sys.stderr,
            )
            return 1
        print("schema id pattern matches the manifest.")
        return 0

    if write_pattern(wanted):
        print(f"schema id pattern updated to {wanted}")
    else:
        print(f"schema id pattern already {wanted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
