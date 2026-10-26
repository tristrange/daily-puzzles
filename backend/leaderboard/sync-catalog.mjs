/** Trusted deployment imports only metadata, never solved grids or credentials. */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function readCatalog(directory) {
  const entries = []
  try {
    const files = (await readdir(directory, {withFileTypes:true}))
      .filter(file => file.isFile() && file.name.endsWith('.json')).map(file => file.name).sort()
    for (const name of files) {
      const raw = JSON.parse(await readFile(join(directory, name), 'utf8'))
      if (typeof raw?.id !== 'string' || name !== `${raw.id}.json`
        || !/^\d{4}-\d{2}-\d{2}(?:-star|-tracks(?:-small|-medium|-large)?|-words|-trio|-tents|-nurikabe|-sudoku-(?:easy|medium|hard))?$/.test(raw.id)) throw Error()
      const day = raw.id.slice(0,10)
      if (new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) !== day) throw Error()
      const suffix = raw.id.slice(10)
      const expected = {queens:'', 'star-battle':'-star', 'word-paths':'-words', trio:'-trio', tents:'-tents', nurikabe:'-nurikabe'}
      if (raw.type === 'sudoku') {
        if (!['easy','medium','hard'].includes(raw.board?.level)
          || suffix !== `-sudoku-${raw.board.level}` || raw.board.size !== 9) throw Error()
      } else if (raw.type === 'train-tracks' ? !/^\-tracks(?:-small|-medium|-large)?$/.test(suffix)
        : !Object.hasOwn(expected, raw.type) || suffix !== expected[raw.type]) throw Error()
      if (raw.type === 'nurikabe' && raw.board?.size !== 7) throw Error()
      const square = ['queens','star-battle','trio','tents','sudoku','nurikabe'].includes(raw.type)
      const width = square ? raw.board?.size : raw.board?.width
      const height = square ? raw.board?.size : raw.board?.height
      if ([width,height].some(n => !Number.isInteger(n) || n < 1 || n > 16)) throw Error()
      const labels = {'-tracks-small':'Small', '-tracks-medium':'Medium', '-tracks-large':'Large',
        '-sudoku-easy':'Easy', '-sudoku-medium':'Medium', '-sudoku-hard':'Hard'}
      entries.push({puzzle_id:raw.id,puzzle_type:raw.type,puzzle_day:day,width,height,size_label:labels[suffix] ?? null})
    }
    if (!entries.length) throw Error()
    return entries
  } catch {
    throw Error('Invalid or unreadable published puzzle catalog')
  }
}

export async function syncCatalog({url, secretKey, directory, fetcher = fetch}) {
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
    || typeof secretKey !== 'string' || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw Error('Set SUPABASE_URL and a server-only SUPABASE_SECRET_KEY')
  }
  const puzzles = await readCatalog(directory)
  let response
  try {
    response = await fetcher(`${url.replace(/\/$/,'')}/rest/v1/rpc/register_leaderboard_puzzles`, {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),
      headers:{apikey:secretKey,'Content-Type':'application/json'},body:JSON.stringify({p_puzzles:puzzles}),
    })
  } catch { throw Error('Leaderboard catalog request failed; check connection and project settings') }
  if (!response.ok) throw Error(`Leaderboard catalog request failed (HTTP ${response.status})`)
  let count
  try { count = await response.json() }
  catch { throw Error('Leaderboard catalog returned an invalid response') }
  if (count !== puzzles.length) throw Error('Leaderboard catalog did not confirm the complete batch')
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = await syncCatalog({url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY,
      directory:fileURLToPath(new URL('../../app/public/puzzles/',import.meta.url))})
    console.log(`Registered ${count} published puzzles`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
