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
  readonly onClick: (row: IRow) => void
  readonly onContextMenu: (row: IRow) => void
}

class FileRow extends React.Component<IFileRowProps> {
  public render() {
    const { row, icon, selected } = this.props
    return (
      <button
        className={classNames('files-row', {
          selected,
          folder: row.isFolder,
        })}
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
}

/** Search and folder tree of every file, at a commit or on disk. */
export class FilesSidebar extends React.Component<
  IFilesSidebarProps,
  IFilesSidebarState
> {
  private loadId = 0

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
            onRef={noop}
          />
        </div>
        <div className="files-list">
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
                  // Passed only so the list re-renders when they change.
                  rows={rows}
                  selectedPath={this.props.selectedPath}
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
          onClick={this.onRowClicked}
          onContextMenu={this.onRowContextMenu}
        />
      </div>
    )
  }

  private onRowClicked = (row: IRow) => {
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
