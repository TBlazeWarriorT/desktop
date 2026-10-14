// Tracks inputs that only a full `build:dev` picks up (dependencies, static files,
// build config); code itself is recompiled by the watchers in `yarn start`.
// Usage: node script/dev-build-stamp.mjs check|write  (check exits 1 when stale)
import { createHash } from 'crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = join(import.meta.dirname, '..')
const stampFile = join(root, 'dist', '.dev-build-stamp')

const inputs = [
  'package.json',
  'yarn.lock',
  'app/package.json',
  'app/yarn.lock',
  'script/build.ts',
  'app/static',
]

function* files(path) {
  const stat = statSync(join(root, path), { throwIfNoEntry: false })
  if (stat?.isDirectory()) {
    for (const name of readdirSync(join(root, path))) {
      yield* files(`${path}/${name}`)
    }
  } else if (stat) {
    yield `${path}:${stat.size}:${stat.mtimeMs}`
  }
}

const hash = createHash('sha1')
inputs.flatMap(i => [...files(i)]).forEach(f => hash.update(f + '\n'))
const stamp = hash.digest('hex')

if (process.argv[2] === 'write') {
  writeFileSync(stampFile, stamp)
} else {
  let previous = ''
  try {
    previous = readFileSync(stampFile, 'utf8')
  } catch {}
  process.exit(previous === stamp ? 0 : 1)
}
