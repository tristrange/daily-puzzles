import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8')) as {
  id?: string
  start_url: string
  scope: string
}

it.each(['/', '/daily-puzzles/'])('keeps installed app identity and launch within %s', (base) => {
  const site = new URL(base, 'https://example.test')
  const manifestUrl = new URL('manifest.webmanifest', site)
  const start = new URL(manifest.start_url, manifestUrl)
  // Explicit IDs resolve against the start URL's origin, unlike scope/icon URLs.
  const identity = new URL(manifest.id ?? start.href, `${start.origin}/`)
  identity.hash = ''
  expect(identity.href).toBe(site.href)
  expect(new URL(manifest.scope, manifestUrl).href).toBe(site.href)
  expect(start.href).toBe(`${site.href}#/`)
})
