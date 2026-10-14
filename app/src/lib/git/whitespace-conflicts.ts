import { git } from './core'
import { Repository } from '../../models/repository'

/** What ignoring whitespace would do to the operation that stopped. */
export interface IWhitespaceConflictCheck {
  /** Files that conflict now (as merge-tree sees it). */
  readonly conflicted: number
  /** Files that would still conflict with `-X ignore-space-change`. */
  readonly ignoringWhitespace: number
}

async function resolveRef(repository: Repository, ref: string) {
  const { exitCode, stdout } = await git(
    ['rev-parse', '-q', '--verify', ref],
    repository.path,
    'resolveRef',
    { successExitCodes: new Set([0, 1]) }
  )
  return exitCode === 0 ? stdout.trim() : null
}

async function countConflicts(
  repository: Repository,
  args: ReadonlyArray<string>
) {
  const { exitCode, stdout } = await git(
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', ...args],
    repository.path,
    'countConflicts',
    { successExitCodes: new Set([0, 1]) }
  )
  // First line is the merged tree; the conflicted files follow.
  return exitCode === 0
    ? 0
    : new Set(
        stdout
          .split('\n')
          .slice(1)
          .filter(l => l !== '')
      ).size
}

/**
 * Simulates the stopped cherry-pick (its current commit) or merge again,
 * with and without ignoring whitespace, without touching the working tree.
 * Null when neither is in progress.
 */
export async function checkWhitespaceConflicts(
  repository: Repository
): Promise<IWhitespaceConflictCheck | null> {
  const picked = await resolveRef(repository, 'CHERRY_PICK_HEAD')
  const merged =
    picked === null ? await resolveRef(repository, 'MERGE_HEAD') : null
  if (picked === null && merged === null) {
    return null
  }
  const args =
    picked !== null
      ? [`--merge-base=${picked}^`, 'HEAD', picked]
      : ['HEAD', merged!]
  const [conflicted, ignoringWhitespace] = await Promise.all([
    countConflicts(repository, args),
    countConflicts(repository, ['-X', 'ignore-space-change', ...args]),
  ])
  return { conflicted, ignoringWhitespace }
}

/** Whether a cherry-pick or merge is still stopped on conflicts. */
export async function hasStoppedOperation(repository: Repository) {
  const picked = await resolveRef(repository, 'CHERRY_PICK_HEAD')
  return (
    picked !== null || (await resolveRef(repository, 'MERGE_HEAD')) !== null
  )
}
