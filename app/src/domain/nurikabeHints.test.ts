import { expect, it } from 'vitest'
import daily from '@shared/docs/measurements/daily-nurikabe-launch.json'
import previews from '@shared/docs/measurements/nurikabe-preview.json'
import { createNurikabeGame, type NurikabeBoard, type NurikabeGame } from './nurikabe'
import { applyNurikabeHint, findNurikabeHint, nextNurikabeDeduction, revealNurikabeMistake } from './nurikabeHints'

function completions(board: NurikabeBoard): NurikabeGame[] {
  const { size, clues } = board, answers: NurikabeGame[] = []
  const adjacent = (a: number, b: number) => Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1
  for (let bits = 0; bits < 2 ** (size ** 2); bits++) {
    const cells = clues.map((_, cell) => bits & (1 << cell) ? 2 : 1) satisfies NurikabeGame
    if (clues.some((value, cell) => value && cells[cell] !== 2)) continue
    const remaining = new Set(cells.map((_, cell) => cell)), groups: number[][] = []
    while (remaining.size) {
      const first = [...remaining][0]!, group = [first]; remaining.delete(first)
      for (const cell of group) for (const other of [...remaining]) if (cells[cell] === cells[other] && adjacent(cell, other)) {
        remaining.delete(other); group.push(other)
      }
      groups.push(group)
    }
    if (groups.filter(group => cells[group[0]!] === 1).length !== 1) continue
    if (groups.filter(group => cells[group[0]!] === 2).some(group => {
      const numbered = group.filter(cell => clues[cell]! > 0)
      return numbered.length !== 1 || clues[numbered[0]!] !== group.length
    })) continue
    let square = false
    for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
      if ([row * size + col, row * size + col + 1, (row + 1) * size + col, (row + 1) * size + col + 1].every(cell => cells[cell] === 1)) square = true
    }
    if (!square) answers.push(cells)
  }
  return answers
}

it('each direct rule agrees with every independent completion of compatible tiny positions', () => {
  const rules = new Set<string>()
  for (const clues of [
    [1, 0, 1, 0, 0, 0, 1, 0, 1], [2, 0, 0, 0, 0, 0, 0, 0, 3],
    [0, 3, 0, 0, 0, 0, 1, 0, 1], [0, 0, 0, 0, 4, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0, 2, 0, 0],
  ]) {
    const board = { id: 'tiny', size: 3, clues }, answers = completions(board)
    expect(answers.length, JSON.stringify(clues)).toBeGreaterThan(0)
    for (const answer of answers) for (let mask = 0; mask < 512; mask++) {
      const game = answer.map((value, cell) => clues[cell] || mask & (1 << cell) ? value : 0) satisfies NurikabeGame
      const hint = nextNurikabeDeduction(board, game)
      if (!hint || hint.kind !== 'deduction') continue
      rules.add(hint.rule)
      const compatible = answers.filter(other => game.every((value, cell) => value === 0 || value === other[cell]))
      expect(compatible.every(other => other[hint.cell] === hint.value), JSON.stringify({ clues, game, hint })).toBe(true)
      expect(game[hint.cell]).toBe(0)
      expect(hint.support).not.toContain(hint.cell)
    }
  }
  expect([...rules].sort()).toEqual(['completed-island', 'island-expansion', 'sea-connection', 'sea-square', 'separate-islands', 'unreachable'])
})

it('warns before revealing one mistaken sea or land mark and refuses stale hints', () => {
  const board = { id: 'tiny', size: 3, clues: [1, 0, 1, 0, 0, 0, 1, 0, 1] }
  const game = createNurikabeGame(board).map((value, cell) => cell === 1 ? 2 : value) satisfies NurikabeGame
  const warning = findNurikabeHint(board, game)
  expect(warning.kind).toBe('mistake')
  if (warning.kind !== 'mistake') throw Error('Expected a mistake')
  const correction = revealNurikabeMistake(board, game, warning)
  expect(correction?.kind).toBe('correction')
  if (!correction) throw Error('Expected a correction')
  expect(revealNurikabeMistake(board, [...game], warning)).toBeNull()
  expect(applyNurikabeHint(board, [...game], correction)).toEqual(game)
  const cleared = applyNurikabeHint(board, game, correction)
  expect(cleared[1]).toBe(0)
  const progress = findNurikabeHint(board, cleared)
  expect(progress.kind).toBe('hint')
  if (progress.kind !== 'hint') throw Error('Expected a deduction')
  expect(applyNurikabeHint(board, [...cleared], progress.hint)).toEqual(cleared)
  const landBoard = { id: 'land', size: 2, clues: [3, 0, 0, 0] }
  expect(findNurikabeHint(landBoard, [2, 1, 0, 0]).kind).toBe('unverified')
  const sample = previews.samples[0]!, actual = { id: sample.id, size: sample.size, clues: sample.clues }
  const wrongSea = createNurikabeGame(actual).map((value, cell) => cell === 4 ? 1 : value) satisfies NurikabeGame
  expect(findNurikabeHint(actual, wrongSea)).toMatchObject({ kind: 'mistake', cell: 4 })
})

it('only offers sound direct deductions while walking every certified daily and preview board', () => {
  for (const sample of [...daily.samples, ...previews.samples]) {
    const board = { id: sample.id, size: sample.size, clues: sample.clues }
    let game = createNurikabeGame(board), shown = 0
    for (let step = 0; step < game.length; step++) {
      const result = findNurikabeHint(board, game)
      if (result.kind === 'none') break
      expect(result.kind, sample.id).toBe('hint')
      if (result.kind !== 'hint' || result.hint.kind !== 'deduction') throw Error('Expected a deduction')
      expect(result.hint.value, `${sample.id} ${result.hint.rule}`).toBe(sample.solution[result.hint.cell] === 0 ? 1 : 2)
      const next = applyNurikabeHint(board, game, result.hint)
      expect(next).not.toBe(game)
      game = next; shown++
    }
    expect(shown, sample.id).toBeGreaterThan(0)
  }
})
