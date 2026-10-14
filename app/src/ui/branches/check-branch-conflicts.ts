import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../dispatcher'
import { getConflictsWithMain } from '../../lib/git/main-conflicts'

/** Simulates merging `branch` into the current one and shows the result. */
export async function checkBranchConflicts(
  dispatcher: Dispatcher,
  repository: Repository,
  branch: Branch,
  currentBranch: Branch | null
) {
  if (currentBranch === null) {
    return
  }
  try {
    const files = await getConflictsWithMain(
      repository,
      currentBranch.tip.sha,
      branch.tip.sha
    )
    dispatcher.showPopup({
      type: PopupType.BranchConflictCheck,
      repository,
      branchName: branch.name,
      currentBranchName: currentBranch.name,
      files,
    })
  } catch (e) {
    dispatcher.postError(e)
  }
}
