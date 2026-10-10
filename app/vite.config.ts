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
  build: {
    rollupOptions: {
      // A second entry, so the unlinked difficulty-test page is a real document at
      // `/nightmare-test/` rather than a route. The site routes on the hash, so a
      // route could only ever be reached as `#/nightmare-test`; an entry emits
      // `dist/nightmare-test/index.html`, which the host serves at the path.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        'nightmare-test/index': fileURLToPath(
          new URL('nightmare-test/index.html', import.meta.url),
        ),
      },
    },
  },
  resolve: {
    // `schema/` and `conformance/` are shared with the Python engine and live above this
    // package, so the app reads them as source rather than duplicating them.
    alias: { '@shared': repoRoot },
  },
  server: { fs: { allow: [repoRoot] } },
  test: {
    // `.tsx` as well as `.ts`: the suite renders components to static markup
    // with react-dom/server, which needs JSX and so needs the extension.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
