"""Regenerate deterministic gameplay positions shared with the browser tests."""

from __future__ import annotations

import json
from pathlib import Path

from queens_engine.board import JsonValue
from queens_engine.enclosure import EnclosureGrid, evaluate, neighbours
from queens_engine.prng import Prng

OUTPUT = Path(__file__).resolve().parents[2] / "conformance/enclosure-cases/generated.json"


def build_cases() -> list[dict[str, JsonValue]]:
    rng = Prng(20261111)
    cases: list[dict[str, JsonValue]] = []
    for index in range(64):
        size = 3 + index % 6
        horse = (size // 2) * size + size // 2
        water = tuple(c for c in range(size**2) if c != horse and rng.below(4) == 0)
        grass = [c for c in range(size**2) if c != horse and c not in water]
        random_walls = sorted(rng.shuffled(grass)[: rng.below(min(10, len(grass)) + 1)])
        interior = {
            c
            for c in range(size**2)
            if 0 < c // size < size - 1 and 0 < c % size < size - 1 and c not in water
        }
        perimeter = sorted(
            {
                n
                for c in interior
                for n in neighbours(size, c)
                if n not in interior and n not in water
            }
        )
        budget = max(len(random_walls), len(perimeter))
        grid = EnclosureGrid(size, water, horse, budget)
        for variant, walls in enumerate((random_walls, perimeter, perimeter[1:])):
            result = evaluate(grid, walls)
            cases.append(
                {
                    "name": f"generated-{index}-{variant}",
                    "size": size,
                    "water": list(water),
                    "horse": horse,
                    "wallBudget": budget,
                    "walls": list(walls),
                    "escaped": result.escaped,
                    "reachable": list(result.reachable),
                    "score": result.score,
                }
            )
    return cases


def main() -> None:
    OUTPUT.write_text(json.dumps(build_cases(), separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
