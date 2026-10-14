import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { FetchType } from '../../models/fetch'
import { updateBranchFromUpstream } from '../../lib/git/update-branch'

/**
 * Pull for any local branch: the current one goes through the normal Pull, any
 * other one is updated from its upstream without being checked out.
 */
export async function pullBranch(
  dispatcher: Dispatcher,
  repository: Repository,
  branch: Branch,
  currentBranch: Branch | null
) {
  if (branch.name === currentBranch?.name) {
    return dispatcher.pull(repository)
  }

  const { name, upstream } = branch
  if (upstream === null) {
    return
  }

  // A fetch also fast-forwards every branch that is only behind.
  await dispatcher.fetch(repository, FetchType.UserInitiatedTask)
  const result = await updateBranchFromUpstream(repository, name, upstream)
  await dispatcher.refreshRepository(repository)

  const switchHint = `Switch to "${name}" and use Pull to resolve it the usual way.`
  switch (result.kind) {
    case 'conflicts':
      return dispatcher.postError(
        new Error(`"${name}" has conflicts with ${upstream}. ${switchHint}`)
      )
    case 'needs-merge':
      return dispatcher.postError(
        new Error(
          `"${name}" and ${upstream} have both changed, and your pull ` +
            `settings only allow fast-forwards. ${switchHint}`
        )
      )
    case 'checked-out':
      return dispatcher.postError(
        new Error(
          `"${name}" is checked out in another worktree (${result.path}). ` +
            `Pull it from there.`
        )
      )
    case 'no-upstream':
      return dispatcher.postError(
        new Error(`"${name}" or its upstream ${upstream} no longer exists.`)
      )
  }
}
