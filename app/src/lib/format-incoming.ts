import * as Path from 'path'
import * as Os from 'os'
import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { git } from './git/core'
import { pathExists } from './path-exists'
import { Repository } from '../models/repository'

/** A line range in the new file, 1-based, as `git diff -U0` reports it. */
interface ILineRange {
  readonly start: number
  readonly count: number
}

/** One `-U0` hunk: lines `start..start+count` of the old file become `lines`. */
interface IHunk {
  readonly start: number
  readonly count: number
  readonly lines: ReadonlyArray<string>
}

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/** Lines each file gained between `before` and HEAD, by file. */
async function getIncomingRanges(repository: Repository, before: string) {
  const { stdout } = await git(
    ['diff', '-U0', '--no-color', '--no-ext-diff', before, 'HEAD'],
    repository.path,
    'getIncomingRanges'
  )
  const ranges = new Map<string, ILineRange[]>()
  let file: string | null = null
  for (const line of stdout.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice('+++ b/'.length)
    } else if (file !== null) {
      const m = hunkHeader.exec(line)
      const count = m === null ? 0 : m[4] === undefined ? 1 : Number(m[4])
      if (m !== null && count > 0) {
        const list = ranges.get(file) ?? []
        list.push({ start: Number(m[3]), count })
        ranges.set(file, list)
      }
    }
  }
  return ranges
}

/** The `-U0` hunks that turn `before` into `after`, by git's own diff. */
async function diffTexts(before: string, after: string): Promise<IHunk[]> {
  const dir = await mkdtemp(Path.join(Os.tmpdir(), 'desktop-format-'))
  try {
    const a = Path.join(dir, 'a')
    const b = Path.join(dir, 'b')
    await writeFile(a, before)
    await writeFile(b, after)
    const { stdout } = await git(
      ['diff', '--no-index', '-U0', '--no-color', '--no-ext-diff', a, b],
      dir,
      'diffTexts',
      { successExitCodes: new Set([0, 1]) }
    )
    const hunks = new Array<IHunk>()
    let current: { start: number; count: number; lines: string[] } | null = null
    for (const line of stdout.split('\n')) {
      const m = hunkHeader.exec(line)
      if (m !== null) {
        const count = m[2] === undefined ? 1 : Number(m[2])
        // A pure insertion's start is the line it goes after.
        const start = count === 0 ? Number(m[1]) + 1 : Number(m[1])
        current = { start, count, lines: [] }
        hunks.push(current)
      } else if (current !== null && line.startsWith('+')) {
        current.lines.push(line.slice(1))
      }
    }
    return hunks
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const inRanges = (line: number, ranges: ReadonlyArray<ILineRange>) =>
  ranges.some(r => line >= r.start && line < r.start + r.count)

/**
 * The parts of the formatter's hunks that only touch incoming lines. git joins
 * changes on adjacent lines into one hunk, so a same-size hunk is split line
 * by line; one that adds or drops lines is kept only when it is all incoming.
 */
function incomingEdits(
  hunks: ReadonlyArray<IHunk>,
  ranges: ReadonlyArray<ILineRange>
): ReadonlyArray<IHunk> {
  const edits = new Array<IHunk>()
  for (const hunk of hunks) {
    if (hunk.count > 0 && hunk.count === hunk.lines.length) {
      hunk.lines.forEach((line, i) => {
        if (inRanges(hunk.start + i, ranges)) {
          edits.push({ start: hunk.start + i, count: 1, lines: [line] })
        }
      })
    } else {
      // A pure insertion lands before `start`: inside if its neighbors are.
      const first = hunk.count === 0 ? hunk.start - 1 : hunk.start
      const last = hunk.count === 0 ? hunk.start : hunk.start + hunk.count - 1
      let all = true
      for (let line = first; line <= last; line++) {
        all = all && inRanges(line, ranges)
      }
      if (all) {
        edits.push(hunk)
      }
    }
  }
  return edits
}

/** Runs the repository's own Prettier (never a downloaded one) on the files. */
function runProjectPrettier(
  repository: Repository,
  files: ReadonlyArray<{ path: string; text: string }>
): Promise<ReadonlyArray<string | null>> {
  // Works with Prettier 2 (sync) and 3 (async). Files without a Prettier
  // config, ignored, or with no parser come back as null.
  const script = `
    const { readFileSync } = require('fs')
    const path = require('path')
    const repo = process.cwd()
    const prettier = require(require.resolve('prettier', { paths: [repo] }))
    const files = JSON.parse(readFileSync(0, 'utf8'))
    ;(async () => {
      const out = []
      for (const f of files) {
        try {
          const filepath = path.join(repo, f.path)
          const info = await prettier.getFileInfo(filepath, {
            ignorePath: path.join(repo, '.prettierignore'),
          })
          const config = await prettier.resolveConfig(filepath)
          out.push(
            info.ignored || !info.inferredParser || config === null
              ? null
              : await prettier.format(f.text, { ...config, filepath })
          )
        } catch (e) {
          out.push(null)
        }
      }
      process.stdout.write(JSON.stringify(out))
    })()
  `
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], {
      cwd: repository.path,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    })
    let stdout = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.on('error', reject)
    child.on('close', code => {
      try {
        resolve(code === 0 ? JSON.parse(stdout) : files.map(() => null))
      } catch (e) {
        reject(e)
      }
    })
    child.stdin.end(JSON.stringify(files))
  })
}

/**
 * After a cherry-pick or merge that ignored whitespace, formats only the lines
 * that came in since `before` with the project's Prettier; every other line
 * stays as it is. The result is left uncommitted. Returns the changed files.
 */
export async function formatIncomingLines(
  repository: Repository,
  before: string
): Promise<ReadonlyArray<string>> {
  // The project's own Prettier only; webpack would rewrite require.resolve.
  const prettierPackage = Path.join(
    repository.path,
    'node_modules',
    'prettier',
    'package.json'
  )
  if (!(await pathExists(prettierPackage))) {
    return []
  }

  const ranges = await getIncomingRanges(repository, before)
  const files = new Array<{ path: string; text: string }>()
  for (const path of ranges.keys()) {
    const text = await readFile(Path.join(repository.path, path), 'utf8').catch(
      () => null
    )
    if (text !== null) {
      files.push({ path, text })
    }
  }
  if (files.length === 0) {
    return []
  }

  const formatted = await runProjectPrettier(repository, files)
  const changed = new Array<string>()
  for (const [i, { path, text }] of files.entries()) {
    const result = formatted[i]
    if (result === null || result === text) {
      continue
    }
    const hunks = incomingEdits(
      await diffTexts(text, result),
      ranges.get(path) ?? []
    )
    if (hunks.length === 0) {
      continue
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r?\n/)
    // Bottom-up, so earlier hunks keep their line numbers.
    for (const hunk of [...hunks].reverse()) {
      lines.splice(hunk.start - 1, hunk.count, ...hunk.lines)
    }
    await writeFile(Path.join(repository.path, path), lines.join(eol))
    changed.push(path)
  }
  return changed
}

/** Puts the files back as committed, e.g. before undoing the cherry-pick. */
export async function discardFormatting(
  repository: Repository,
  files: ReadonlyArray<string>
) {
  await git(
    ['checkout', 'HEAD', '--', ...files],
    repository.path,
    'discardFormatting'
  )
}
