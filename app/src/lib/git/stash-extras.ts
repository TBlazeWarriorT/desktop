import { git, GitError } from './core'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  createDesktopStashMessage,
  dropDesktopStashEntry,
  getStashes,
  popStashEntry,
} from './stash'

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
  // Raw date ("1760441859 -0300") keeps the original time zone too.
  const { stdout: date } = await git(
    ['show', '-s', '--format=%ad', '--date=raw', stash.stashSha],
    repository.path,
    'renameStashEntry'
  )
  const env = { GIT_AUTHOR_DATE: date.trim(), GIT_COMMITTER_DATE: date.trim() }

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

const stashLabel = (stash: IStashEntry) =>
  stash.title ? `Stash "${stash.title}"` : 'Stash'

interface IStashMergePlan {
  /** Commit of the working directory (`git stash create`). */
  readonly mine: string
  /** The merged tree, conflict markers included. */
  readonly tree: string
  readonly conflicted: ReadonlyArray<string>
  /** A file the stash adds that already exists untracked: merging stops. */
  readonly clash: string | undefined
}

/** Merges in git's object store only; the working directory is untouched. */
async function planStashMerge(
  repository: Repository,
  stash: IStashEntry
): Promise<IStashMergePlan | null> {
  const run = (args: string[], codes = [0]) =>
    git(args, repository.path, 'planStashMerge', {
      successExitCodes: new Set(codes),
    })

  const mine = (await run(['stash', 'create'])).stdout.trim()
  if (mine === '') {
    return null
  }

  // Labels are the commit ids; relabelled once written to disk.
  const merge = await run(
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      `--merge-base=${stash.parents[0]}`,
      mine,
      stash.stashSha,
    ],
    [0, 1]
  )
  const [tree, ...conflicted] = merge.stdout.split('\n').filter(l => l !== '')

  const added = await run([
    'diff',
    '--name-only',
    '--diff-filter=A',
    mine,
    tree,
  ])
  const untracked = await run(['ls-files', '--others', '--exclude-standard'])
  const untrackedPaths = new Set(untracked.stdout.split('\n'))
  const clash = added.stdout
    .split('\n')
    .find(p => p !== '' && untrackedPaths.has(p))

  return { mine, tree, conflicted: [...new Set(conflicted)], clash }
}

/**
 * What "merge with my changes" would do, without doing it: the files that
 * would get conflict markers, or null when there are no local changes.
 */
export async function previewStashMerge(
  repository: Repository,
  stash: IStashEntry
) {
  const plan = await planStashMerge(repository, stash)
  return plan && { conflicted: plan.conflicted, clash: plan.clash }
}

/**
 * Applies a stash on top of local changes that touch the same files, which
 * `git stash apply` refuses: a snapshot of the working directory is merged
 * with the stash and written back, conflict markers included. `keep` false
 * drops the stash afterwards (Restore).
 */
export async function mergeStashWithLocalChanges(
  repository: Repository,
  stash: IStashEntry,
  keep: boolean
): Promise<void> {
  const plan = await planStashMerge(repository, stash)
  if (plan === null) {
    return keep
      ? applyStashEntry(repository, stash.stashSha)
      : popStashEntry(repository, stash.stashSha)
  }
  const { mine, tree, conflicted, clash } = plan
  if (clash !== undefined) {
    throw new Error(`The stash adds "${clash}", which exists as a new file.`)
  }

  const run = (args: string[]) =>
    git(args, repository.path, 'mergeStashWithLocalChanges')
  // Safety net until the merged files are on disk.
  const backup = `Your changes before merging ${stashLabel(stash)}`
  await run(['stash', 'store', '-m', backup, mine])
  await run(['read-tree', '--reset', '-u', tree])
  await run(['reset', '-q'])
  await relabelConflicts(repository, conflicted, {
    [mine]: 'Your changes',
    [stash.stashSha]: stashLabel(stash),
    [stash.parents[0]]: 'Original',
  })

  if (!keep) {
    await dropDesktopStashEntry(repository, stash.stashSha)
  }
  await dropDesktopStashEntry(repository, mine)
}

/** Replaces commit ids after conflict markers with readable names. */
async function relabelConflicts(
  repository: Repository,
  paths: ReadonlyArray<string>,
  labels: Record<string, string>
) {
  for (const path of new Set(paths)) {
    const full = join(repository.path, path)
    const content = await readFile(full, 'utf8')
    const relabeled = content.replace(
      /^([<|>]{7}) ([0-9a-f]{40})(\r?)$/gm,
      (line, marker, sha, cr) =>
        labels[sha] ? `${marker} ${labels[sha]}${cr}` : line
    )
    if (relabeled !== content) {
      await writeFile(full, relabeled)
    }
  }
}
