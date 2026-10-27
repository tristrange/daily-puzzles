"""Independently verify the three Killer Sudoku previews (offline; no answers in the app)."""

import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine/src"))

from queens_engine.sudoku import SudokuGrid  # noqa: E402
from queens_engine.sudoku import solve as solve_classic  # noqa: E402

combinations = {}
for size in range(1, 7):
    for values in itertools.combinations(range(1, 10), size):
        combinations.setdefault((size, sum(values)), []).append(sum(1 << (x - 1) for x in values))
allmask = 511
MAX_SOLUTIONS = 2
PREVIEW_COUNT = 3


def solve(cages, totals, givens, limit=250000):  # noqa: PLR0915
    rows = [0] * 9
    cols = [0] * 9
    boxes = [0] * 9
    used = [0] * len(cages)
    nums = [0] * 81
    owner = [0] * 81
    opts = []
    for ci, cage in enumerate(cages):
        for c in cage:
            owner[c] = ci
        opts.append(combinations.get((len(cage), totals[ci]), []))
    for c, d in enumerate(givens):
        if d:
            bit = 1 << (d - 1)
            r, c2 = divmod(c, 9)
            b = r // 3 * 3 + c2 // 3
            i = owner[c]
            if bit & (rows[r] | cols[c2] | boxes[b] | used[i]):
                return [], 0, True
            rows[r] |= bit
            cols[c2] |= bit
            boxes[b] |= bit
            used[i] |= bit
            nums[c] = d
    if any(
        not any(subset & used[i] == used[i] for subset in options) for i, options in enumerate(opts)
    ):
        return [], 0, False
    nodes = 0
    answers = []
    exhausted = False

    def search():
        nonlocal nodes, exhausted
        if nodes >= limit:
            exhausted = True
            return
        nodes += 1
        best = -1
        maskbest = 0
        bestn = 10
        for cell in range(81):
            if nums[cell]:
                continue
            r, c = divmod(cell, 9)
            b = r // 3 * 3 + c // 3
            i = owner[cell]
            free = 0
            for subset in opts[i]:
                if subset & used[i] == used[i]:
                    free |= subset & ~used[i]
            mask = free & ~(rows[r] | cols[c] | boxes[b]) & allmask
            n = mask.bit_count()
            if not n:
                return
            if n < bestn:
                best = cell
                maskbest = mask
                bestn = n
            if n == 1:
                break
        if best < 0:
            answers.append(nums[:])
            return
        r, c = divmod(best, 9)
        b = r // 3 * 3 + c // 3
        i = owner[best]
        while maskbest and len(answers) < MAX_SOLUTIONS and not exhausted:
            bit = maskbest & -maskbest
            maskbest -= bit
            nums[best] = bit.bit_length()
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit
            used[i] |= bit
            search()
            nums[best] = 0
            rows[r] ^= bit
            cols[c] ^= bit
            boxes[b] ^= bit
            used[i] ^= bit

    search()
    return answers, nodes, exhausted


def logically_solved(board):  # noqa: PLR0912
    """Propagate cage permutations and standard Sudoku singles without guessing."""
    units = (
        [[r * 9 + c for c in range(9)] for r in range(9)]
        + [[r * 9 + c for r in range(9)] for c in range(9)]
        + [[(b // 3 * 3 + i // 3) * 9 + b % 3 * 3 + i % 3 for i in range(9)] for b in range(9)]
    )
    masks = [1 << (value - 1) if value else 511 for value in board["givens"]]
    while True:
        before = masks[:]
        for unit in units:
            singles = [masks[i] for i in unit if masks[i].bit_count() == 1]
            for i in unit:
                if masks[i].bit_count() != 1:
                    for bit in singles:
                        masks[i] &= ~bit
            for bit in (1 << i for i in range(9)):
                places = [i for i in unit if masks[i] & bit]
                if len(places) == 1:
                    masks[places[0]] = bit
        for cage in board["cages"]:
            cells = cage["cells"]
            allowed = [0] * len(cells)
            for digits in itertools.permutations(range(1, 10), len(cells)):
                if sum(digits) != cage["sum"] or not all(
                    masks[cell] & (1 << (digit - 1))
                    for cell, digit in zip(cells, digits, strict=True)
                ):
                    continue
                for index, digit in enumerate(digits):
                    allowed[index] |= 1 << (digit - 1)
            for cell, mask in zip(cells, allowed, strict=True):
                masks[cell] &= mask
        if masks == before:
            break
    return [mask.bit_length() if mask.bit_count() == 1 else 0 for mask in masks]


def main():
    boards = json.loads((ROOT / "app/src/data/killer-sudoku-previews.json").read_text())
    cert = json.loads((ROOT / "docs/measurements/killer-sudoku-preview.json").read_text())
    assert len(boards) == len(cert["samples"]) == PREVIEW_COUNT
    for board, sample in zip(boards, cert["samples"], strict=True):
        assert board["id"] == sample["id"]
        cages = [cage["cells"] for cage in board["cages"]]
        totals = [cage["sum"] for cage in board["cages"]]
        assert sorted(cell for cage in cages for cell in cage) == list(range(81))
        solutions, nodes, exhausted = solve(cages, totals, board["givens"])
        assert not exhausted and solutions == [sample["solution"]], board["id"]
        assert logically_solved(board) == sample["solution"], board["id"]
        assert (
            len(solve_classic(SudokuGrid(tuple(board["givens"]), "hard")).solutions)
            == MAX_SOLUTIONS
        )
        print(f"{board['id']}: unique and logically solved, {nodes} search nodes")  # noqa: T201


if __name__ == "__main__":
    main()
