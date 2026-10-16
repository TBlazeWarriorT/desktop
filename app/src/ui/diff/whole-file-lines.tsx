import * as React from 'react'
import { getSyntaxOverride } from '../../lib/syntax-override'
import * as Path from 'path'
import classNames from 'classnames'
import {
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
  List,
  ListRowProps,
} from 'react-virtualized'
import { Repository } from '../../models/repository'
import { ILineTokens, ITokens } from '../../lib/highlighter/types'
import { highlight } from '../../lib/highlighter/worker'
import { readPartialFile } from '../../lib/file-system'
import { getPartialBlobContents } from '../../lib/git/show'
import { getRathenaHighlightContext } from '../../lib/rathena/context'
import { syntaxHighlightLine } from './diff-helpers'
import { DiffSearchInput } from './diff-search-input'
import escapeRegExp from 'lodash/escapeRegExp'

const MaxFileSize = 1024 * 1024
const RowHeight = 20

/** Where a whole file is read from: the working directory or a commit. */
export type WholeFileSource =
  | { readonly kind: 'disk' }
  | { readonly kind: 'commit'; readonly commitish: string }

export interface IWholeFile {
  readonly lines: ReadonlyArray<string>
  /** Only the first MaxFileSize bytes were read. */
  readonly truncated: boolean
  readonly binary: boolean
  /** Not on disk, or not in that commit. */
  readonly missing: boolean
}

export async function loadWholeFile(
  repository: Repository,
  path: string,
  source: WholeFileSource
): Promise<IWholeFile> {
  const buffer = await (source.kind === 'disk'
    ? readPartialFile(Path.join(repository.path, path), 0, MaxFileSize)
    : getPartialBlobContents(repository, source.commitish, path, MaxFileSize)
  ).catch(() => null)

  if (buffer === null) {
    return { lines: [], truncated: false, binary: false, missing: true }
  }
  // Same rule git uses: a NUL byte early on means binary.
  if (buffer.subarray(0, 8000).includes(0)) {
    return { lines: [], truncated: false, binary: true, missing: false }
  }
  return {
    lines: buffer.toString('utf8').split(/\r?\n/),
    truncated: buffer.length >= MaxFileSize,
    binary: false,
    missing: false,
  }
}

/** Same text, so a reload can skip re-rendering and re-highlighting. */
export function sameLines(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>
): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i])
}

/** Syntax tokens for every line, rAthena included. */
export async function highlightWholeFile(
  repository: Repository,
  path: string,
  lines: ReadonlyArray<string>
): Promise<ITokens> {
  const rathena = await getRathenaHighlightContext(repository.path)
  return highlight(
    lines,
    Path.basename(path),
    Path.extname(path),
    4,
    lines.map((_, i) => i),
    {
      path,
      rathena: rathena ?? undefined,
      syntax: getSyntaxOverride(repository.path, path),
    }
  ).catch(e => {
    log.error('Highlighter failed for a whole file', e)
    return {}
  })
}

interface IWholeFileLinesProps {
  readonly lines: ReadonlyArray<string>
  readonly tokens: ITokens
  /** Extra classes per line, e.g. conflict blocks. */
  readonly rowClassName?: (index: number) => string | undefined
  /** Lines shown without syntax highlighting, e.g. conflict markers. */
  readonly isPlain?: (index: number) => boolean
  /** Changes whenever rowClassName's answers do, to re-render. */
  readonly decorationKey?: unknown
  /** Row to show at the top when mounted, e.g. where the editor was. */
  readonly initialTopRow?: number
}

/** Every line of a file with line numbers and syntax highlighting, virtualized. */
/** Ctrl+F hits: `search-result` tokens per line, and each hit in order. */
interface ISearch {
  readonly query: string
  readonly tokens: ReadonlyMap<number, ILineTokens>
  readonly hits: ReadonlyArray<{ line: number; offset: number; length: number }>
  readonly selected: number
}

interface IWholeFileLinesState {
  readonly searching: boolean
  readonly search: ISearch | null
}

function findHits(lines: ReadonlyArray<string>, query: string): ISearch {
  const re = new RegExp(escapeRegExp(query), 'gi')
  const tokens = new Map<number, ILineTokens>()
  const hits = []
  for (const [line, text] of lines.entries()) {
    for (const match of text.matchAll(re)) {
      const offset = match.index ?? 0
      const length = match[0].length
      tokens.set(line, {
        ...tokens.get(line),
        [offset]: { length, token: 'search-result' },
      })
      hits.push({ line, offset, length })
    }
  }
  return { query, tokens, hits, selected: 0 }
}

export class WholeFileLines extends React.Component<
  IWholeFileLinesProps,
  IWholeFileLinesState
> {
  private readonly heights = new CellMeasurerCache({
    fixedWidth: true,
    defaultHeight: RowHeight,
  })
  private list: List | null = null
  /**
   * Ctrl+A was pressed and the selection hasn't changed since. Only the rows
   * on screen exist, so the copy is filled from `lines` instead.
   */
  private allSelected = false
  private topRow = 0
  private container: HTMLDivElement | null = null

  public constructor(props: IWholeFileLinesProps) {
    super(props)
    this.state = { searching: false, search: null }
  }

  public componentDidMount() {
    // Edit > Find (app.tsx); the diff listens for the same event.
    document.addEventListener('find-text', this.onFindText)
    if (this.props.initialTopRow) {
      this.scrollToRow(this.props.initialTopRow)
    }
  }

  /** The first row on screen, to keep the place elsewhere. */
  public getTopRow() {
    return this.topRow
  }

  public componentWillUnmount() {
    document.removeEventListener('find-text', this.onFindText)
  }

  public componentDidUpdate(prevProps: IWholeFileLinesProps) {
    if (prevProps.lines !== this.props.lines) {
      this.allSelected = false
      this.remeasure()
      const { search } = this.state
      if (search !== null) {
        this.setState({ search: findHits(this.props.lines, search.query) })
      }
    }
  }

  /** Forgets measured heights, or the list keeps the old total height. */
  private remeasure() {
    this.heights.clearAll()
    this.list?.recomputeRowHeights()
  }

  /** Scrolls so `row` is at the top; heights above it may be estimates. */
  public scrollToRow(row: number) {
    this.list?.scrollToRow(row)
    requestAnimationFrame(() => this.list?.scrollToRow(row))
  }

  public render() {
    const { lines, tokens, decorationKey } = this.props
    const { search } = this.state
    return (
      <div className="whole-file-lines cm-s-default" ref={this.onContainerRef}>
        {this.state.searching && (
          <DiffSearchInput
            onSearch={this.onSearch}
            onClose={this.onSearchClose}
          />
        )}
        {search !== null && (
          <div className="whole-file-search-count">
            {search.hits.length === 0
              ? `No results for "${search.query}"`
              : `${search.selected + 1} of ${search.hits.length}`}
          </div>
        )}
        <AutoSizer onResize={this.onResize}>
          {({ width, height }) => (
            <List
              ref={this.onListRef}
              deferredMeasurementCache={this.heights}
              width={width}
              height={height}
              rowCount={lines.length}
              rowHeight={this.getRowHeight}
              rowRenderer={this.renderRow}
              scrollToAlignment="start"
              onRowsRendered={this.onRowsRendered}
              // Passed only so the list re-renders when they change.
              lines={lines}
              tokens={tokens}
              decorationKey={decorationKey}
              search={search}
            />
          )}
        </AutoSizer>
      </div>
    )
  }

  private renderRow = ({ index, key, parent, style }: ListRowProps) => {
    const { lines, tokens, rowClassName, isPlain } = this.props
    const line = lines[index]
    return (
      <CellMeasurer
        cache={this.heights}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div
          className={classNames('whole-file-row', rowClassName?.(index))}
          style={style}
        >
          <span className="line-number" style={this.lineNumberStyle}>
            {index + 1}
          </span>
          <span className="content">
            {this.renderContent(
              index,
              line,
              isPlain?.(index) ? undefined : tokens[index] ?? {}
            )}
          </span>
        </div>
      </CellMeasurer>
    )
  }

  private renderContent(
    index: number,
    line: string,
    lineTokens: ILineTokens | undefined
  ) {
    const { search } = this.state
    const hits = search?.tokens.get(index)
    if (search == null || hits === undefined) {
      return lineTokens === undefined
        ? line
        : syntaxHighlightLine(line, [lineTokens])
    }
    const selected = search.hits[search.selected]
    const selectedToken: ILineTokens =
      selected?.line === index
        ? { [selected.offset]: { length: selected.length, token: 'selected' } }
        : {}
    return syntaxHighlightLine(line, [lineTokens ?? {}, hits, selectedToken])
  }

  private onFindText = (event: Event) => {
    if (this.container !== null) {
      event.preventDefault()
      this.setState({ searching: true })
    }
  }

  /** Enter: next hit (Shift: previous), or a new search if the query changed. */
  private onSearch = (query: string, direction: 'next' | 'previous') => {
    const { search } = this.state
    if (query.trim() === '') {
      this.setState({ search: null })
      return
    }
    let next: ISearch
    if (search !== null && search.query === query && search.hits.length > 0) {
      const delta = direction === 'next' ? 1 : -1
      const count = search.hits.length
      next = { ...search, selected: (search.selected + delta + count) % count }
    } else {
      next = findHits(this.props.lines, query)
    }
    this.setState({ search: next })
    const hit = next.hits[next.selected]
    if (hit !== undefined) {
      // A few lines of context above the hit.
      this.scrollToRow(Math.max(0, hit.line - 3))
    }
  }

  private onSearchClose = () => {
    this.setState({ searching: false, search: null })
  }

  private get lineNumberStyle() {
    return { width: `${String(this.props.lines.length).length + 2}ch` }
  }

  private getRowHeight = (row: { index: number }) =>
    this.heights.rowHeight(row) ?? RowHeight

  private onRowsRendered = ({ startIndex }: { startIndex: number }) => {
    this.topRow = startIndex
  }

  private onListRef = (list: List | null) => {
    this.list = list
  }

  private onResize = () => {
    this.remeasure()
  }

  private onContainerRef = (container: HTMLDivElement | null) => {
    const listeners = [
      ['select-all', this.onSelectAll],
      ['keydown', this.onKeyDown],
      ['mousedown', this.onMouseDown],
      ['copy', this.onCopy],
    ] as const
    for (const [type, listener] of listeners) {
      this.container?.removeEventListener(type, listener as EventListener)
      container?.addEventListener(type, listener as EventListener)
    }
    this.container = container
  }

  /** Edit > Select all (app.tsx sends it from the focused element), or Ctrl+A. */
  private onSelectAll = (event: Event) => {
    if (this.container !== null) {
      event.preventDefault()
      window.getSelection()?.selectAllChildren(this.container)
      this.allSelected = true
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const mod = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (mod && !event.shiftKey && !event.altKey && event.key === 'a') {
      this.onSelectAll(event)
    }
  }

  private onMouseDown = () => {
    this.allSelected = false
  }

  private onCopy = (event: ClipboardEvent) => {
    if (this.allSelected && !window.getSelection()?.isCollapsed) {
      event.preventDefault()
      event.clipboardData?.setData('text/plain', this.props.lines.join('\n'))
    }
  }
}
