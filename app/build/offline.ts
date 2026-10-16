import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const PUBLIC_SHELL = [
  'favicon.svg', 'manifest.webmanifest', 'word-paths-vocabulary-notice.txt',
  'icons/apple-touch-icon.png', 'icons/puzzle-192.png', 'icons/puzzle-512.png',
]

export function renderOfflineWorker(
  base: string,
  files: Record<string, string | Uint8Array>,
  template: string,
): string {
  const hash = createHash('sha256').update(base).update(template)
  for (const [name, contents] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name).update(contents)
  }
  return template
    .replace('__CACHE_NAME__', JSON.stringify(`daily-puzzles.app:${base}:${hash.digest('hex').slice(0, 20)}`))
    .replace('__FILES__', JSON.stringify(Object.keys(files).map((name) => `${base}${name === 'index.html' ? '' : name}`)))
}

/** Emit one self-contained worker after Vite has emitted HTML and every lazy chunk. */
export function offlineShell(): Plugin {
  let base: string
  let publicDir: string
  return {
    name: 'offline-shell', apply: 'build', enforce: 'post',
    configResolved(config) { base = config.base; publicDir = config.publicDir },
    generateBundle(_options, bundle) {
      const files: Record<string, string | Uint8Array> = {}
      for (const [name, output] of Object.entries(bundle)) {
        files[name] = output.type === 'chunk' ? output.code : output.source
      }
      for (const name of PUBLIC_SHELL) files[name] = readFileSync(resolve(publicDir, name))
      const template = readFileSync(new URL('../offline/sw.js', import.meta.url), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderOfflineWorker(base, files, template) })
    },
  }
}
