import { Branch, BranchType } from '../../models/branch'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'

export type BranchGroupIdentifier =
  | 'default'
  | 'recent'
  | 'other'
  /** All branches of one remote, e.g. `remote:origin`. */
  | `remote:${string}`

export interface IBranchListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly branch: Branch
}

export function groupBranches(
  defaultBranch: Branch | null,
  currentBranch: Branch | null,
  allBranches: ReadonlyArray<Branch>,
  recentBranches: ReadonlyArray<Branch>,
  remoteBranches?: ReadonlyArray<Branch>,
  expandedRemotes?: ReadonlySet<string>
): ReadonlyArray<IFilterListGroup<IBranchListItem>> {
  const groups = new Array<IFilterListGroup<IBranchListItem>>()

  if (defaultBranch) {
    groups.push({
      identifier: 'default',
      items: [
        {
          text: [defaultBranch.name],
          id: defaultBranch.name,
          branch: defaultBranch,
        },
      ],
    })
  }

  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  const recentBranchesWithoutDefault = recentBranches.filter(
    b => b.name !== defaultBranchName
  )
  if (recentBranchesWithoutDefault.length > 0) {
    const recentBranches = new Array<IBranchListItem>()

    for (const branch of recentBranchesWithoutDefault) {
      recentBranches.push({
        text: [branch.name],
        id: branch.name,
        branch,
      })
      recentBranchNames.add(branch.name)
    }

    groups.push({
      identifier: 'recent',
      items: recentBranches,
    })
  }

  const remainingBranches = allBranches.filter(
    b =>
      b.name !== defaultBranchName &&
      !recentBranchNames.has(b.name) &&
      !b.isDesktopForkRemoteBranch &&
      // With remote groups, remote branches only show up there.
      (remoteBranches === undefined || b.type !== BranchType.Remote)
  )

  const remainingItems = remainingBranches.map(b => ({
    text: [b.name],
    id: b.name,
    branch: b,
  }))
  groups.push({
    identifier: 'other',
    items: remainingItems,
  })

  for (const [remote, branches] of groupByRemote(remoteBranches ?? [])) {
    groups.push({
      identifier: `remote:${remote}`,
      collapsed: !expandedRemotes?.has(remote),
      items: branches.map(b => ({ text: [b.name], id: b.name, branch: b })),
    })
  }

  return groups
}

/** Remote branches by remote, `origin` first and the rest by name. */
function groupByRemote(branches: ReadonlyArray<Branch>) {
  const byRemote = new Map<string, Branch[]>()
  for (const branch of branches) {
    const remote = branch.remoteName
    if (remote !== null && !branch.isDesktopForkRemoteBranch) {
      byRemote.set(remote, [...(byRemote.get(remote) ?? []), branch])
    }
  }
  return [...byRemote].sort(([a], [b]) =>
    a === 'origin' ? -1 : b === 'origin' ? 1 : a.localeCompare(b)
  )
}
