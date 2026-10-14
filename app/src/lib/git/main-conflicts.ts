import { git } from './core'
import { Repository } from '../../models/repository'

/** How many of the branch's newest commits get checked. */
const MaxCommits = 50

export interface IMainConflicts {
  /** The ref compared against, e.g. `origin/main`. */
  readonly mainRef: string
  /** Commits ahead of main, newest first, with the files that would conflict. */
  readonly conflicts: ReadonlyMap<string, ReadonlyArray<string>>
}

const run = (repository: Repository, args: string[], codes = [0]) =>
  git(args, repository.path, 'mainConflicts', {
    successExitCodes: new Set(codes),
  })

/** The remote's default branch (origin/HEAD), else origin/main or master. */
export async function findRemoteMain(
  repository: Repository,
  remote = 'origin'
): Promise<string | null> {
  const head = await run(
    repository,
    ['symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`],
    [0, 1, 128]
  )
  const candidates = [
    ...(head.exitCode === 0 ? [head.stdout.trim()] : []),
    `${remote}/main`,
    `${remote}/master`,
  ]
  for (const ref of candidates) {
    const r = await run(
      repository,
      ['rev-parse', '--verify', '-q', `refs/remotes/${ref}^{commit}`],
      [0, 1, 128]
    )
    if (r.exitCode === 0) {
      return ref
    }
  }
  return null
}

// Merging a commit into a given main always gives the same answer.
const cache = new Map<string, ReadonlyArray<string>>()

/** Files that would conflict if `commit` were merged into `main` (both SHAs). */
export async function getConflictsWithMain(
  repository: Repository,
  main: string,
  commit: string
): Promise<ReadonlyArray<string>> {
  const key = `${repository.path}:${main}:${commit}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const r = await run(
    repository,
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      main,
      commit,
    ],
    [0, 1]
  )
  // First line is the merged tree; the conflicted files follow.
  const files =
    r.exitCode === 1
      ? [
          ...new Set(
            r.stdout
              .split('\n')
              .slice(1)
              .filter(l => l !== '')
          ),
        ]
      : []
  cache.set(key, files)
  return files
}

/**
 * Checks the current branch's newest commits that aren't in the remote main.
 * `onProgress` gets partial results, since each check can take a moment.
 */
export async function checkBranchAgainstMain(
  repository: Repository,
  onProgress?: (partial: IMainConflicts) => void
): Promise<IMainConflicts | null> {
  const mainRef = await findRemoteMain(repository)
  if (mainRef === null) {
    return null
  }
  const main = (
    await run(repository, ['rev-parse', `refs/remotes/${mainRef}`])
  ).stdout.trim()
  const ahead = await run(
    repository,
    ['rev-list', `--max-count=${MaxCommits}`, `${main}..HEAD`],
    [0, 128]
  )
  const shas = ahead.stdout.split('\n').filter(l => l !== '')

  const conflicts = new Map<string, ReadonlyArray<string>>()
  for (const sha of shas) {
    conflicts.set(sha, await getConflictsWithMain(repository, main, sha))
    onProgress?.({ mainRef, conflicts: new Map(conflicts) })
  }
  return { mainRef, conflicts }
}
