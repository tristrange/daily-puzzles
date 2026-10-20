/**
 * Parsing and validation of puzzle files.
 *
 * Structural validation is delegated to the shared `schema/puzzle.schema.json` so the
 * Python engine and this app agree on the file format. Everything the schema cannot
 * express is mirrored from `engine/src/queens_engine/puzzle.py`.
 */

import { isPuzzleId, puzzleTypeOf } from './dates'
import { trackVariantOf } from './trackSizes'
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import puzzleSchema from '@shared/schema/puzzle.schema.json'
import { Board, BoardError, PUZZLE_TYPES, type PuzzleType } from './board'
import { TrackGrid, TrackGridError } from './tracks'
import { WordGrid, WordGridError } from './wordPaths'
import { TrioGrid, TrioGridError } from './trio'
import { TentsGrid, TentsGridError } from './tents'

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
  readonly seed: number
  readonly generatorVersion: number
  /** Family-specific grid. Shared readers use width, height and cellCount. */
  readonly board: Board | TrackGrid | WordGrid | TrioGrid | TentsGrid
  readonly difficulty: DifficultyBand | null
}

/** Whether this puzzle is played on a marks board. */
export function isMarksPuzzle(puzzle: Puzzle): puzzle is Puzzle & { board: Board } {
  return puzzle.board instanceof Board
}

/** Whether this puzzle is played on a track grid. */
export function isTracksPuzzle(puzzle: Puzzle): puzzle is Puzzle & { board: TrackGrid } {
  return puzzle.board instanceof TrackGrid
}

/** Whether this puzzle uses the daily Trio grid. */
export function isTrioPuzzle(puzzle: Puzzle): puzzle is Puzzle & { board: TrioGrid } {
  return puzzle.board instanceof TrioGrid
}

/** Whether this puzzle uses the daily Tents grid. */
export function isTentsPuzzle(puzzle: Puzzle): puzzle is Puzzle & { board: TentsGrid } {
  return puzzle.board instanceof TentsGrid
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
  const boardRaw = record['board']
  if (typeof boardRaw !== 'object' || boardRaw === null || Array.isArray(boardRaw)) {
    throw new PuzzleParseError('puzzle is missing a board object')
  }
  const boardRecord = boardRaw as Record<string, unknown>

  const typeRaw = record['type']
  if (typeof typeRaw !== 'string' || !isPuzzleType(typeRaw)) {
    throw new PuzzleParseError(`type must be one of ${PUZZLE_TYPES.join(', ')}`)
  }

  // The one place the file format branches. Everything downstream asks the board
  // what it is rather than the type, because a board knows its own geometry and a
  // puzzle type does not.
  let board: Board | TrackGrid | WordGrid | TrioGrid | TentsGrid
  try {
    board = typeRaw === 'tents' ? new TentsGrid(String(record['id']), boardRecord['size'], boardRecord['trees'], boardRecord['rowClues'], boardRecord['colClues'])
      : typeRaw === 'trio' ? new TrioGrid(String(record['id']), boardRecord['givens'], boardRecord['relations'])
      : typeRaw === 'word-paths' ? parseWordGrid(boardRecord, Number(record['generatorVersion']))
      : typeRaw === 'train-tracks' ? parseTrackGrid(boardRecord) : parseMarksBoard(boardRecord, typeRaw)
  } catch (error) {
    if (error instanceof BoardError || error instanceof TrackGridError || error instanceof WordGridError || error instanceof TrioGridError || error instanceof TentsGridError) {
      throw new PuzzleParseError(error.message)
    }
    throw error
  }

  const id = String(record['id'])
  if (typeRaw === 'tents' && puzzleTypeOf(id) !== typeRaw) {
    throw new PuzzleParseError('tents requires a canonical date-tents id')
  }
  if (typeRaw === 'trio' && puzzleTypeOf(id) !== typeRaw) {
    throw new PuzzleParseError('trio requires a canonical date-trio id')
  }
  if (typeRaw === 'word-paths' && puzzleTypeOf(id) !== typeRaw) {
    throw new PuzzleParseError('word-paths requires a canonical date-words id')
  }
  const variant = trackVariantOf(id)
  if (variant !== null) {
    if (!isPuzzleId(id)) {
      throw new PuzzleParseError('sized Train Tracks id must name a canonical calendar day')
    }
    if (typeRaw !== 'train-tracks' || board.width !== variant.side || board.height !== variant.side) {
      throw new PuzzleParseError(`${variant.name} Train Tracks id requires a ${variant.side}x${variant.side} train-tracks board`)
    }
  }

  return {
    id,
    puzzleType: typeRaw,
    seed: Number(record['seed']),
    generatorVersion: Number(record['generatorVersion']),
    board,
    difficulty: toDifficultyBand(record['difficulty']),
  }
}

function numbers(record: Record<string, unknown>, key: string): number[] {
  const raw = record[key]
  if (!Array.isArray(raw)) {
    throw new PuzzleParseError(`board.${key} must be an array`)
  }
  return raw.map((value) => {
    if (typeof value !== 'number') {
      throw new PuzzleParseError(`board.${key}[] must contain numbers`)
    }
    return value
  })
}

function parseMarksBoard(
  record: Record<string, unknown>,
  puzzleType: PuzzleType,
): Board {
  const size = record['size']
  if (typeof size !== 'number') {
    throw new PuzzleParseError('board is missing a numeric size')
  }
  const regions = numbers(record, 'regions')

  if (regions.length !== size * size) {
    throw new PuzzleParseError(`regions has ${regions.length} entries, expected ${size * size}`)
  }

  const regionCount = Math.max(...regions) + 1
  const declared = record['regionCapacity']
  const capacity = Array.isArray(declared)
    ? numbers(record, 'regionCapacity')
    : Array.from({ length: regionCount }, () => 1)

  return new Board(size, regions, capacity, puzzleType)
}

function parseTrackGrid(record: Record<string, unknown>): TrackGrid {
  const width = record['width']
  const height = record['height']
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new PuzzleParseError('board is missing a numeric width and height')
  }
  // `TrackGrid`'s constructor checks the array lengths against the dimensions, the
  // clue ranges, the two running totals, the piece numbers and the two open ends —
  // so there is nothing left to check here.
  return new TrackGrid(
    width,
    height,
    numbers(record, 'rowClues'),
    numbers(record, 'colClues'),
    numbers(record, 'givens'),
  )
}

function parseWordGrid(record: Record<string, unknown>, version: number): WordGrid {
  const width = record['width']
  const height = record['height']
  const letters = record['letters']
  if (typeof width !== 'number' || typeof height !== 'number' || !Array.isArray(letters)) {
    throw new PuzzleParseError('board requires width, height and letters')
  }
  const checked = letters.map((letter: unknown) => {
    if (letter !== null && typeof letter !== 'string') {
      throw new PuzzleParseError('board.letters[] must be a letter or null')
    }
    return letter
  })
  return new WordGrid(width, height, checked, numbers(record, 'wordLengths'), version)
}
