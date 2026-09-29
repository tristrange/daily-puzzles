import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react()],
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
