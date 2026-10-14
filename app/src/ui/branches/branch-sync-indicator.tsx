import * as React from 'react'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'
import { Repository } from '../../models/repository'
import { AheadBehindStore } from '../../lib/stores/ahead-behind-store'
import type { Disposable } from 'event-kit'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IBranchSyncIndicatorProps {
  readonly repository: Repository
  readonly branch: Branch
  /** Where the branch's upstream (e.g. origin/main) is looked up. */
  readonly allBranches: ReadonlyArray<Branch>
  readonly aheadBehindStore: AheadBehindStore
}

interface IBranchSyncIndicatorState {
  readonly aheadBehind?: IAheadBehind
}

function upstreamTip(branch: Branch, allBranches: ReadonlyArray<Branch>) {
  if (branch.type !== BranchType.Local || branch.upstream === null) {
    return undefined
  }
  return allBranches.find(
    b => b.type === BranchType.Remote && b.name === branch.upstream
  )?.tip.sha
}

/**
 * `↓3 ↑1` next to a local branch: commits on its upstream it doesn't have yet,
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
    const { repository, branch, allBranches, aheadBehindStore } = this.props
    const to = upstreamTip(branch, allBranches)
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
    const title = [
      behind > 0 ? `${behind} new on ${this.props.branch.upstream}` : null,
      ahead > 0 ? `${ahead} not pushed` : null,
    ]
      .filter(x => x !== null)
      .join(', ')

    return (
      <TooltippedContent
        className="branch-sync-indicator"
        tagName="span"
        tooltip={title}
      >
        {behind > 0 && <span className="behind">↓{behind}</span>}
        {ahead > 0 && <span className="ahead">↑{ahead}</span>}
      </TooltippedContent>
    )
  }
}
