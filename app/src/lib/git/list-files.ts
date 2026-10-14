import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Every file of the repository: tracked plus untracked-but-not-ignored ones
 * when reading the working directory, or the tree of `commitish`.
 */
export async function listRepositoryFiles(
  repository: Repository,
  commitish: string | null
): Promise<ReadonlyArray<string>> {
  const args =
    commitish === null
      ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard']
      : ['ls-tree', '-r', '-z', '--name-only', commitish]
  const { stdout } = await git(args, repository.path, 'listRepositoryFiles')
  const paths = new Set(stdout.split('\0').filter(p => p !== ''))
  return [...paths].sort(comparePaths)
}

/** Folders before files at each level, then by name, like a file manager. */
export function comparePaths(a: string, b: string) {
  const x = a.split('/')
  const y = b.split('/')
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const xIsFolder = i < x.length - 1
    const yIsFolder = i < y.length - 1
    if (x[i] !== y[i]) {
      if (xIsFolder !== yIsFolder) {
        return xIsFolder ? -1 : 1
      }
      return x[i].localeCompare(y[i], undefined, { sensitivity: 'base' })
    }
  }
  return x.length - y.length
}

export interface IFileTreeRow {
  /** Full path; folders have no trailing slash. */
  readonly path: string
  readonly name: string
  readonly depth: number
  readonly isFolder: boolean
}

/** The visible rows of a tree of `paths` (sorted) with `expanded` folders open. */
export function getFileTreeRows(
  paths: ReadonlyArray<string>,
  expanded: ReadonlySet<string>
): ReadonlyArray<IFileTreeRow> {
  const rows = new Array<IFileTreeRow>()
  const shownFolders = new Set<string>()

  for (const path of paths) {
    const parts = path.split('/')
    let visible = true
    for (let i = 0; i < parts.length && visible; i++) {
      const sub = parts.slice(0, i + 1).join('/')
      const isFolder = i < parts.length - 1
      if (isFolder) {
        if (!shownFolders.has(sub)) {
          shownFolders.add(sub)
          rows.push({ path: sub, name: parts[i], depth: i, isFolder: true })
        }
        visible = expanded.has(sub)
      } else {
        rows.push({ path, name: parts[i], depth: i, isFolder: false })
      }
    }
  }
  return rows
}
