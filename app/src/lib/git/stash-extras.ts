import { git, GitError } from './core'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { createDesktopStashMessage, getStashes } from './stash'

async function findStashRef(repository: Repository, stashSha: string) {
  const { allEntries } = await getStashes(repository)
  return allEntries.find(e => e.stashSha === stashSha)?.name ?? null
}

/** Applies a stash and keeps it. Conflicts are left in the working directory. */
export async function applyStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  const ref = await findStashRef(repository, stashSha)
  if (ref === null) {
    return
  }
  await git(['stash', 'apply', '--quiet', ref], repository.path, 'applyStash')
    // Exit code 1 without stderr: applied, with conflicts (same as pop).
    .catch(e => {
      if (
        !(e instanceof GitError) ||
        e.result.exitCode !== 1 ||
        e.result.stderr.length > 0
      ) {
        return Promise.reject(e)
      }
      return undefined
    })
}

/**
 * Renames a stash. Git can't edit an entry in place, so this stores a copy
 * (same tree, parents and date) with the new message and drops the old one.
 */
export async function renameStashEntry(
  repository: Repository,
  stash: IStashEntry,
  title: string
): Promise<string> {
  const message = `On ${stash.branchName}: ${
    stash.isDesktopEntry === false
      ? title.trim()
      : createDesktopStashMessage(stash.branchName, title)
  }`
  const date =
    stash.createdAt !== undefined
      ? `@${Math.floor(stash.createdAt.getTime() / 1000)} +0000`
      : undefined
  const env = date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}

  const { stdout } = await git(
    [
      'commit-tree',
      ...stash.parents.flatMap(p => ['-p', p]),
      ...['-m', message, '--no-gpg-sign', stash.tree],
    ],
    repository.path,
    'renameStashEntry',
    { env }
  )

  // Look the old entry up after storing: the new one shifts every index.
  const newSha = stdout.trim()
  await git(
    ['stash', 'store', '-m', message, newSha],
    repository.path,
    'renameStashEntry'
  )
  const ref = await findStashRef(repository, stash.stashSha)
  if (ref !== null) {
    await git(['stash', 'drop', ref], repository.path, 'renameStashEntry')
  }
  return newSha
}
