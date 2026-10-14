import * as React from 'react'
import { Branch, BranchType } from '../../models/branch'
import { Repository } from '../../models/repository'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  findRemoteMain,
  getConflictsWithMain,
} from '../../lib/git/main-conflicts'
import { remoteTip } from './branch-sync-indicator'
import { createConcurrencyLimit } from '../../lib/concurrency-limit'

/** The remote main per repository, looked up again after a while. */
const mainRefs = new Map<string, { at: number; ref: Promise<string | null> }>()
const MainRefTtlMs = 30_000

function getMainRef(repository: Repository) {
  const cached = mainRefs.get(repository.path)
  if (cached !== undefined && Date.now() - cached.at < MainRefTtlMs) {
    return cached.ref
  }
  const ref = findRemoteMain(repository).catch(() => null)
  mainRefs.set(repository.path, { at: Date.now(), ref })
  return ref
}

// A dropdown full of branches shouldn't start a git process for each at once.
const throttled = createConcurrencyLimit(2)

interface IBranchConflictIndicatorProps {
  readonly repository: Repository
  readonly branch: Branch
  /** Where the remote main's tip is looked up. */
  readonly allBranches: ReadonlyArray<Branch>
  readonly remoteTips?: ReadonlyMap<string, string>
}

interface IBranchConflictIndicatorState {
  readonly tooltip: string | null
}

/**
 * ⚠ next to a local branch whose latest commit would conflict with the remote
 * main if merged. Merged or up-to-date branches merge cleanly, so show nothing.
 */
export class BranchConflictIndicator extends React.Component<
  IBranchConflictIndicatorProps,
  IBranchConflictIndicatorState
> {
  private checking: string | null = null
  private unmounted = false

  public constructor(props: IBranchConflictIndicatorProps) {
    super(props)
    this.state = { tooltip: null }
  }

  public componentDidMount() {
    this.check()
  }

  public componentDidUpdate() {
    this.check()
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  private async check() {
    const { repository, branch, allBranches, remoteTips } = this.props
    if (branch.type !== BranchType.Local) {
      return
    }
    const mainRef = await getMainRef(repository)
    const mainTip = remoteTip(mainRef, remoteTips, allBranches)
    const key = mainTip ? `${mainTip}:${branch.tip.sha}` : null
    if (key === this.checking || this.unmounted) {
      return
    }
    this.checking = key
    if (mainTip === undefined || mainRef === null) {
      this.setState({ tooltip: null })
      return
    }

    const files = await throttled(() =>
      getConflictsWithMain(repository, mainTip, branch.tip.sha)
    ).catch(() => [])
    if (this.unmounted || this.checking !== key) {
      return
    }
    const shown = files.slice(0, 5).join(', ')
    const more = files.length > 5 ? ` and ${files.length - 5} more` : ''
    this.setState({
      tooltip:
        files.length > 0
          ? `Conflicts with ${mainRef} if merged: ${shown}${more}`
          : null,
    })
  }

  public render() {
    if (this.state.tooltip === null) {
      return null
    }
    return (
      <TooltippedContent
        className="branch-conflict-indicator"
        tagName="span"
        tooltip={this.state.tooltip}
      >
        <Octicon symbol={octicons.alert} />
      </TooltippedContent>
    )
  }
}
