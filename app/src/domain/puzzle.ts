/**
 * Parsing and validation of puzzle files.
 *
 * Structural validation is delegated to the shared `schema/puzzle.schema.json` so the
 * Python engine and this app agree on the file format. Everything the schema cannot
 * express is mirrored from `engine/src/queens_engine/puzzle.py`.
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import puzzleSchema from '@shared/schema/puzzle.schema.json'
import { Board, BoardError, PUZZLE_TYPES, type PuzzleType } from './board'

export class PuzzleParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PuzzleParseError'
  }
}

/**
 * A band from the engine's `LEVEL_NAMES`, 1-based.
 *
 * Only files published since the weekly ramp carry one; everything earlier is
 * `null`, and nothing should read a band's absence as "Easy".
 */
export type DifficultyBand = 1 | 2 | 3 | 4 | 5

export const DIFFICULTY_BANDS: readonly DifficultyBand[] = [1, 2, 3, 4, 5]

export interface Puzzle {
  readonly id: string
  readonly puzzleType: PuzzleType
  readonly size: number
  readonly seed: number
  readonly generatorVersion: number
  readonly board: Board
  readonly difficulty: DifficultyBand | null
}

let compiled: ValidateFunction | undefined

function validateStructure(): ValidateFunction {
  compiled ??= new Ajv2020({ allErrors: true, strict: true }).compile(puzzleSchema)
  return compiled
}

/**
 * Where a rejection happened, what rule fired, and which property it named.
 *
 * A path alone does not identify a rule: `required`, `additionalProperties` and a
 * failing `if` all report the document root, so three different rules would share one
 * expectation. Naming the keyword and the property it objected to is what makes
 * "rejected for the right reason" assertable. `puzzle.py` builds the same key from
 * jsonschema, so the two messages can be compared directly.
 *
 * ajv wraps a failed `if` in its own error naming `then`, where jsonschema reports only
 * what is wrong inside it. The `if` wrapper adds nothing the inner error does not, so
 * the TypeScript parser drops it too.
 */
function describe(errors: readonly ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) return '<root>'
  const keys = errors
    .filter((error) => error.keyword !== 'if')
    .map((error) => {
      const path = error.instancePath.replace(/^\//, '') || '<root>'
      const params = error.params as {
        missingProperty?: string
        additionalProperty?: string
      }
      const named = params.missingProperty ?? params.additionalProperty
      return named === undefined
        ? `${error.keyword}:${path}`
        : `${error.keyword}:${path}:${named}`
    })
  return keys.length === 0 ? '<root>' : [...new Set(keys)].sort().join('; ')
}

function isPuzzleType(value: string): value is PuzzleType {
  return (PUZZLE_TYPES as readonly string[]).includes(value)
}

function toDifficultyBand(value: unknown): DifficultyBand | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > 5) return null
  return value as DifficultyBand
}

export function parsePuzzle(data: unknown): Puzzle {
  const validate = validateStructure()
  if (!validate(data)) {
    throw new PuzzleParseError(`puzzle does not match schema at: ${describe(validate.errors)}`)
  }

  const record = data as Record<string, unknown>
  const size = record['size']
  const regionsRaw = record['regions']
  if (typeof size !== 'number' || !Array.isArray(regionsRaw)) {
    throw new PuzzleParseError('puzzle is missing a numeric size or a regions array')
  }

  const regions = regionsRaw.map((value) => {
    if (typeof value !== 'number') throw new PuzzleParseError('regions[] must contain numbers')
    return value
  })

  if (regions.length !== size * size) {
    throw new PuzzleParseError(`regions has ${regions.length} entries, expected ${size * size}`)
  }

  const regionCount = Math.max(...regions) + 1
  const declared = record['regionCapacity']
  const capacity = Array.isArray(declared)
    ? declared.map((value) => {
        if (typeof value !== 'number') {
          throw new PuzzleParseError('regionCapacity[] must contain numbers')
        }
        return value
      })
    : Array.from({ length: regionCount }, () => 1)

  const typeRaw = record['type']
  if (typeof typeRaw !== 'string' || !isPuzzleType(typeRaw)) {
    throw new PuzzleParseError(`type must be one of ${PUZZLE_TYPES.join(', ')}`)
  }

  let board: Board
  try {
    board = new Board(size, regions, capacity, typeRaw)
  } catch (error) {
    if (error instanceof BoardError) throw new PuzzleParseError(error.message)
    throw error
  }

  return {
    id: String(record['id']),
    puzzleType: board.puzzleType,
    size,
    seed: Number(record['seed']),
    generatorVersion: Number(record['generatorVersion']),
    board,
    difficulty: toDifficultyBand(record['difficulty']),
  }
}
