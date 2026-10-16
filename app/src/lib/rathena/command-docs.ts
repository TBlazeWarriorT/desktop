import * as Path from 'path'
import { readFile, stat } from 'fs/promises'
import { getRathenaHighlightContext } from './context'

/** One `*command` entry of doc/script_commands.txt. */
export interface ICommandDoc {
  /** The `*command ...;` lines, without the `*`. */
  readonly signatures: ReadonlyArray<string>
  /** The text up to the next entry, trimmed. */
  readonly body: string
}

const entryRe = /^\*([A-Za-z_]\w*)/
// `-------` between entries, `=====` and `\\` around sections.
const breakRe = /^(-{10,}|={10,}|\\\\)\s*$/

/** Every entry by command name; names sharing an entry share the object. */
export function parseCommandDocs(text: string): Map<string, ICommandDoc> {
  const docs = new Map<string, ICommandDoc>()
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const startsEntry =
      entryRe.test(lines[i]) &&
      (i === 0 || lines[i - 1].trim() === '' || breakRe.test(lines[i - 1]))
    if (!startsEntry) {
      i++
      continue
    }
    const signatures = new Array<string>()
    while (i < lines.length && entryRe.test(lines[i])) {
      let signature = lines[i].slice(1).trim()
      i++
      // `*startnpctimer{ ... } |` goes on in the next, indented line.
      while (
        signature.endsWith('|') &&
        i < lines.length &&
        /^\s+\S/.test(lines[i])
      ) {
        signature += ' ' + lines[i].trim()
        i++
      }
      signatures.push(signature)
    }
    const body = new Array<string>()
    while (
      i < lines.length &&
      !breakRe.test(lines[i]) &&
      !(entryRe.test(lines[i]) && lines[i - 1].trim() === '')
    ) {
      body.push(lines[i])
      i++
    }
    const doc = { signatures, body: body.join('\n').trim() }
    for (const signature of signatures) {
      const name = entryRe.exec(`*${signature}`)![1]
      if (!docs.has(name)) {
        docs.set(name, doc)
      }
    }
  }
  return docs
}

interface ICacheEntry {
  readonly mtime: number
  readonly docs: Map<string, ICommandDoc>
}
const cache = new Map<string, ICacheEntry>()

/** script_commands.txt of the repository's active source (see context.ts). */
async function findDocsFile(repositoryPath: string) {
  const context = await getRathenaHighlightContext(repositoryPath)
  if (context === undefined) {
    return null
  }
  const root = context.definitions?.source ?? repositoryPath
  return Path.join(root, 'doc', 'script_commands.txt')
}

/**
 * The command docs that match the commands being highlighted, or null outside
 * rAthena repositories or without the file. Re-read when it changes.
 */
export async function getCommandDocs(
  repositoryPath: string
): Promise<Map<string, ICommandDoc> | null> {
  const file = await findDocsFile(repositoryPath)
  if (file === null) {
    return null
  }
  try {
    const { mtimeMs } = await stat(file)
    const cached = cache.get(file)
    if (cached !== undefined && cached.mtime === mtimeMs) {
      return cached.docs
    }
    const docs = parseCommandDocs(await readFile(file, 'utf8'))
    cache.set(file, { mtime: mtimeMs, docs })
    return docs
  } catch {
    return null
  }
}
