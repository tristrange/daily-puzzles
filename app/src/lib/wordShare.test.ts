import { afterEach, expect, it, vi } from 'vitest'
import { buildShareText, buildWordSolutionShareText, puzzleShareLink } from './share'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame, submitWord } from '../domain/wordGame'
const game = submitWord({ ...createWordGame(new WordGrid(3,1,['C','A','T'],[3])), trace: [0,1,2] }).game
const result = { puzzleId:'2026-10-14-words', puzzleType:'word-paths' as const, width:3,height:1,elapsedMs:3000,hints:0,streak:0,link:'https://example.test/#/preview/word-paths?board=2',previewBoard:2 }
afterEach(() => vi.unstubAllGlobals())
it('keeps the normal preview result free of answers', () => {
  expect(buildShareText(result)).toContain('preview · Board 2')
  expect(buildShareText(result)).not.toContain('CAT')
})
it('includes words and their paths only in the spoiler share', () => {
  const text = buildWordSolutionShareText(result, game)
  expect(text).toContain('CAT: r1c1 → r1c2 → r1c3')
  expect(text).toContain(result.link)
})
it('links to the same preview board with the deployment base', () => {
  vi.stubGlobal('window', {location:{origin:'https://example.test'}})
  expect(puzzleShareLink(result.puzzleId, 2)).toBe('https://example.test/#/preview/word-paths?board=2')
})
