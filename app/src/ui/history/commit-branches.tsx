import * as React from 'react'
import { Repository } from '../../models/repository'
import { getBranchesContaining } from '../../lib/git/branches-containing'
import { createConcurrencyLimit } from '../../lib/concurrency-limit'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

// Branches move, so answers are reused only for a while.
const CacheTtlMs = 60_000
const cache = new Map<
  string,
  { at: number; branches: Promise<ReadonlyArray<string>> }
>()
const limit = createConcurrencyLimit(2)

function getBranches(repository: Repository, sha: string) {
  const key = `${repository.path}:${sha}`
  const cached = cache.get(key)
  if (cached !== undefined && Date.now() - cached.at < CacheTtlMs) {
    return cached.branches
  }
  const branches = limit(() => getBranchesContaining(repository, sha)).catch(
    () => []
  )
  cache.set(key, { at: Date.now(), branches })
  return branches
}

interface ICommitBranchesProps {
  readonly repository: Repository
  readonly sha: string
}

interface ICommitBranchesState {
  readonly branches: ReadonlyArray<string> | null
}

/** "main +2" next to a search result: the branches that contain it. */
export class CommitBranches extends React.Component<
  ICommitBranchesProps,
  ICommitBranchesState
> {
  private unmounted = false

  public constructor(props: ICommitBranchesProps) {
    super(props)
    this.state = { branches: null }
  }

  public async componentDidMount() {
    const branches = await getBranches(this.props.repository, this.props.sha)
    if (!this.unmounted) {
      this.setState({ branches })
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  public render() {
    const { branches } = this.state
    if (branches === null || branches.length === 0) {
      return null
    }
    const more = branches.length - 1
    return (
      <TooltippedContent
        tagName="span"
        className="commit-branches"
        tooltip={`In ${branches.join(', ')}`}
      >
        <Octicon symbol={octicons.gitBranch} />
        <span className="commit-branches-name">{branches[0]}</span>
        {more > 0 && <span className="commit-branches-more">+{more}</span>}
      </TooltippedContent>
    )
  }
}
