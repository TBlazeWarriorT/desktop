import * as React from 'react'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'
import { Repository } from '../../models/repository'
import { AheadBehindStore } from '../../lib/stores/ahead-behind-store'
import type { Disposable } from 'event-kit'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { formatCompactNumber } from '../../lib/format-number'

interface IBranchSyncIndicatorProps {
  readonly repository: Repository
  readonly branch: Branch
  /** Where the branch's upstream (e.g. origin/main) is looked up. */
  readonly allBranches: ReadonlyArray<Branch>
  /** Remote tips including tracked ones, which allBranches leaves out. */
  readonly remoteTips?: ReadonlyMap<string, string>
  readonly aheadBehindStore: AheadBehindStore
}

interface IBranchSyncIndicatorState {
  readonly aheadBehind?: IAheadBehind
}

/** A remote branch's tip. allBranches drops remotes tracked by a local branch. */
export function remoteTip(
  name: string | null,
  remoteTips: ReadonlyMap<string, string> | undefined,
  allBranches: ReadonlyArray<Branch>
) {
  if (name === null) {
    return undefined
  }
  return (
    remoteTips?.get(name) ??
    allBranches.find(b => b.type === BranchType.Remote && b.name === name)?.tip
      .sha
  )
}

/**
 * `1↑ 3↓` next to a local branch: commits on its upstream it doesn't have yet,
 * and commits of its own not pushed. Nothing when it is in sync.
 */
export class BranchSyncIndicator extends React.Component<
  IBranchSyncIndicatorProps,
  IBranchSyncIndicatorState
> {
  private subscription: Disposable | null = null
  private comparing: string | null = null

  public constructor(props: IBranchSyncIndicatorProps) {
    super(props)
    this.state = {}
  }

  public componentDidMount() {
    this.subscribe()
  }

  public componentDidUpdate() {
    this.subscribe()
  }

  public componentWillUnmount() {
    this.subscription?.dispose()
  }

  private subscribe() {
    const { repository, branch, allBranches, remoteTips, aheadBehindStore } =
      this.props
    const to =
      branch.type === BranchType.Local
        ? remoteTip(branch.upstream, remoteTips, allBranches)
        : undefined
    const key = to === undefined ? null : `${branch.tip.sha}...${to}`

    if (key === this.comparing) {
      return
    }
    this.comparing = key
    this.subscription?.dispose()
    this.subscription = null

    if (to === undefined) {
      this.setState({ aheadBehind: undefined })
      return
    }

    const from = branch.tip.sha
    const cached = aheadBehindStore.tryGetAheadBehind(repository, from, to)
    this.setState({ aheadBehind: cached })
    if (cached === undefined) {
      this.subscription = aheadBehindStore.getAheadBehind(
        repository,
        from,
        to,
        aheadBehind => this.setState({ aheadBehind })
      )
    }
  }

  public render() {
    const { aheadBehind } = this.state
    if (
      aheadBehind === undefined ||
      (aheadBehind.ahead === 0 && aheadBehind.behind === 0)
    ) {
      return null
    }

    const { ahead, behind } = aheadBehind
    // Same order and look as the toolbar's Push/Pull badge: ahead, then behind.
    const title = [
      ahead > 0 ? `${ahead} not pushed` : null,
      behind > 0 ? `${behind} new on ${this.props.branch.upstream}` : null,
    ]
      .filter(x => x !== null)
      .join(', ')

    return (
      <TooltippedContent
        className="branch-sync-indicator"
        tagName="span"
        tooltip={title}
      >
        {ahead > 0 && (
          <span className="ahead">
            {formatCompactNumber(ahead)}
            <Octicon symbol={octicons.arrowUp} />
          </span>
        )}
        {behind > 0 && (
          <span className="behind">
            {formatCompactNumber(behind)}
            <Octicon symbol={octicons.arrowDown} />
          </span>
        )}
      </TooltippedContent>
    )
  }
}
