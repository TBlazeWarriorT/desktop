import * as React from 'react'
import * as Path from 'path'
import classNames from 'classnames'
import { AutoSizer, List, ListRowProps } from 'react-virtualized'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { FancyTextBox } from '../lib/fancy-text-box'
import { Button } from '../lib/button'
import { HighlightText } from '../lib/highlight-text'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  IFileTreeRow,
  getFileTreeRows,
  listRepositoryFiles,
} from '../../lib/git/list-files'
import { IMatches, match } from '../../lib/fuzzy-find'
import memoizeOne from 'memoize-one'
import { showFilesContextMenu } from './files-context-menu'

const RowHeight = 24
const MaxSearchResults = 500

interface IFilesSidebarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /** The commit browsed; null for the working directory. */
  readonly commitish: string | null
  readonly selectedPath: string | null
  /** Reloads the list when this changes (the working directory's status). */
  readonly reloadKey: unknown
  readonly currentBranchName: string | null
  readonly externalEditorLabel?: string
  /** Repository-relative path; see files-context-menu.ts. */
  readonly onOpenInExternalEditor: (path: string) => void
}

interface IRow extends IFileTreeRow {
  readonly matches?: IMatches
}

interface IFileRowProps {
  readonly row: IRow
  readonly icon: typeof octicons.file
  readonly selected: boolean
  /** The keyboard cursor, e.g. on a folder (files show it as selected). */
  readonly cursor: boolean
  readonly onClick: (row: IRow) => void
  readonly onContextMenu: (row: IRow) => void
}

class FileRow extends React.Component<IFileRowProps> {
  public render() {
    const { row, icon, selected, cursor } = this.props
    return (
      <button
        className={classNames('files-row', {
          selected,
          cursor,
          folder: row.isFolder,
        })}
        tabIndex={-1}
        style={{ paddingLeft: `${8 + row.depth * 16}px` }}
        onClick={this.onClick}
        onContextMenu={this.onContextMenu}
      >
        <Octicon symbol={icon} />
        <span className="files-row-name">
          {row.matches ? (
            <HighlightText text={row.name} highlight={row.matches.subtitle} />
          ) : (
            row.name
          )}
        </span>
      </button>
    )
  }

  private onClick = () => {
    this.props.onClick(this.props.row)
  }

  private onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    this.props.onContextMenu(this.props.row)
  }
}

interface IFilesSidebarState {
  readonly paths: ReadonlyArray<string>
  readonly query: string
  readonly expanded: ReadonlySet<string>
  readonly loading: boolean
  /** Path of the row the arrow keys are on; null follows the open file. */
  readonly cursor: string | null
  /** Row to keep in view after a keyboard move. */
  readonly scrollToIndex: number | undefined
}

/** Search and folder tree of every file, at a commit or on disk. */
export class FilesSidebar extends React.Component<
  IFilesSidebarProps,
  IFilesSidebarState
> {
  private loadId = 0
  private list: HTMLDivElement | null = null

  // Each visible row asks for the rows, and a fuzzy match over thousands of
  // paths is slow: compute once per change of paths, query or open folders.
  private computeRows = memoizeOne(
    (
      paths: ReadonlyArray<string>,
      query: string,
      expanded: ReadonlySet<string>
    ): ReadonlyArray<IRow> =>
      query === ''
        ? getFileTreeRows(paths, expanded)
        : match(query, paths, p => [Path.posix.basename(p), p])
            .slice(0, MaxSearchResults)
            .map(m => ({
              path: m.item,
              name: m.item,
              depth: 0,
              isFolder: false,
              matches: m.matches,
            }))
  )

  public constructor(props: IFilesSidebarProps) {
    super(props)
    this.state = {
      paths: [],
      query: '',
      expanded: parentFolders(props.selectedPath),
      loading: true,
      cursor: null,
      scrollToIndex: undefined,
    }
  }

  public componentDidMount() {
    this.load()
  }

  public componentDidUpdate(prevProps: IFilesSidebarProps) {
    const { repository, commitish, reloadKey, selectedPath } = this.props
    if (
      prevProps.repository.id !== repository.id ||
      prevProps.commitish !== commitish ||
      (commitish === null && prevProps.reloadKey !== reloadKey)
    ) {
      this.load()
    }
    // The cursor follows the open file when it changes (also from elsewhere).
    if (
      prevProps.selectedPath !== selectedPath &&
      this.state.cursor !== null &&
      this.state.cursor !== selectedPath
    ) {
      this.setState({ cursor: null })
    }
    // Opened on a file from elsewhere: show it in the tree.
    if (prevProps.selectedPath !== selectedPath && selectedPath !== null) {
      const missing = [...parentFolders(selectedPath)].filter(
        f => !this.state.expanded.has(f)
      )
      if (missing.length > 0) {
        this.setState({
          expanded: new Set([...this.state.expanded, ...missing]),
        })
      }
    }
  }

  private async load() {
    const id = ++this.loadId
    this.setState({ loading: true })
    const { repository, commitish } = this.props
    const paths = await listRepositoryFiles(repository, commitish).catch(e => {
      log.error('Could not list the repository files', e)
      return []
    })
    if (id === this.loadId) {
      this.setState({ paths, loading: false })
    }
  }

  public render() {
    const rows = this.getRows()
    return (
      <div className="files-sidebar">
        {this.renderSource()}
        <div className="files-search">
          <FancyTextBox
            ariaLabel="Filter files"
            symbol={octicons.search}
            displayClearButton={true}
            placeholder="Find a file…"
            value={this.state.query}
            onValueChanged={this.onQueryChanged}
            onSearchCleared={this.onSearchCleared}
            onKeyDown={this.onSearchKeyDown}
            onRef={noop}
          />
        </div>
        <div className="files-list" ref={this.onListRef} tabIndex={-1}>
          {rows.length === 0 ? (
            <div className="files-empty">
              {this.state.loading ? 'Loading…' : 'No files'}
            </div>
          ) : (
            <AutoSizer>
              {({ width, height }) => (
                <List
                  width={width}
                  height={height}
                  rowCount={rows.length}
                  rowHeight={RowHeight}
                  rowRenderer={this.renderRow}
                  scrollToIndex={this.state.scrollToIndex}
                  // Passed only so the list re-renders when they change.
                  rows={rows}
                  selectedPath={this.props.selectedPath}
                  cursor={this.state.cursor}
                />
              )}
            </AutoSizer>
          )}
        </div>
      </div>
    )
  }

  private renderSource() {
    const { commitish } = this.props
    if (commitish === null) {
      return (
        <div className="files-source">
          <Octicon symbol={octicons.fileDirectory} />
          Working directory
        </div>
      )
    }
    return (
      <div className="files-source">
        <Octicon symbol={octicons.gitCommit} />
        <span>
          At commit <code>{commitish.slice(0, 7)}</code>
        </span>
        <Button
          className="files-source-clear"
          size="small"
          tooltip="Back to the working directory"
          onClick={this.onBackToWorkingDirectory}
        >
          <Octicon symbol={octicons.x} />
        </Button>
      </div>
    )
  }

  private getRows(): ReadonlyArray<IRow> {
    const { paths, query, expanded } = this.state
    return this.computeRows(paths, query.trim(), expanded)
  }

  private renderRow = ({ index, key, style }: ListRowProps) => {
    const row = this.getRows()[index]
    if (row === undefined) {
      return null
    }
    const selected = !row.isFolder && row.path === this.props.selectedPath
    const cursor = row.path === this.cursorPath
    const icon = row.isFolder
      ? this.state.expanded.has(row.path)
        ? octicons.chevronDown
        : octicons.chevronRight
      : octicons.file
    return (
      <div key={key} style={style}>
        <FileRow
          row={row}
          icon={icon}
          selected={selected}
          cursor={cursor}
          onClick={this.onRowClicked}
          onContextMenu={this.onRowContextMenu}
        />
      </div>
    )
  }

  private onRowClicked = (row: IRow) => {
    this.setState({ cursor: row.path })
    this.list?.focus({ preventScroll: true })
    if (row.isFolder) {
      const expanded = new Set(this.state.expanded)
      if (!expanded.delete(row.path)) {
        expanded.add(row.path)
      }
      this.setState({ expanded })
    } else {
      this.props.dispatcher.browseFiles(
        this.props.repository,
        undefined,
        row.path
      )
    }
  }

  private onRowContextMenu = (row: IRow) => {
    const {
      repository,
      dispatcher,
      commitish,
      currentBranchName,
      externalEditorLabel,
      onOpenInExternalEditor,
    } = this.props
    showFilesContextMenu(row.path, row.isFolder, {
      repository,
      dispatcher,
      commitish,
      currentBranchName,
      externalEditorLabel,
      onOpenInExternalEditor,
    })
  }

  private onQueryChanged = (query: string) => {
    this.setState({ query })
  }

  /** ↓ from the search box goes into the results. */
  private onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && this.getRows().length > 0) {
      event.preventDefault()
      this.moveTo(0)
    }
  }

  private onListRef = (list: HTMLDivElement | null) => {
    this.list?.removeEventListener('keydown', this.onListKeyDown)
    this.list = list
    list?.addEventListener('keydown', this.onListKeyDown)
  }

  private get cursorPath() {
    return this.state.cursor ?? this.props.selectedPath
  }

  /** Puts the cursor on a row, opening it when it's a file. */
  private moveTo(index: number) {
    const rows = this.getRows()
    const row = rows[Math.max(0, Math.min(index, rows.length - 1))]
    if (row === undefined) {
      return
    }
    this.setState({ cursor: row.path, scrollToIndex: rows.indexOf(row) })
    this.list?.focus({ preventScroll: true })
    if (!row.isFolder) {
      this.props.dispatcher.browseFiles(
        this.props.repository,
        undefined,
        row.path
      )
    }
  }

  private setExpanded(path: string, open: boolean) {
    const expanded = new Set(this.state.expanded)
    if (open) {
      expanded.add(path)
    } else {
      expanded.delete(path)
    }
    this.setState({ expanded })
  }

  /** Tree keys: ↑↓ move (files open), → opens or enters, ← closes or leaves. */
  private onListKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    const rows = this.getRows()
    const index = rows.findIndex(r => r.path === this.cursorPath)
    const row = rows[index]
    const open = row?.isFolder === true && this.state.expanded.has(row.path)
    switch (event.key) {
      case 'ArrowDown':
        this.moveTo(index + 1)
        break
      case 'ArrowUp':
        this.moveTo(index === -1 ? 0 : index - 1)
        break
      case 'Home':
        this.moveTo(0)
        break
      case 'End':
        this.moveTo(rows.length - 1)
        break
      case 'ArrowRight':
        if (row?.isFolder && !open) {
          this.setExpanded(row.path, true)
        } else if (open) {
          this.moveTo(index + 1)
        }
        break
      case 'ArrowLeft':
        if (open) {
          this.setExpanded(row.path, false)
        } else if (row !== undefined) {
          const parent = Path.posix.dirname(row.path)
          const parentIndex = rows.findIndex(
            r => r.isFolder && r.path === parent
          )
          if (parentIndex !== -1) {
            this.moveTo(parentIndex)
          }
        }
        break
      case 'Enter':
        if (row?.isFolder) {
          this.setExpanded(row.path, !open)
        } else if (row !== undefined) {
          this.moveTo(index)
        }
        break
      default:
        return
    }
    event.preventDefault()
  }

  private onSearchCleared = () => {
    this.setState({ query: '' })
  }

  private onBackToWorkingDirectory = () => {
    this.props.dispatcher.browseFiles(this.props.repository, null)
  }
}

const noop = () => {}

/** The folders containing `path`, so the tree can be opened down to it. */
function parentFolders(path: string | null): ReadonlySet<string> {
  const folders = new Set<string>()
  const parts = path?.split('/') ?? []
  for (let i = 1; i < parts.length; i++) {
    folders.add(parts.slice(0, i).join('/'))
  }
  return folders
}
