import * as Path from 'path'
import { lstat, readFile, readdir, realpath, stat } from 'fs/promises'
import { buildDefinitions } from './parse-source'
import {
  IRathenaDefinitions,
  IRathenaExtra,
  IRathenaHighlightContext,
} from './types'

/** How long a repository context is trusted before re-checking the disk. */
const RefreshAfterMs = 15 * 1000

interface IRathenaConfig {
  /** Server source tree (with src/map/script.cpp), relative to the repository. */
  readonly source?: string
  readonly extra?: IRathenaExtra
}

async function mtime(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

async function readConfig(repoPath: string): Promise<IRathenaConfig> {
  try {
    return JSON.parse(
      await readFile(Path.join(repoPath, '.rathena.json'), 'utf8')
    )
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('Could not read .rathena.json', e)
    }
    return {}
  }
}

const hasSource = async (dir: string) =>
  (await mtime(Path.join(dir, 'src', 'map', 'script.cpp'))) !== null

/** Config path → the repository itself → whatever map-server.exe symlinks to. */
async function findSource(
  repoPath: string,
  config: IRathenaConfig
): Promise<string | null> {
  if (config.source !== undefined) {
    const dir = Path.resolve(repoPath, config.source)
    return (await hasSource(dir)) ? dir : null
  }

  if (await hasSource(repoPath)) {
    return repoPath
  }

  for (const exe of ['map-server.exe', 'map-server']) {
    const link = Path.join(repoPath, exe)
    try {
      if ((await lstat(link)).isSymbolicLink()) {
        const dir = Path.dirname(await realpath(link))
        if (await hasSource(dir)) {
          return dir
        }
      }
    } catch {}
  }

  return null
}

const definitionsCache = new Map<string, IRathenaDefinitions>()

async function loadDefinitions(sourceDir: string) {
  const files = [
    Path.join(sourceDir, 'src', 'map', 'script.cpp'),
    Path.join(sourceDir, 'src', 'map', 'script_constants.hpp'),
    Path.join(sourceDir, 'src', 'custom', 'script_def.inc'),
  ]
  const key = `${sourceDir}|${(await Promise.all(files.map(mtime))).join('|')}`

  let defs = definitionsCache.get(key)
  if (defs === undefined) {
    const [scriptCpp, constantsHpp, customDefs] = await Promise.all(
      files.map(f => readFile(f, 'utf8').catch(() => ''))
    )
    defs = buildDefinitions(sourceDir, { scriptCpp, constantsHpp, customDefs })
    definitionsCache.clear()
    definitionsCache.set(key, defs)
  }
  return { key, defs }
}

async function listScripts(npcDir: string): Promise<ReadonlyArray<string>> {
  try {
    const entries = await readdir(npcDir, {
      recursive: true,
      withFileTypes: true,
    })
    return entries
      .filter(e => e.isFile() && /\.(txt|cpp)$/i.test(e.name))
      .map(e => Path.join(e.parentPath, e.name))
  } catch {
    return []
  }
}

const functionCache = new Map<
  string,
  { readonly mtime: number | null; readonly names: ReadonlyArray<string> }
>()
const globalFunctionRe = /^function\t+script\t+([^\t]+)\t/gm

/** Re-reads only scripts whose mtime changed since the last scan. */
async function findGlobalFunctions(scripts: ReadonlyArray<string>) {
  const names = new Set<string>()
  await Promise.all(
    scripts.map(async file => {
      const time = await mtime(file)
      let cached = functionCache.get(file)
      if (cached === undefined || cached.mtime !== time) {
        const text = await readFile(file, 'latin1').catch(() => '')
        const found = [...text.matchAll(globalFunctionRe)].map(m => m[1])
        cached = { mtime: time, names: found }
        functionCache.set(file, cached)
      }
      cached.names.forEach(n => names.add(n))
    })
  )
  return [...names].sort()
}

async function loadContext(
  repoPath: string
): Promise<IRathenaHighlightContext | null> {
  const config = await readConfig(repoPath)
  const npcDir = Path.join(repoPath, 'npc')

  if ((await mtime(npcDir)) === null && Object.keys(config).length === 0) {
    return null
  }

  const sourceDir = await findSource(repoPath, config)
  const loaded = sourceDir === null ? null : await loadDefinitions(sourceDir)
  const globalFunctions = await findGlobalFunctions(await listScripts(npcDir))
  const extra = config.extra ?? {}

  return {
    key: [
      loaded?.key ?? 'baseline',
      JSON.stringify(extra),
      globalFunctions.join(','),
    ].join('#'),
    definitions: loaded?.defs ?? null,
    extra,
    globalFunctions,
  }
}

interface ICacheEntry {
  readonly at: number
  readonly context: Promise<IRathenaHighlightContext | null>
}

const repoCache = new Map<string, ICacheEntry>()

function refresh(repoPath: string) {
  const context = loadContext(repoPath).catch(e => {
    log.error(`Could not load the rAthena context for ${repoPath}`, e)
    return null
  })
  repoCache.set(repoPath, { at: Date.now(), context })
  return context
}

/** Undefined when the repository doesn't look like an rAthena server. */
export async function getRathenaHighlightContext(
  repoPath: string
): Promise<IRathenaHighlightContext | undefined> {
  const entry = repoCache.get(repoPath)
  let context = entry?.context ?? refresh(repoPath)

  if (entry !== undefined && Date.now() - entry.at > RefreshAfterMs) {
    // Serve the previous context now; the fresh one is used from the next diff on.
    refresh(repoPath)
    context = entry.context
  }

  return (await context) ?? undefined
}
