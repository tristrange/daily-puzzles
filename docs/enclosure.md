# Horse Enclosure

The horse moves through orthogonally adjacent grass. Water and player walls block
movement. Reaching a geometric edge cell means escape and a score of zero.
Otherwise the score is the horse's reachable grass component, including its own
cell. Walls and disconnected pockets never score. Players may use fewer walls
than their budget; different optimal layouts are equally valid.

The pure Python and TypeScript rules share fixtures in
`conformance/enclosure-cases/`. The exhaustive Python oracle is bounded and is
intended for small test boards, not daily generation.

## Exact optimization

`enclosure_solver.solve_optimal` builds a CP-SAT model over land cells. Binary
inside/wall labels enforce the budget, protect the horse, and exclude boundary
cells from the inside. Every neighbor of an inside cell is inside or a wall.
A flow sends one unit from the horse to every other inside cell, preventing the
objective from counting disconnected enclosures. These constraints make the
inside region exactly the horse's reachable component.

Only `OPTIMAL` with an equal objective bound certifies an area. A separate flood
fill checks the returned wall witness, budget, and score. Deterministic work
exhaustion returns inconclusive; the wall-clock watchdog raises and aborts the
run. It must never cause generation to choose a different seed. Infeasibility
is distinct from a limited search. There is no uniqueness claim.

OR-Tools is pinned in the Python engine only. Browser scoring is a flood fill;
no solver or generation dependency is shipped to the app.

## Version one generation

The published recipe is 8x8, with 6–10 walls. The project's pinned SplitMix64 PRNG
generates short water channels and an interior horse. The deterministic search
tries at most 64 candidates, rejects initially enclosed layouts, and accepts only
a proved optimum of at least eight cells. Every accepted puzzle records its
optimal score, but the solver's wall witness is diagnostic and stays out of the
public JSON. Published recipes must remain replayable when a new version is added.

The quality report measures a deterministic greedy expansion, the gap to the
optimum, feasible scores encountered by that expansion, tied expansion choices,
water components, and low-degree land cells. These are diagnostics, not calibrated
human difficulty ratings. No difficulty band is shown initially.

Run the pilot from `engine/`:

```sh
uv run python -m tools.enclosure_pilot --seeds 200 --output /tmp/enclosure-pilot.json
```

The report counts successful certifications, rejected candidates, and errors. A
watchdog failure terminates the pilot and returns a nonzero exit status.
[The recorded pilot](measurements/enclosure-pilot.json) contains five runs over
200 seeds. All 1,000 generations certified a board. Timing varies with concurrent
work on this host; it is not a portable performance promise. Seed-zero geometry
and optimum are pinned by a golden test.

## Completion and saves

A valid explicit submission records the first completion. The board remains
editable, the completion clock freezes, and later submissions may improve the
saved best score. Undo and Reset change the editable board without erasing
completion or the best result. The optimal target remains visible.

Daily JSON follows the existing date/seed/version envelope. The board fields are
`size`, `water`, `horse`, `wallBudget`, and `optimalScore`; cells are row-major.
Current progress is fingerprinted separately from first-completion history.
Best results retain their wall layout so loading and backup import can recompute
the score. Legacy stats backups keep their array format.

Daily publication is activated separately after engine, app, and offline checks.
The game has no hints, leaderboard, bonuses, portals, or editor in this version.
Its inspiration is [enclose.horse](https://enclose.horse/); artwork and copy are
original, and submissions remain improvable here.
