import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Where the built site is served from. '/' locally; the deploy workflow sets
  // it to /<repo>/ because a GitHub Pages project site lives under the
  // repository name. Every asset URL and the app's own puzzle fetches derive
  // from this, so a wrong value shows up as a blank page rather than a
  // subtly-wrong one.
  base: process.env['BASE_PATH'] ?? '/',
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
