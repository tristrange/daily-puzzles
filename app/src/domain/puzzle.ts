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

export interface Puzzle {
  readonly id: string
  readonly puzzleType: PuzzleType
  readonly size: number
  readonly seed: number
  readonly generatorVersion: number
  readonly board: Board
}

let compiled: ValidateFunction | undefined

function validateStructure(): ValidateFunction {
  compiled ??= new Ajv2020({ allErrors: true, strict: true }).compile(puzzleSchema)
  return compiled
}

function describe(errors: readonly ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) return '<root>'
  return errors.map((error) => error.instancePath || '<root>').join('; ')
}

function isPuzzleType(value: string): value is PuzzleType {
  return (PUZZLE_TYPES as readonly string[]).includes(value)
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
  }
}
