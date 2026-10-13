# Published puzzles

The engine writes these JSON files; the static web app reads them. Commit puzzle
content and preserve existing files so links, saved progress and replay stay stable.

From October 17, 2026 each day includes Queens (`YYYY-MM-DD.json`), Star Battle
(`YYYY-MM-DD-star.json`) and three Train Tracks boards:

- `YYYY-MM-DD-tracks-small.json`: 8×8
- `YYYY-MM-DD-tracks-medium.json`: 10×10
- `YYYY-MM-DD-tracks-large.json`: 12×12

Earlier Train Tracks files retain `YYYY-MM-DD-tracks.json` and their original 7×7
boards. The shared ID manifest owns the activation date and variant dimensions.
From `engine/`, run `python -m tools.publish --out ../app/public/puzzles` to fill
missing slots and `python -m tools.verify --dir ../app/public/puzzles` to replay
and validate the corpus. Existing files are never replaced by the publisher.
