# app

The player: React UI, game state, and the client-side hint engine. See the
[root README](../README.md) for the architecture, the puzzle rules, and the file contract
this app shares with the Python engine.

```sh
npm install
npm run dev        # dev server
npm test           # unit tests + shared conformance suite
npm run typecheck
npm run build
```

Puzzle files are read from `public/puzzles/`, written and committed by
`engine/tools/generate.py`.
