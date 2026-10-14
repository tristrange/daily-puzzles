# Word Paths vocabulary expansion

## Outcome

Replace the restrictive pilot acceptance policy for new boards with 16,781
3–6-letter words from SCOWL 2020.12.07 level 60. Include normal lowercase English,
American, British/-ize and common variant word categories; exclude names,
abbreviations, punctuation and accented spellings. Pin the released archive hash,
selection procedure, normalized word hash and full redistribution notices.
CAME, MEGA and ERA must be accepted on independent legal unused paths.

## Compatibility and construction

Keep v1 vocabulary, recipe, ten golden files and existing published puzzles
unchanged. Version 2 has a broader acceptance list but still draws its answers
from the 748 familiar v1 words. Try frozen-v1 candidates at `(seed + attempt) %
2**32`, then independently enumerate broad-dictionary paths and reject ambiguous
covers. Allow at most eight extra paths, fifty candidates and 500,000 shared search
states. Exhaustion is inconclusive, never proof of uniqueness. Validate at least
100 representative seeds; require >=95% successful uniquely verified boards.

Bind the grid's internal vocabulary version to generatorVersion while parsing;
JSON board fields stay unchanged. Pass the version through the existing rulebook
parse seam and the TypeScript WordGrid constructor. Rules, counters and restore
validation select that version. Keep v1 storage keys unchanged and use a separate
v2 progress key, preserving old attempts rather than overwriting them.

## Delivery

Update existing draft PR73 on feat/word-paths-daily. Regenerate its unpublished
seven-board starting batch and add ten v2 previews while retaining v1 fixtures.
Keep launch date October15, with normal publisher recovery. User has confirmed
mobile play works; no gesture or theme code changes are needed. Verify regenerated
boards and browser acceptance, then make the PR ready once tests and CI pass.
Home Screen/offline support remains deferred until this rollout is online.

## Rollback

Before merge, the previous branch commit restores the unpublished rollout.
After any v2 files are published, retain v1/v2 readers, word lists and files;
a pre-v2 app build cannot read v2 content. Fix or roll back only to a compatible
v2-capable build, without deleting older attempts or contracting the contract.
