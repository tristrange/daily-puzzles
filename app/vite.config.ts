import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// Where the built site is served from: '/' locally, and /<repo>/ in the deploy
// workflow, because a GitHub Pages project site lives under the repository name.
//
// The trailing slash is required, not cosmetic. Vite passes `base` through
// verbatim, and the app reaches for it as `import.meta.env.BASE_URL` and
// concatenates -- `${BASE_URL}puzzles/${id}.json` -- so a base of
// '/daily-puzzles' asks for '/daily-puzzlespuzzles/...'. Vite's own asset URLs
// are fine either way, which is what makes the mistake look like a puzzle
// problem rather than a build one. Normalised here so no caller has to remember.
const base = process.env['BASE_PATH'] ?? '/'

export default defineConfig({
  plugins: [react()],
  base: base.endsWith('/') ? base : `${base}/`,
  resolve: {
    // `schema/` and `conformance/` are shared with the Python engine and live above this
    // package, so the app reads them as source rather than duplicating them.
    alias: { '@shared': repoRoot },
  },
  server: { fs: { allow: [repoRoot] } },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
