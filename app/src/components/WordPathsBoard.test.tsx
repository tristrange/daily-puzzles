import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame, submitWord } from '../domain/wordGame'
import { WordPathsBoard } from './WordPathsBoard'
const grid = new WordGrid(4, 2, ['C','A','T',null,'L','I','O','N'], [3,4])
const noop = () => {}
const render = (accepted: boolean) => renderToStaticMarkup(
  <WordPathsBoard game={accepted ? submitWord({ ...createWordGame(grid), trace: [0,1,2] }).game : { ...createWordGame(grid), trace: [4,5] }}
    onSelect={() => []} onRestoreTrace={noop} onSubmit={noop} onUndo={noop} onRedo={noop} onRequestHint={noop} instructionsId="help" />,
)
describe('Word Paths board markup', () => {
  it('names letters, blockers and trace order with one tab stop', () => {
    const html = render(false)
    expect(html).toContain('role="grid"')
    expect(html).toContain('aria-describedby="help"')
    expect(html).toContain('Row 1, column 4, blocked')
    expect(html).toContain('Row 2, column 1, L, selected letter 1')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/role="row"/g)).toHaveLength(2)
  })
  it('labels accepted words and marks them unavailable for reuse', () => {
    const html = render(true)
    expect(html).toContain('accepted 3-letter word CAT')
    expect(html).toContain('aria-disabled="true"')
  })
  it('keeps hinted order distinct from a reversed unfinished trace', () => {
    const html = renderToStaticMarkup(<WordPathsBoard game={{ ...createWordGame(grid), trace: [2, 1, 0] }}
      hintPath={[0, 1, 2]} hintId="hint" onRequestHint={noop} instructionsId="help"
      onSelect={() => []} onRestoreTrace={noop} onSubmit={noop} onUndo={noop} onRedo={noop} />)
    expect(html).toContain('C, selected letter 3, hint letter 1, start here')
    const start = html.match(/<button[^>]*data-cell="0"[^>]*>.*?<\/button>/)![0]
    expect(start).toContain('<small aria-hidden="true">3</small>')
    expect(start).toContain('<small class="word-hint-order" aria-hidden="true">1</small>')
  })
})
