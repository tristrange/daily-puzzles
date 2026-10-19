# Account-free leaderboards

Status: proposed; implementation and hosted setup have not started.

## Purpose and constraints

Let players compare their time and hints for the same puzzle, immediately after
solving and later through a Leaderboards navigation item. Participation requires
no email, password or player registration. Keep this a small hobby-project feature.

Operating cost must remain $0. Keep the existing GitHub Pages site and use a
Supabase Free-plan organization. Never enable a paid plan, add-on or billing
upgrade automatically. Quota restrictions, pausing and network failures must
leave puzzle play and local Stats usable. There is no promise of continuous
leaderboard availability or that a provider's free plan will exist forever.

The user approved optional participation, anonymous browser identity, nicknames,
per-puzzle rankings, first solves, hint/time columns and free-plan operation in
conversation. This document fixes the remaining implementation choices.

## Player experience

- Add **Leaderboards** beside Today, Archive, Stats and How to play. Preserve
  usable navigation on a narrow phone; the fifth item must not overflow.
- Choose a game, date and, where applicable, Train Tracks size. Reuse existing
  game labels, date handling and size identities. Default to today's Queens;
  links from a finished puzzle select that exact puzzle.
- Show rank, nickname, time and hints. Order by hints ascending, then elapsed
  milliseconds ascending. Equal scores share a competition rank: 1, 1, 3.
  Submission time only stabilizes display order within a tie; it does not break it.
- Show the top 25 entries and the current player's entry/rank if outside that
  list. Refresh on opening, after submission and on an explicit Refresh action.
  No live subscriptions or timer-driven requests.
- Show the same compact leaderboard after a daily or archive solve, highlighting
  the player's entry. Preview boards never publish or appear in the catalog.
  Empty, loading, offline and unavailable states are distinct from a failed solve.

Browsing is public and does not create an anonymous user. **Join leaderboard**
asks for a nickname and explains what becomes public before enabling uploads.
Joining on a first-solve screen can publish that result; future first solves
publish automatically while participation is enabled. Earlier local history is
not bulk-uploaded, and replaying an already completed puzzle does not create a
new candidate. First solves before joining are otherwise kept local.

Nicknames are display labels, not reserved identities: duplicates are allowed.
Trim input and accept 2–20 ASCII letters, digits, spaces, underscores or hyphens;
render it as text. Store a nickname snapshot with each result. A changed nickname
affects future submissions. Do not add a profile editor, avatars or social features.

Keep a visible option to stop future publishing. Disabling participation cancels
pending uploads without deleting local Stats or already published results. Also
provide **Remove my published results**, with confirmation, through an operation
that can delete only the caller's results. Losing the browser identity prevents
self-service access to those rows; a maintainer can remove them administratively.

## Identity and privacy

Use Supabase anonymous sign-in only after joining. The official JavaScript SDK
handles session storage and renewal; do not build custom token handling. The
nickname/participation preference is stored locally, separately from game Stats.
If session storage is unavailable, explain that publishing cannot be enabled.
If an established session is lost, require joining again rather than silently
creating replacement identities and resubmitting pending results.

There is no device syncing or identity recovery. Clearing browser data, private
browsing or switching devices can produce a different identity. The uniqueness
guarantee is one result per anonymous identity and puzzle, not one per human.

Public responses contain only result rank, nickname, time, hints and whether an
entry belongs to the caller. Do not expose authentication IDs or session tokens.
The provider necessarily processes requests; update the current "nothing leaves
this browser" copy so it remains true for non-participants and accurately explains
optional publishing. Turnstile loads only during joining, not ordinary play.

## Shared data and access

Use two tables:

1. `leaderboard_puzzles`: exact published puzzle ID, game type, puzzle date,
   dimensions and optional size label. Populate it from committed puzzle files.
2. `leaderboard_results`: result ID, authenticated user ID, puzzle ID, nickname
   snapshot, elapsed milliseconds, hints and server receipt time. Enforce a unique
   constraint on `(user_id, puzzle_id)` and index the puzzle/hints/time ordering.

All result reads and mutations go through narrow database functions. Enable row
security and deny direct browser table writes. Explicitly revoke default function
execution grants; grant public ranking reads and authenticated result operations
only. Any privileged function uses an empty search path and qualified names.

`submit_result` derives the owner from the authenticated session, validates the
nickname and nonnegative safe-integer score fields, requires a registered puzzle,
and atomically retains the first row. Retries cannot replace a first result with
a better replay. Duplicate requests return the existing row successfully. Limit
new submissions to 20 per identity per minute, enforced within the transaction.
Reject puzzle dates beyond the current date in UTC+14, allowing real users in all
supported local dates without exposing future leaderboards through the app.

`get_leaderboard` returns the top 25, total entrants and the caller's rank if
authenticated. Missing identity is allowed. `remove_my_results` derives its owner
from the session and removes only that identity's rows. Deleting rows does not
cause the client to automatically upload the same local solves again.

Use Cloudflare Turnstile's free managed widget for joining, validated by Supabase
Auth. Keep the provider's anonymous-sign-in rate limit. Retain the database
submission limit as well; CAPTCHA does not authorize result ownership.

Scores are community-reported. The server validates ownership, metadata and
allowed puzzles; it does not verify the solved grid, replay every move, or prove
elapsed time/hints. The existing client rules still determine when a puzzle is
solved. State that limitation on the page. No prizes, global ratings or claims
of cheat-proof competition.

## Client integration and failures

Keep `storeSolve` local and synchronous. Each of the four daily stage components
supplies its fresh first-solve result to the shared solved panel. The marks stage
covers Queens and Star Battle; the other stages cover Train Tracks, Word Paths
and Trio. Preview callers omit the leaderboard result. Do not rewrite stored
Stats or change first-solve, hint-count, timer or completion rules.

The leaderboard module owns provider access, response validation, participation
and pending uploads. A small local queue stores only opted-in first solves and
retries identical payloads on opening the app, a return online or explicit Retry.
Never poll or launch overlapping sends for the same queue. Remove acknowledged
entries, and keep failed entries with a visible pending count. Bound the queue at
100; if full, keep new results in local Stats and explain that they were not
queued. Do not silently evict older pending entries.

Scope pending entries to the provider project and anonymous identity. On identity
loss, do not attach them to a new identity. With participation disabled, no queued
results are sent. Pending synchronization never blocks solve feedback or sharing.

Queens, Star Battle and Train Tracks currently count elapsed page time; Trio and
Word Paths count visible active time. Preserve those game-specific semantics and
describe them, since players are ranked only against the same exact puzzle.
Reset/Undo do not reduce recorded time or shown hints. Timer unification is outside
this feature. Stored history has no reliable evidence of a first attempt; the app
and server retain the first completed/submitted solve, respectively.

## Configuration and deployment

The browser needs only the project URL, publishable API key and Turnstile site key.
Missing configuration leaves cloud features disabled with a useful page message;
local play continues and there are no provider requests. Reject partial or invalid
configuration rather than sending requests to a guessed endpoint.

The trusted main deployment synchronizes the published-puzzle catalog before
activating the configured app. It uses a server-only Supabase secret key stored
as a GitHub Actions secret; this key must never use a `VITE_` variable or enter
the browser build. Do not grant it to PR jobs. Upsert catalog metadata from the
already verified puzzle files; retain older catalog rows with existing results.
Do not change the puzzle publishing recipe or replay contract.

Maintain versioned SQL migrations and a transaction-based database check script.
Prepare and verify the schema before enabling public app configuration. Keep
schema deployment separate from routine catalog synchronization. Disabling the
three public configuration values is the rollback: it stops cloud integration
without deleting results or changing local Stats. Do not automate provider
signup, accept terms, or attach a payment method.

See [the Free-plan setup guide](../../leaderboard-setup.md). The user must create
the provider projects; none exist for this feature yet.

## Delivery and proof

Use focused PRs: (1) schema, access tests and catalog/setup tooling; (2) anonymous
participation, ranked page, solved-screen integration and activation. The first
PR must not advertise a working public leaderboard. Public launch waits for both
pieces and the real hosted smoke check.

Verify ties and ordering, exact puzzle/size separation, immutable first results,
duplicate/concurrent submissions, invalid fields, owner isolation and public-data
projection with real database roles. Test fresh solves versus previews/replays,
opt-in, lost identity, pending retries, disabled configuration and local/offline
failure paths. Reuse the current app test runner; no broad test framework or
default rerun of unchanged puzzle generation tests is needed.

Browser checks cover desktop, 375 px and 320 px widths, keyboard navigation and
dark/light themes. On the configured free project, two anonymous browser sessions
must submit to one real published puzzle, see the correct order and ownership,
and fail to modify each other's results. Check public build assets for private
keys. A paused/unreachable backend must leave a complete local playthrough usable.

## Sources checked October 19, 2026

- [Supabase pricing](https://supabase.com/pricing): Free plan includes anonymous
  sign-ins, 50,000 monthly active users, 500 MB database and 5 GB outbound traffic.
- [Free quota restrictions](https://supabase.com/docs/guides/platform/billing-faq#what-will-happen-when-i-exceed-the-free-plan-quota)
  and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- [Anonymous identity and abuse prevention](https://supabase.com/docs/guides/auth/auth-anonymous).
- [Database functions and permissions](https://supabase.com/docs/guides/database/functions).
- [Supabase CAPTCHA integration](https://supabase.com/docs/guides/auth/auth-captcha)
  and [Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/).
