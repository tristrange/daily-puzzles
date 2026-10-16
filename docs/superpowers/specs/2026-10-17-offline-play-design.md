# Offline play

After one completed online visit, reopen the app without a connection and play
puzzles previously fetched online, including Today’s boards and archives browsed
online. Unfetched puzzles require a connection. Keep the existing game rules,
themes, progress formats, statistics and gestures unchanged. Tracks and Word
Paths retain their existing resume behavior; Queens/Star Battle still restart
unfinished attempts on reload. New marks-game persistence is separate work.

## Cache ownership

The production build emits a service worker and precaches its complete app
shell, including lazy Word Paths code, icons, manifest and vocabulary notices.
The cache version hashes the worker template, emitted assets and public shell
files. Cache-first navigation serves a consistent installed build. Updated
workers wait for all controlled windows to close: never skip waiting or reload
an active puzzle. Activation deletes only older app caches for this base path,
never puzzle downloads, another project’s caches or localStorage.

The existing puzzle loader owns data caching: use the network first, validate
both schema and requested ID, then retain a response. On unavailable, invalid
or unsuccessful responses, try the saved response and revalidate it. Never
cache missing files, HTML fallbacks, unsupported versions or mismatched IDs.
Storage failures must not prevent online play. Download keys remain scoped to
the app’s base path and separate from player progress.

## Player feedback and scope

Show an offline notice with an archive link. Unavailable daily slots and an
uncached puzzle explain the connection requirement rather than claiming that
nothing has been published. Keep a separate “app available offline” readiness
status after service-worker activation; avoid claiming every puzzle is saved.
Browser cache eviction or clearing site data removes offline downloads.
No background full-archive download, account sync, install prompt or forced
update. No new dependencies. Both `/` and `/daily-puzzles/` must work.

## Proof and rollback

Test validated fallback, corrupted/mismatched cache entries, storage denial,
unknown words versions, fresh network precedence and mixed available/missing
slots. Test the actual worker template for installation failure, scoped cleanup,
GET-only routing, lazy assets and waiting-update behavior. Build at both base
paths; browser-check reload/play with the temporary server stopped.

After shipping, reverting registration alone is insufficient: keep a network-only
retirement `sw.js` at the registered URL, have it activate, delete only its app
cache prefix and unregister itself without reloading clients. Retain puzzle
readers and localStorage. Rollbacks require the same PR/review/deploy process.

## Following UI work

1. Expand large boards on wide screens; remove the 480px/48svh cap alongside a
   compact control sidebar. Keep mobile controls reachable and preserve gestures.
2. Archive: one visible game selector and compact rows, selection in the URL;
   avoid another menu page or four long stacked cards.
3. Stats: an All/per-game selector, a compact recent list and meaningful per-game
   timing summaries rather than comparing unrelated puzzles’ fastest times.
4. Rules: shared help plus dedicated per-game pages, linked from active boards.
