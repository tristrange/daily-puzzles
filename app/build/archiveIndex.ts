import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { PUZZLE_TYPES } from '../src/domain/board.ts'

const TYPES = new Set<string>(PUZZLE_TYPES)
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const dimension = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 16

/** Metadata only: board clues, seeds, and solutions stay out of the index. */
export function buildArchiveIndex(publicDir: string): string {
  const directory = resolve(publicDir, 'puzzles')
  const entries = readdirSync(directory).filter(name => name.endsWith('.json')).sort().flatMap(name => {
    try {
      const raw: unknown = JSON.parse(readFileSync(resolve(directory, name), 'utf8'))
      if (!object(raw) || typeof raw['id'] !== 'string' || `${raw['id']}.json` !== name
        || typeof raw['type'] !== 'string' || !TYPES.has(raw['type']) || !object(raw['board'])) return []
      const board = raw['board'], width = board['size'] ?? board['width'], height = board['size'] ?? board['height']
      if (!dimension(width) || !dimension(height)) return []
      const band = raw['difficulty']
      const difficulty = typeof band === 'number' && Number.isInteger(band) && band >= 1 && band <= 5 ? band : null
      return [{ id: raw['id'], type: raw['type'], difficulty, width, height }]
    } catch { return [] }
  })
  return JSON.stringify({ version: 1, puzzles: entries })
}

/** Provide the same index in local development and in the deployed build. */
export function archiveIndex(): Plugin {
  let publicDir: string, base: string
  return {
    name: 'archive-index',
    configResolved(config) { publicDir = config.publicDir; base = config.base },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== `${base}archive-index.json`) return next()
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.end(buildArchiveIndex(publicDir))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'archive-index.json', source: buildArchiveIndex(publicDir) })
    },
  }
}
