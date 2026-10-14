import { git } from './core'
import { Repository } from '../../models/repository'
import { getConfigValue } from './config'
import { listWorktrees } from './worktree'

export type UpdateBranchResult =
  | { readonly kind: 'up-to-date' }
  | { readonly kind: 'fast-forwarded' }
  | { readonly kind: 'merged' }
  | { readonly kind: 'rebased' }
  /** Integrating needs a conflict resolution, so a checkout. */
  | { readonly kind: 'conflicts' }
  /** pull.ff=only (or branch config) forbids anything but a fast-forward. */
  | { readonly kind: 'needs-merge' }
  | { readonly kind: 'checked-out'; readonly path: string }
  | { readonly kind: 'no-upstream' }

async function revParse(repository: Repository, ref: string) {
  const r = await git(
    ['rev-parse', '--verify', '-q', `${ref}^{commit}`],
    repository.path,
    'revParse',
    { successExitCodes: new Set([0, 1]) }
  )
  return r.exitCode === 0 ? r.stdout.trim() : null
}

async function isAncestor(repository: Repository, a: string, b: string) {
  const r = await git(
    ['merge-base', '--is-ancestor', a, b],
    repository.path,
    'isAncestor',
    { successExitCodes: new Set([0, 1]) }
  )
  return r.exitCode === 0
}

/** Mirrors `git pull`: branch.<name>.rebase wins over pull.rebase. */
async function getPullStrategy(repository: Repository, name: string) {
  const rebase =
    (await getConfigValue(repository, `branch.${name}.rebase`)) ??
    (await getConfigValue(repository, 'pull.rebase'))
  const ffOnly = (await getConfigValue(repository, 'pull.ff')) === 'only'
  return {
    rebase: rebase !== null && rebase !== 'false',
    ffOnly,
  }
}

const update = (
  repository: Repository,
  ref: string,
  newSha: string,
  oldSha: string,
  reason: string
) =>
  git(
    ['update-ref', '-m', reason, ref, newSha, oldSha],
    repository.path,
    'updateBranch'
  )

/**
 * Brings a local branch that is NOT checked out up to date with its upstream,
 * the way `git pull` would, without touching the working directory. Expects
 * the upstream to have been fetched already.
 */
export async function updateBranchFromUpstream(
  repository: Repository,
  name: string,
  upstream: string
): Promise<UpdateBranchResult> {
  const ref = `refs/heads/${name}`
  const worktree = (await listWorktrees(repository)).find(w => w.branch === ref)
  if (worktree !== undefined) {
    return { kind: 'checked-out', path: worktree.path }
  }

  const local = await revParse(repository, ref)
  const remote = await revParse(repository, `refs/remotes/${upstream}`)
  if (local === null || remote === null) {
    return { kind: 'no-upstream' }
  }

  if (local === remote || (await isAncestor(repository, remote, local))) {
    return { kind: 'up-to-date' }
  }

  const reason = `pull: ${upstream} into ${name} (without checkout)`

  if (await isAncestor(repository, local, remote)) {
    await update(repository, ref, remote, local, reason)
    return { kind: 'fast-forwarded' }
  }

  const strategy = await getPullStrategy(repository, name)
  if (strategy.ffOnly) {
    return { kind: 'needs-merge' }
  }

  if (strategy.rebase) {
    // Prints "update refs/heads/<name> <new> <old>"; exit code 1 on conflicts.
    const r = await git(
      ['replay', '--ref-action=print', '--onto', remote, `${remote}..${ref}`],
      repository.path,
      'replayBranch',
      { successExitCodes: new Set([0, 1]) }
    )
    const m = /^update \S+ ([0-9a-f]+) /m.exec(r.stdout)
    if (r.exitCode !== 0 || m === null) {
      return { kind: 'conflicts' }
    }
    await update(repository, ref, m[1], local, reason)
    return { kind: 'rebased' }
  }

  // First line of the output is the merged tree; exit code 1 on conflicts.
  const tree = await git(
    ['merge-tree', '--write-tree', '--no-messages', local, remote],
    repository.path,
    'mergeTreeBranch',
    { successExitCodes: new Set([0, 1]) }
  )
  if (tree.exitCode !== 0) {
    return { kind: 'conflicts' }
  }

  const message = `Merge branch '${upstream.replace(/^[^/]+\//, '')}' of ${
    upstream.split('/')[0]
  } into ${name}`
  const commit = await git(
    [
      'commit-tree',
      tree.stdout.split('\n')[0].trim(),
      ...['-p', local, '-p', remote, '-m', message],
    ],
    repository.path,
    'commitMergeTree'
  )
  await update(repository, ref, commit.stdout.trim(), local, reason)
  return { kind: 'merged' }
}
