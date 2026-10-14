import * as React from 'react'
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
import { ITokens } from '../../lib/highlighter/types'
import { highlight } from '../../lib/highlighter/worker'
import { readPartialFile } from '../../lib/file-system'
import { getPartialBlobContents } from '../../lib/git/show'
import { getRathenaHighlightContext } from '../../lib/rathena/context'
import { syntaxHighlightLine } from './diff-helpers'

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
    { path, rathena: rathena ?? undefined }
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
}

/** Every line of a file with line numbers and syntax highlighting, virtualized. */
export class WholeFileLines extends React.Component<IWholeFileLinesProps> {
  private readonly heights = new CellMeasurerCache({
    fixedWidth: true,
    defaultHeight: RowHeight,
  })
  private list: List | null = null

  public componentDidUpdate(prevProps: IWholeFileLinesProps) {
    if (prevProps.lines !== this.props.lines) {
      this.heights.clearAll()
    }
  }

  /** Scrolls so `row` is at the top; heights above it may be estimates. */
  public scrollToRow(row: number) {
    this.list?.scrollToRow(row)
    requestAnimationFrame(() => this.list?.scrollToRow(row))
  }

  public render() {
    const { lines, tokens, decorationKey } = this.props
    return (
      <div className="whole-file-lines cm-s-default">
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
              // Passed only so the list re-renders when they change.
              lines={lines}
              tokens={tokens}
              decorationKey={decorationKey}
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
            {isPlain?.(index)
              ? line
              : syntaxHighlightLine(line, [tokens[index] ?? {}])}
          </span>
        </div>
      </CellMeasurer>
    )
  }

  private get lineNumberStyle() {
    return { width: `${String(this.props.lines.length).length + 2}ch` }
  }

  private getRowHeight = (row: { index: number }) =>
    this.heights.rowHeight(row) ?? RowHeight

  private onListRef = (list: List | null) => {
    this.list = list
  }

  private onResize = () => {
    this.heights.clearAll()
  }
}
