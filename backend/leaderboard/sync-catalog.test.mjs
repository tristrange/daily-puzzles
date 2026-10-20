import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCatalog, syncCatalog } from './sync-catalog.mjs'

const temporary = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'puzzle-catalog-'))
  temporary.push(path)
  return path
}
async function fixture() {
  const dir = await directory()
  await writeFile(join(dir, '2026-10-19.json'), JSON.stringify({
    id: '2026-10-19', type: 'queens', seed: 1, generatorVersion: 1,
    board: { size: 2, regions: [0, 0, 1, 1] },
  }))
  return dir
}
const url = 'https://example.supabase.co'
const secretKey = 'sb_secret_private-test-value'

test('reads only metadata for all six games, named sizes and original Tracks', async () => {
  const dir = await directory()
  for (const id of ['2026-10-19', '2026-10-19-star', '2026-10-19-words', '2026-10-19-trio',
    '2026-10-19-tracks-small', '2026-10-19-tracks-medium', '2026-10-19-tracks-large', '2026-10-13-tracks']) {
    await cp(new URL(`../../app/public/puzzles/${id}.json`, import.meta.url), join(dir, `${id}.json`))
  }
  await writeFile(join(dir, '2026-10-19-tents.json'), JSON.stringify({
    id:'2026-10-19-tents', type:'tents', board:{size:10, trees:[0], rowCounts:[1], colCounts:[1]},
  }))
  assert.deepEqual(await readCatalog(dir), [
    { puzzle_id:'2026-10-13-tracks', puzzle_type:'train-tracks', puzzle_day:'2026-10-13', width:7,height:7,size_label:null },
    { puzzle_id:'2026-10-19-star', puzzle_type:'star-battle', puzzle_day:'2026-10-19', width:9,height:9,size_label:null },
    { puzzle_id:'2026-10-19-tents', puzzle_type:'tents', puzzle_day:'2026-10-19', width:10,height:10,size_label:null },
    { puzzle_id:'2026-10-19-tracks-large', puzzle_type:'train-tracks', puzzle_day:'2026-10-19', width:12,height:12,size_label:'Large' },
    { puzzle_id:'2026-10-19-tracks-medium', puzzle_type:'train-tracks', puzzle_day:'2026-10-19', width:10,height:10,size_label:'Medium' },
    { puzzle_id:'2026-10-19-tracks-small', puzzle_type:'train-tracks', puzzle_day:'2026-10-19', width:8,height:8,size_label:'Small' },
    { puzzle_id:'2026-10-19-trio', puzzle_type:'trio', puzzle_day:'2026-10-19', width:9,height:9,size_label:null },
    { puzzle_id:'2026-10-19-words', puzzle_type:'word-paths', puzzle_day:'2026-10-19', width:5,height:5,size_label:null },
    { puzzle_id:'2026-10-19', puzzle_type:'queens', puzzle_day:'2026-10-19', width:7,height:7,size_label:null },
  ])
})

test('rejects corrupt or foreign metadata before making any request', async () => {
  for (const raw of ['{', {id:'2026-02-30',type:'queens',board:{size:7}},
    {id:'2026-10-19-star',type:'queens',board:{size:7}},
    {id:'2026-10-19-tents',type:'trio',board:{size:10}},
    {id:'2026-10-19-trio',type:'tents',board:{size:10}},
    {id:'2026-10-19-tents',type:'tents',board:{width:10,height:10}},
    {id:'2026-10-19',type:'unknown',board:{size:7}},
    {id:'2026-10-19',type:'queens',board:{size:0}},
    {id:'2026-10-19',type:'queens',board:{size:1.5}},
    {id:'2026-10-19',type:'queens',board:{size:17}},
    {id:'2026-10-19',type:'word-paths',board:{width:5,height:5}}, null]) {
    const dir = await directory()
    const name = raw !== null && typeof raw === 'object' ? `${raw.id}.json` : '2026-10-19.json'
    await writeFile(join(dir, name), typeof raw === 'string' ? raw : JSON.stringify(raw))
    let requested = false
    await assert.rejects(syncCatalog({url,secretKey,directory:dir,fetcher:async () => {requested=true}}))
    assert.equal(requested, false)
  }
  await assert.rejects(readCatalog(await directory()))
  const mismatched = await fixture()
  await cp(join(mismatched, '2026-10-19.json'), join(mismatched, '2026-10-18.json'))
  await assert.rejects(readCatalog(mismatched))
})

test('imports an exact metadata batch with a server apikey and no redirects', async () => {
  const dir = await fixture()
  const count = await syncCatalog({url,secretKey,directory:dir,fetcher:async (target, options) => {
    assert.equal(target, `${url}/rest/v1/rpc/register_leaderboard_puzzles`)
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.apikey, secretKey)
    assert.equal(options.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(options.body), {p_puzzles:[{
      puzzle_id:'2026-10-19',puzzle_type:'queens',puzzle_day:'2026-10-19',width:2,height:2,size_label:null,
    }]})
    return new Response('1', {status:200})
  }})
  assert.equal(count, 1)
})

test('rejects unsafe configuration and redacts provider/network error text', async () => {
  const dir = await fixture()
  for (const badUrl of [undefined,'http://example.supabase.co','https://example.com',`https://${secretKey}@example.supabase.co`]) {
    await assert.rejects(syncCatalog({url:badUrl,secretKey,directory:dir}))
  }
  await assert.rejects(syncCatalog({url,secretKey:undefined,directory:dir}))
  for (const fetcher of [
    async () => new Response(secretKey,{status:403}),
    async () => new Response(secretKey,{status:200}),
    async () => new Response('0',{status:200}),
    async () => { throw Error(secretKey) },
  ]) {
    await assert.rejects(syncCatalog({url,secretKey,directory:dir,fetcher}), error => {
      assert.equal(String(error).includes(secretKey), false)
      return true
    })
  }
})

test('CLI configuration failures never print a supplied secret', () => {
  const result = spawnSync(process.execPath, [new URL('./sync-catalog.mjs', import.meta.url).pathname], {
    encoding:'utf8', env:{...process.env,SUPABASE_URL:'',SUPABASE_SECRET_KEY:secretKey},
  })
  assert.notEqual(result.status, 0)
  assert.equal((result.stdout + result.stderr).includes(secretKey), false)
})
