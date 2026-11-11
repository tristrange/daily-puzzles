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
const runs = []
for (const [browserName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await browserType.launch({ headless: true })
  try {
    for (const [width, height, theme, palette] of [[320, 740, 'light', 'classic'], [375, 812, 'dark', 'forest'], [768, 1024, 'light', 'warm'], [1280, 900, 'dark', 'cool']]) {
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
      await page.screenshot({ path: `${output}/${browserName}-${width}-${theme}.png`, fullPage: true })
      const record = { browser: browserName, width, theme, palette, keyboard: true, overflow: false }
      if (width === 375 && published) {
        const { puzzle, walls } = fixture
        const pattern = `**/puzzles/${puzzle.id}.json`
        if (!published) await page.route(pattern, route => route.fulfill({ json: puzzle }))
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
        const frozen = await page.getByRole('timer', { name: 'Elapsed active time', exact: true }).textContent()
        await page.waitForTimeout(1100)
        assert.equal(await page.getByRole('timer', { name: 'Elapsed active time', exact: true }).textContent(), frozen)
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'Reset', exact: true }).click()
        for (const cell of walls) await page.locator(`[data-cell="${cell}"]`).click()
        await page.getByRole('button', { name: 'Save improved score', exact: true }).click()
        const improved = await stats()
        assert.equal(improved.enclosureBest.score, puzzle.board.optimalScore)
        assert.equal(improved.solvedAt, first.solvedAt)
        assert.equal(improved.elapsedMs, first.elapsedMs)
        await page.screenshot({ path: `${output}/${browserName}-daily-optimal.png`, fullPage: true })
        await page.reload()
        await page.getByRole('grid').waitFor()
        assert.equal(await page.locator('[data-wall="true"]').count(), walls.length)
        assert.match(await page.locator('.enclosure-scores').textContent(), new RegExp(`Best score: ${puzzle.board.optimalScore}`))
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready
          if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
        })
        if (!published) await page.unroute(pattern)
        await context.setOffline(true)
        await page.reload()
        await page.getByRole('grid').waitFor()
        assert.equal(await page.locator('[data-wall="true"]').count(), walls.length)
        assert.equal((await stats()).enclosureBest.score, puzzle.board.optimalScore)
        record.dailySubmission = true
        record.improvement = true
        record.frozenClock = true
        record.offlineReload = true
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
