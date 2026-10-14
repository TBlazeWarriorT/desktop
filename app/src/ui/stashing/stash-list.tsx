import * as React from 'react'
import classNames from 'classnames'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { PopupType } from '../../models/popup'
import { Octicon, OcticonSymbolVariant } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'
import { showContextualMenu } from '../../lib/menu-item'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import { StashDiffViewerId } from '.'

const ExpandedKey = 'stash-list-expanded'

interface IStashListItemProps {
  readonly stash: IStashEntry
  readonly selected: boolean
  readonly otherBranch: boolean
  readonly onClick: (stash: IStashEntry, selected: boolean) => void
  readonly onContextMenu: (e: React.MouseEvent, stash: IStashEntry) => void
}

class StashListItem extends React.Component<IStashListItemProps> {
  public render() {
    const { stash, selected, otherBranch } = this.props
    return (
      <li>
        <button
          className={classNames('stash-list-item', { selected })}
          onClick={this.onClick}
          onContextMenu={this.onContextMenu}
          aria-pressed={selected}
          aria-controls={selected ? StashDiffViewerId : undefined}
        >
          <span className="stash-title">{getStashTitle(stash)}</span>
          <span className="stash-meta">
            {otherBranch && (
              <span className="stash-branch">{stash.branchName}</span>
            )}
            {stash.createdAt && (
              <RelativeTime date={stash.createdAt} onlyRelative={true} />
            )}
          </span>
        </button>
      </li>
    )
  }

  private onClick = () => {
    this.props.onClick(this.props.stash, this.props.selected)
  }

  private onContextMenu = (e: React.MouseEvent) => {
    this.props.onContextMenu(e, this.props.stash)
  }
}

interface IStashListProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly stashEntries: ReadonlyArray<IStashEntry>
  /** The stash the stash view shows, when it is open. */
  readonly shownStash: IStashEntry | null
  readonly isShowingStash: boolean
  readonly currentBranchName: string | null
  readonly icon: OcticonSymbolVariant
}

interface IStashListState {
  readonly expanded: boolean
}

/** Every stash in the repository, below the changed files. */
export class StashList extends React.Component<
  IStashListProps,
  IStashListState
> {
  public constructor(props: IStashListProps) {
    super(props)
    this.state = { expanded: getBoolean(ExpandedKey, true) }
  }

  public render() {
    const { stashEntries, icon } = this.props
    if (stashEntries.length === 0) {
      return null
    }

    const { expanded } = this.state
    return (
      <div className="stash-list">
        <button
          className="stashed-changes-button stash-list-header"
          onClick={this.onToggle}
          aria-expanded={expanded}
        >
          <Octicon className="stack-icon" symbol={icon} />
          <div className="text">Stashes</div>
          <span className="stash-list-count">{stashEntries.length}</span>
          <Octicon
            symbol={expanded ? octicons.chevronDown : octicons.chevronRight}
          />
        </button>
        {expanded && (
          <ul className="stash-list-items">
            {this.sortedEntries().map(this.renderEntry)}
          </ul>
        )}
      </div>
    )
  }

  /** The current branch's stashes first, each group newest first. */
  private sortedEntries() {
    const { stashEntries, currentBranchName } = this.props
    const mine = stashEntries.filter(e => e.branchName === currentBranchName)
    const others = stashEntries.filter(e => e.branchName !== currentBranchName)
    return [...mine, ...others]
  }

  private renderEntry = (stash: IStashEntry) => {
    const { shownStash, isShowingStash, currentBranchName } = this.props
    return (
      <StashListItem
        key={stash.stashSha}
        stash={stash}
        selected={isShowingStash && shownStash?.stashSha === stash.stashSha}
        otherBranch={stash.branchName !== currentBranchName}
        onClick={this.onClick}
        onContextMenu={this.onContextMenu}
      />
    )
  }

  private onToggle = () => {
    const expanded = !this.state.expanded
    setBoolean(ExpandedKey, expanded)
    this.setState({ expanded })
  }

  private onClick = (stash: IStashEntry, selected: boolean) => {
    const { dispatcher, repository } = this.props
    if (selected) {
      dispatcher.selectWorkingDirectoryFiles(repository)
    } else {
      dispatcher.showStash(repository, stash)
    }
  }

  private onContextMenu = (e: React.MouseEvent, stash: IStashEntry) => {
    e.preventDefault()
    const { dispatcher, repository } = this.props
    showContextualMenu([
      {
        label: 'Restore',
        action: () => dispatcher.popStash(repository, stash),
      },
      {
        label: __DARWIN__ ? 'Apply (Keep Stash)' : 'Apply (keep stash)',
        action: () => dispatcher.applyStash(repository, stash),
      },
      {
        label: 'Rename…',
        action: () =>
          dispatcher.showPopup({
            type: PopupType.RenameStash,
            repository,
            stash,
          }),
      },
      { type: 'separator' },
      {
        label: 'Discard…',
        action: () =>
          dispatcher.showPopup({
            type: PopupType.ConfirmDiscardStash,
            repository,
            stash,
          }),
      },
    ])
  }
}

export function getStashTitle(stash: IStashEntry) {
  return stash.title !== undefined && stash.title !== ''
    ? stash.title
    : 'Stashed changes'
}
