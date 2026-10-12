/**
 * The app's copy of a track grid, against the same fixtures the engine parses.
 *
 * `TrackGrid` mirrors `engine/src/queens_engine/tracks.py`, and the structural
 * rules are the same ones the engine enforces. What is *not* shared is the app's
 * read of a file: `parsePuzzle` picks the board class from the puzzle's `type`,
 * so a tracks file arriving on a marks code path is a failure nobody would
 * otherwise notice.
 */

import { describe, expect, it } from 'vitest'
import { Board } from './board'
import { marksBoard } from './helpers'
import { isMarksPuzzle, isTracksPuzzle, parsePuzzle, PuzzleParseError } from './puzzle'
import { TrackGrid, TrackGridError } from './tracks'

/** A 3x3 file whose only line runs across the middle row. */
const TRACKS_FILE = {
  id: '2026-10-12-tracks',
  type: 'train-tracks',
  seed: 7,
  generatorVersion: 1,
  board: {
    width: 3,
    height: 3,
    rowClues: [0, 3, 0],
    colClues: [1, 1, 1],
    givens: [0, 0, 0, 1, 0, 1, 0, 0, 0],
  },
}

const MARKS_FILE = {
  id: '2026-10-12',
  type: 'queens',
  seed: 7,
  generatorVersion: 1,
  board: { size: 2, regions: [0, 0, 1, 1] },
}

describe('parsePuzzle on a track grid', () => {
  it('builds a TrackGrid rather than a marks Board', () => {
    const puzzle = parsePuzzle(TRACKS_FILE)
    expect(isTracksPuzzle(puzzle)).toBe(true)
    expect(isMarksPuzzle(puzzle)).toBe(false)
    expect(puzzle.board).toBeInstanceOf(TrackGrid)
  })

  it('answers geometry from the grid, since a puzzle has no size', () => {
    const puzzle = parsePuzzle(TRACKS_FILE)
    expect(puzzle.board.width).toBe(3)
    expect(puzzle.board.height).toBe(3)
    expect(puzzle.board.cellCount).toBe(9)
    if (!isTracksPuzzle(puzzle)) throw new Error('expected a track grid')
    expect(puzzle.board.total).toBe(3)
  })

  it('still refuses a marks puzzle on the same field', () => {
    const puzzle = parsePuzzle(MARKS_FILE)
    expect(isMarksPuzzle(puzzle)).toBe(true)
    expect(puzzle.board).toBeInstanceOf(Board)
  })

  it('reads the type from the file, not from the board it built', () => {
    // A `Board` carries its own `puzzleType` and a `TrackGrid` does not, so the
    // envelope is the only place both can agree on.
    expect(parsePuzzle(TRACKS_FILE).puzzleType).toBe('train-tracks')
    expect(parsePuzzle(MARKS_FILE).puzzleType).toBe('queens')
  })

  it('rejects a track grid whose rows and columns disagree', () => {
    const bad = { ...TRACKS_FILE, board: { ...TRACKS_FILE.board, colClues: [1, 1, 2] } }
    expect(() => parsePuzzle(bad)).toThrow(/cannot disagree with itself/)
  })

  it('rejects a track grid whose clue arrays do not match its dimensions', () => {
    const bad = { ...TRACKS_FILE, board: { ...TRACKS_FILE.board, rowClues: [0, 3] } }
    expect(() => parsePuzzle(bad)).toThrow(/row clues/)
  })

  it('rejects a track grid with a piece number that does not exist', () => {
    const bad = {
      ...TRACKS_FILE,
      board: { ...TRACKS_FILE.board, givens: [0, 0, 0, 1, 0, 1, 0, 0, 7] },
    }
    // The schema catches this one before `TrackGrid` is built, which is the point
    // of having the cap in both places — the model check below is for a grid
    // built in memory rather than read from a file.
    expect(() => parsePuzzle(bad)).toThrow(PuzzleParseError)
    expect(
      () =>
        new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 7]),
    ).toThrow(/pieces run 0 to 6/)
  })

  it('rejects a track grid whose givens do not make exactly two ends', () => {
    // Both ends given, both facing outwards — that is the format's promise. Take
    // one away and the grid can no longer be finished.
    const bad = {
      ...TRACKS_FILE,
      board: { ...TRACKS_FILE.board, givens: [0, 0, 0, 1, 0, 0, 0, 0, 0] },
    }
    expect(() => parsePuzzle(bad)).toThrow(/exactly 2 ends/)
  })
})

describe('the two board models do not overlap', () => {
  it('refuses to build a marks Board for a family it cannot play', () => {
    expect(
      () => new Board(2, [0, 0, 1, 1], [1, 1], 'train-tracks'),
    ).toThrow(/not played on a marks board/)
  })

  it('has no regions to ask a TrackGrid about', () => {
    // Not a missing feature — a different model. The point of the test is that
    // nothing quietly reaches for marks fields on a grid that has none, so the
    // narrow every marks test uses refuses rather than returning something odd.
    expect(() => marksBoard(parsePuzzle(TRACKS_FILE))).toThrow(/not played on a marks board/)
  })

  it('reports a track grid failure as a parse error, not a crash', () => {
    const bad = { ...TRACKS_FILE, board: { ...TRACKS_FILE.board, givens: [0, 0, 0, 9, 0, 1, 0, 0, 0] } }
    let caught: unknown
    try {
      parsePuzzle(bad)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PuzzleParseError)
    expect(caught).not.toBeInstanceOf(TrackGridError)
  })
})