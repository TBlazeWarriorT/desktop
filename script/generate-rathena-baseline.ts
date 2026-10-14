/* Regenerates app/src/lib/rathena/baseline.json from rathena/rathena master. */
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import { buildDefinitions } from '../app/src/lib/rathena/parse-source'

const repo = 'rathena/rathena'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'desktop-fork' } })
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`)
  }
  return res.text()
}

async function main() {
  const commit = JSON.parse(
    await fetchText(`https://api.github.com/repos/${repo}/commits/master`)
  )
  const sha: string = commit.sha
  const raw = (path: string) =>
    fetchText(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`)

  const [scriptCpp, constantsHpp, customDefs] = await Promise.all([
    raw('src/map/script.cpp'),
    raw('src/map/script_constants.hpp'),
    raw('src/custom/script_def.inc'),
  ])

  const defs = buildDefinitions(`${repo}@${sha.slice(0, 10)}`, {
    scriptCpp,
    constantsHpp,
    customDefs,
  })

  const out = Path.join(__dirname, '../app/src/lib/rathena/baseline.json')
  await writeFile(out, JSON.stringify(defs, null, 1) + '\n')
  console.log(
    `${defs.source}: ${Object.keys(defs.commands).length} commands, ` +
      `${defs.constants.length} constants, ${defs.parameters.length} parameters`
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
