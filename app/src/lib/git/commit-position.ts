import { git } from './core'
import { Repository } from '../../models/repository'

/** Whether the commit is in the current branch's history. */
export async function isInCurrentHistory(
  repository: Repository,
  sha: string
): Promise<boolean> {
  const { exitCode } = await git(
    ['merge-base', '--is-ancestor', sha, 'HEAD'],
    repository.path,
    'isInCurrentHistory',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  return exitCode === 0
}

/**
 * How many commits of the current branch come after this one: about where it
 * sits in History (merged side branches can shuffle it a little).
 */
export async function countCommitsAbove(
  repository: Repository,
  sha: string
): Promise<number> {
  const { stdout } = await git(
    ['rev-list', '--count', `${sha}..HEAD`],
    repository.path,
    'countCommitsAbove'
  )
  return parseInt(stdout.trim(), 10) || 0
}
