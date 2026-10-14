import { IMenuItem } from '../../lib/menu-item'
import { writeClipboardText } from '../main-process-proxy'
import { Branch, BranchType } from '../../models/branch'

interface IBranchContextMenuConfig {
  branch: Branch
  onRenameBranch?: (branchName: string) => void
  onViewBranchOnGitHub?: () => void
  onViewPullRequestOnGitHub?: () => void
  onDeleteBranch?: (branchName: string) => void
  onCheckoutInNewWorktree?: (branch: Branch) => void
  onPullBranch?: (branch: Branch) => void
  /** Simulates merging the branch into the current one. */
  onCheckConflicts?: (branch: Branch) => void
  currentBranchName?: string | null
}

export function generateBranchContextMenuItems(
  config: IBranchContextMenuConfig
): IMenuItem[] {
  const {
    branch,
    onRenameBranch,
    onViewBranchOnGitHub,
    onViewPullRequestOnGitHub,
    onDeleteBranch,
    onCheckoutInNewWorktree,
    onPullBranch,
    onCheckConflicts,
    currentBranchName,
  } = config
  const items = new Array<IMenuItem>()

  if (
    onCheckConflicts !== undefined &&
    currentBranchName &&
    branch.name !== currentBranchName
  ) {
    items.push(
      {
        label: `Check conflicts with ${currentBranchName}`,
        action: () => onCheckConflicts(branch),
      },
      { type: 'separator' }
    )
  }

  if (
    onPullBranch !== undefined &&
    branch.type === BranchType.Local &&
    branch.upstreamRemoteName !== null
  ) {
    items.push(
      {
        label: `Pull from ${branch.upstreamRemoteName}`,
        action: () => onPullBranch(branch),
      },
      { type: 'separator' }
    )
  }

  if (onRenameBranch !== undefined) {
    items.push({
      label: 'Rename…',
      action: () => onRenameBranch(branch.name),
      enabled: branch.type === BranchType.Local,
    })
  }

  items.push({
    label: __DARWIN__ ? 'Copy Branch Name' : 'Copy branch name',
    action: () => writeClipboardText(branch.name),
  })

  if (onViewBranchOnGitHub !== undefined) {
    items.push({
      label: 'View Branch on GitHub',
      action: () => onViewBranchOnGitHub(),
    })
  }

  if (onViewPullRequestOnGitHub !== undefined) {
    items.push({
      label: 'View Pull Request on GitHub',
      action: () => onViewPullRequestOnGitHub(),
    })
  }

  if (onCheckoutInNewWorktree !== undefined) {
    items.push({
      label: __DARWIN__
        ? 'Checkout in New Worktree…'
        : 'Checkout in new worktree…',
      action: () => onCheckoutInNewWorktree(branch),
    })
  }

  items.push({ type: 'separator' })

  if (onDeleteBranch !== undefined) {
    items.push({
      label: 'Delete…',
      action: () => onDeleteBranch(branch.name),
    })
  }

  return items
}
