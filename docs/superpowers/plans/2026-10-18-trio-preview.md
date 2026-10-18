# Trio playable preview

The user reprioritized finishing a playable Trio preview before engine-test
optimization. Keep the existing CI and all four daily games unchanged. Use the
five already verified pilot boards as bundled, answer-free preview data. Daily
schema/ID registration and generator freezing move after playtesting, so this
milestone reaches a working game without an incomplete fifth daily family.

- Add a strict fixed 9×9 preview parser and pure game rules in `domain/trio.ts`.
  Enforce givens, three of each symbol per row/column, no identical triples, and
  adjacent same/different relations. Pencil candidates are optional notes only.
- Add per-board, fingerprinted preview progress with safe restore and active time.
  Malformed snapshots and changed givens are rejected. No stats access or writes.
- Add a Trio board and stage using native symbol radios, notes toggle, roving grid
  focus and existing visual/tool patterns. Sun, crescent and five-point star use
  distinct SVG silhouettes and theme-aware colours. Tap/drag paints; one stroke
  is one Undo; cancellation restores it. Keep page scrolling outside the board and
  pinch zoom. Keyboard: arrows/Home/End, 1–3, Enter/Space, N, Delete and Ctrl/Cmd+Z.
- Add a lazy `/preview/trio?board=1` route, five-board selection, Today entry and
  direct rules section/link. Keep Today daily cards, archive and stats unchanged.
- Test the pure rules and snapshot boundary with a small focused set. Validate all
  five bundled boards in the existing Python engine and cross-check client
  completion against the measured answers (answers stay out of production data).
- Browser-test phone/desktop layouts, light/dark, entry links, keyboard, drag/undo,
  cancellation, notes, reload/board switching and an actual solve. Save screenshots.
  One independent review, app gates, focused PR and green checks; maintainer merges.

Done means the user has a deployed-preview link after merge and can play all five
boards with clear rules and persistent attempts. No difficulty claim, daily
rollout, hint engine, sharing feature, new dependency or CI optimization here.
