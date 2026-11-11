// Requires an installed Playwright module and its Chromium/WebKit browsers.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.argv[2] ?? 'http://127.0.0.1:4178'
const output = resolve(process.argv[3] ?? '/tmp/enclosure-browser-proof')
const published = process.argv.includes('--published')
await mkdir(output, { recursive: true })
const fixture = JSON.parse(execFileSync('uv', ['run', 'python', '-c', `
import json
from queens_engine.enclosure_gen import generate
from queens_engine.enclosure_solver import solve_optimal, OptimalResult
from tools.generate import seed_from_date
identifier = '2026-11-11-enclosure'
seed = seed_from_date(identifier)
grid = generate(seed)
solution = solve_optimal(grid)
assert isinstance(solution, OptimalResult)
print(json.dumps({'puzzle': {'id':identifier,'type':'enclosure','seed':seed,'generatorVersion':1,
'board':{'size':grid.size,'water':list(grid.water),'horse':grid.horse,'wallBudget':grid.wall_budget,'optimalScore':grid.optimal_score}},'walls':solution.walls}))
`], { cwd: fileURLToPath(new URL('../../engine/', import.meta.url)), encoding: 'utf8' }))
const previews = JSON.parse(await readFile(new URL('../src/domain/enclosurePreviews.json', import.meta.url), 'utf8'))
async function capture(page, path) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(80)
  await page.screenshot({ path, fullPage: false })
}
const runs = []
for (const [browserName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await browserType.launch({ headless: true })
  try {
    for (const [width, height, theme, palette] of [[320, 740, 'light', 'classic'], [375, 667, 'light', 'classic'], [375, 812, 'dark', 'forest'], [768, 1024, 'light', 'warm'], [1280, 900, 'dark', 'cool']]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', colorScheme: theme })
      const page = await context.newPage()
      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.addInitScript(({ theme, palette }) => {
        localStorage.setItem('daily-puzzles:theme', theme)
        localStorage.setItem('daily-puzzles:customization', JSON.stringify({ version: 1, palette, games: [] }))
      }, { theme, palette })
      await page.goto(`${base}/#/preview/enclosure`)
      await page.getByRole('grid').waitFor()
      assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= innerWidth), true)
      assert.equal(await page.locator('[role="gridcell"]').count(), 64)
      const cell = previews[0].water.includes(0) ? 1 : 0
      const target = page.locator(`[data-cell="${cell}"]`)
      await target.focus()
      await page.keyboard.press('Enter')
      assert.equal(await target.getAttribute('data-wall'), 'true')
      await page.keyboard.press('Space')
      assert.equal(await target.getAttribute('data-wall'), 'false')
      await page.keyboard.press('Control+z')
      assert.equal(await target.getAttribute('data-wall'), 'true')
      await page.keyboard.press('Control+Shift+z')
      assert.equal(await target.getAttribute('data-wall'), 'false')
      await page.locator(`[data-cell="${previews[0].horse}"]`).focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('[data-wall="true"]').count(), 0)
      assert.equal(await page.evaluate(() => localStorage.getItem('daily-puzzles:stats')), null)
      await capture(page, `${output}/${browserName}-${width}-${theme}.png`)
      const record = { browser: browserName, width, height, theme, palette, keyboard: true, overflow: false }
      for (const [index, preview] of previews.entries()) {
        await page.locator('.enclosure-preview-toolbar select').selectOption(String(index))
        await page.locator(`[data-cell="${preview.horse}"][data-terrain="horse"]`).waitFor()
        for (const cell of [preview.horse - preview.size, preview.horse - 1, preview.horse + 1, preview.horse + preview.size].filter(cell => !preview.water.includes(cell))) {
          await page.locator(`[data-cell="${cell}"]`).click()
        }
        await page.getByRole('button', { name: 'Submit enclosure', exact: true }).click()
        await context.setOffline(true)
        await page.getByRole('button', { name: 'Show optimal solution', exact: true }).click()
        const solution = page.getByRole('grid', { name: 'Optimal enclosure solution', exact: true })
        await solution.waitFor()
        assert.equal(await solution.locator('[data-reachable="true"]').count(), preview.optimalScore)
        assert.equal(await page.evaluate(() => localStorage.getItem('daily-puzzles:stats')), null)
        await page.getByRole('button', { name: 'Hide optimal solution', exact: true }).click()
        await context.setOffline(false)
      }
      record.previewOfflineReveal = true
      if (published) {
        const { puzzle, walls } = fixture
        if (width === 768) {
          await page.evaluate(() => {
            let released = false
            const waiting = []
            window.releaseEnclosureWitness = () => { released = true; waiting.forEach(resume => resume()) }
            const fetch = window.fetch.bind(window)
            window.fetch = async (...args) => {
              const input = args[0]
              const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
              if (url.includes('/solutions/enclosure/') && !released) await new Promise(resolve => { waiting.push(resolve) })
              return fetch(...args)
            }
          })
        }
        await page.goto(`${base}/#/archive/${puzzle.id}`)
        await page.getByRole('button', { name: 'Copy puzzle link', exact: true }).waitFor()
        await page.locator(`[data-cell="${puzzle.board.horse}"][data-terrain="horse"]`).waitFor()
        const { size, horse, water } = puzzle.board
        const adjacent = [horse - size, horse - 1, horse + 1, horse + size].filter(cell => !water.includes(cell))
        for (const cell of adjacent) await page.locator(`[data-cell="${cell}"]`).click()
        await page.getByText('Enclosed! Reachable area: 1.', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Submit enclosure', exact: true }).click()
        const stats = () => page.evaluate(id => JSON.parse(localStorage.getItem('daily-puzzles:stats') ?? '[]').find(record => record.id === id), puzzle.id)
        const first = await stats()
        assert.equal(first.enclosureBest.score, 1)
        assert.equal(first.enclosureFirst.score, 1)
        const frozen = await page.getByRole('timer', { name: 'Elapsed active time', exact: true }).textContent()
        await page.waitForTimeout(1100)
        assert.equal(await page.getByRole('timer', { name: 'Elapsed active time', exact: true }).textContent(), frozen)
        const ownBoard = page.locator('.enclosure-board-slot > .enclosure-board')
        const ownWalls = () => ownBoard.locator('[data-wall="true"]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-cell')))
        const beforeReveal = await ownWalls()
        if (width === 768) {
          await page.getByRole('button', { name: 'Show optimal solution', exact: true }).focus()
          await page.keyboard.press('Enter')
          const loading = page.getByRole('button', { name: 'Loading optimal solution…', exact: true })
          await loading.waitFor()
          assert.equal(await loading.getAttribute('aria-disabled'), 'true')
          assert.equal(await loading.evaluate(button => button === document.activeElement), true)
          await page.evaluate(() => window.releaseEnclosureWitness())
          const hide = page.getByRole('button', { name: 'Hide optimal solution', exact: true })
          await hide.waitFor()
          assert.equal(await hide.evaluate(button => button === document.activeElement), true)
          await page.keyboard.press('Enter')
          assert.deepEqual(await ownWalls(), beforeReveal)
          record.uncachedRevealPreservesFocus = true
        }
        await page.getByText('Optimal solution available offline.', { exact: true }).waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        const onlineBox = await ownBoard.boundingBox()
        assert.ok(onlineBox && onlineBox.y + onlineBox.height <= height, 'board fits without scrolling')
        await context.setOffline(true)
        await page.locator('.offline-status').getByText('Offline', { exact: false }).waitFor()
        await page.waitForFunction(() => {
          const box = document.querySelector('.enclosure-board')?.getBoundingClientRect()
          return box && box.bottom <= innerHeight
        })
        const boardBox = await ownBoard.boundingBox()
        assert.ok(boardBox && boardBox.y + boardBox.height <= height, 'board fits without scrolling')
        const submitBox = await page.getByRole('button', { name: 'Save best score', exact: true }).boundingBox()
        const showButton = page.getByRole('button', { name: 'Show optimal solution', exact: true })
        const showBox = await showButton.boundingBox()
        assert.ok(submitBox && showBox && submitBox.y + submitBox.height <= boardBox.y && showBox.y + showBox.height <= boardBox.y, 'primary controls are above the board')
        await showButton.focus()
        await page.keyboard.press('Enter')
        const optimal = page.getByRole('grid', { name: 'Optimal enclosure solution', exact: true })
        await optimal.waitFor()
        assert.equal(await optimal.getAttribute('aria-readonly'), 'true')
        assert.equal(await optimal.locator('[data-reachable="true"]').count(), puzzle.board.optimalScore)
        assert.equal(await page.getByRole('grid').count(), 1)
        assert.deepEqual(await optimal.boundingBox(), boardBox, 'solution stays in the same board footprint')
        assert.equal(await page.evaluate(() => window.scrollY), 0, 'reveal does not scroll')
        const hideButton = page.getByRole('button', { name: 'Hide optimal solution', exact: true })
        assert.equal(await hideButton.evaluate(button => button === document.activeElement), true)
        assert.equal(await page.getByRole('button', { name: 'Save best score', exact: true }).isDisabled(), true)
        assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true)
        await optimal.getByRole('gridcell').first().focus()
        await page.keyboard.press('Control+z')
        assert.deepEqual(await stats(), first)
        assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= innerWidth), true)
        await capture(page, `${output}/${browserName}-${width}x${height}-daily-revealed.png`)
        await page.getByRole('button', { name: 'Hide optimal solution', exact: true }).click()
        assert.deepEqual(await ownWalls(), beforeReveal)
        assert.deepEqual(await ownBoard.boundingBox(), boardBox)
        assert.equal(await page.evaluate(() => window.scrollY), 0, 'hide does not scroll')
        await context.setOffline(false)
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        for (const cell of walls) await page.locator(`[data-cell="${cell}"]`).click()
        await page.getByRole('button', { name: 'Save best score', exact: true }).click()
        const improved = await stats()
        assert.equal(improved.enclosureBest.score, puzzle.board.optimalScore)
        assert.deepEqual(improved.enclosureFirst, first.enclosureFirst)
        assert.equal(improved.solvedAt, first.solvedAt)
        assert.equal(improved.elapsedMs, first.elapsedMs)
        await capture(page, `${output}/${browserName}-${width}x${height}-daily-optimal.png`)
        await page.reload()
        await page.getByRole('grid').waitFor()
        assert.equal(await page.locator('[data-wall="true"]').count(), walls.length)
        assert.match(await page.locator('.enclosure-scores').textContent(), new RegExp(`Best score: ${puzzle.board.optimalScore}`))
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })
        await context.setOffline(true)
        await page.reload()
        await page.getByRole('grid').waitFor()
        assert.equal(await page.locator('[data-wall="true"]').count(), walls.length)
        assert.equal((await stats()).enclosureBest.score, puzzle.board.optimalScore)
        assert.deepEqual((await stats()).enclosureFirst, first.enclosureFirst)
        record.dailySubmission = true
        record.improvement = true
        record.frozenClock = true
        record.offlineReload = true
        record.offlineReveal = true
        record.firstScorePreserved = true
        record.controlsAboveBoard = true
        record.boardFitsViewportOnlineAndOffline = true
        record.inPlaceReveal = true
        record.revealPreservesFocus = true
        record.publishedJson = published
      }
      assert.deepEqual(pageErrors, [])
      runs.push(record)
      await context.close()
    }
  } finally { await browser.close() }
}
await writeFile(`${output}/results.json`, `${JSON.stringify({ runs }, null, 2)}\n`)
console.log(JSON.stringify({ passed: runs.length, output }))
