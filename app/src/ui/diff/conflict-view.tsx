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
import { WorkingDirectoryFileChange } from '../../models/status'
import { IDiff } from '../../models/diff'
import { ITokens } from '../../lib/highlighter/types'
import { highlight } from '../../lib/highlighter/worker'
import { readPartialFile } from '../../lib/file-system'
import { getRathenaHighlightContext } from '../../lib/rathena/context'
import {
  ConflictLineKind,
  IConflictRegion,
  findConflicts,
  getConflictLineKinds,
} from '../../lib/conflict-markers'
import { syntaxHighlightLine } from './diff-helpers'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { getBoolean, setBoolean } from '../../lib/local-storage'

const MaxFileSize = 1024 * 1024
const RowHeight = 20
const ConflictViewKey = 'conflict-view'

/** The last Conflicts/Diff choice for files with conflict markers. */
export const getConflictView = () => getBoolean(ConflictViewKey, true)
export const setConflictView = (value: boolean) =>
  setBoolean(ConflictViewKey, value)

interface IConflictViewProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  /** Only used to reload when the app notices the file changed. */
  readonly diff: IDiff | null
}

interface IConflictViewState {
  readonly lines: ReadonlyArray<string>
  readonly tokens: ITokens
  readonly regions: ReadonlyArray<IConflictRegion>
  readonly kinds: ReadonlyArray<ConflictLineKind | undefined>
  readonly current: number
}

/**
 * The whole working file with its conflict blocks colored, a count and
 * buttons to jump between them. Read-only.
 */
export class ConflictView extends React.Component<
  IConflictViewProps,
  IConflictViewState
> {
  private readonly heights = new CellMeasurerCache({
    fixedWidth: true,
    defaultHeight: RowHeight,
  })
  private list: List | null = null
  private loadId = 0

  public constructor(props: IConflictViewProps) {
    super(props)
    this.state = { lines: [], tokens: {}, regions: [], kinds: [], current: 0 }
  }

  public componentDidMount() {
    this.load(true)
  }

  public componentDidUpdate(prevProps: IConflictViewProps) {
    if (prevProps.file.path !== this.props.file.path) {
      this.load(true)
    } else if (prevProps.diff !== this.props.diff) {
      this.load(false)
    }
  }

  private async load(isNewFile: boolean) {
    const id = ++this.loadId
    const { repository, file } = this.props
    const buffer = await readPartialFile(
      Path.join(repository.path, file.path),
      0,
      MaxFileSize - 1
    ).catch(e => {
      log.error('Could not read file for the conflict view', e)
      return null
    })
    const lines = buffer?.toString('utf8').split(/\r?\n/) ?? []
    const regions = findConflicts(lines)
    if (id !== this.loadId) {
      return
    }

    this.heights.clearAll()
    this.setState(
      {
        lines,
        regions,
        kinds: getConflictLineKinds(lines.length, regions),
        tokens: {},
        current: isNewFile
          ? 0
          : Math.min(this.state.current, Math.max(regions.length - 1, 0)),
      },
      () => isNewFile && this.scrollToConflict(0)
    )

    const rathena = await getRathenaHighlightContext(repository.path)
    const tokens = await highlight(
      lines,
      Path.basename(file.path),
      Path.extname(file.path),
      4,
      lines.map((_, i) => i),
      { path: file.path, rathena: rathena ?? undefined }
    ).catch(e => {
      log.error('Highlighter failed for the conflict view', e)
      return {}
    })
    if (id === this.loadId) {
      this.setState({ tokens })
    }
  }

  public render() {
    const { lines, regions, current } = this.state

    return (
      <div className="conflict-view">
        <div className="conflict-view-toolbar">
          {this.renderCount()}
          <Button
            onClick={this.onPrevious}
            disabled={regions.length === 0}
            tooltip="Previous conflict"
            ariaLabel="Previous conflict"
          >
            <Octicon symbol={octicons.arrowUp} />
          </Button>
          <Button
            onClick={this.onNext}
            disabled={regions.length === 0}
            tooltip="Next conflict"
            ariaLabel="Next conflict"
          >
            <Octicon symbol={octicons.arrowDown} />
          </Button>
          <span className="conflict-view-legend current">
            Current {this.label(regions[current]?.currentLabel)}
          </span>
          <span className="conflict-view-legend incoming">
            Incoming {this.label(regions[current]?.incomingLabel)}
          </span>
        </div>
        <div className="conflict-view-lines cm-s-default">
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
                tokens={this.state.tokens}
                current={current}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    )
  }

  private renderCount() {
    const { regions, current } = this.state
    const text =
      regions.length === 0
        ? 'No conflicts left'
        : `Conflict ${current + 1} of ${regions.length}`
    return <span className="conflict-view-count">{text}</span>
  }

  private label(label: string | undefined) {
    return label ? <code>{label}</code> : null
  }

  private renderRow = ({ index, key, parent, style }: ListRowProps) => {
    const { lines, tokens, kinds, regions, current } = this.state
    const line = lines[index]
    const kind = kinds[index]
    const region = regions[current]
    const isCurrent =
      region !== undefined && index >= region.start && index <= region.end

    return (
      <CellMeasurer
        cache={this.heights}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div
          className={classNames('conflict-view-row', kind, {
            'current-conflict': isCurrent,
          })}
          style={style}
        >
          <span className="line-number" style={this.lineNumberStyle}>
            {index + 1}
          </span>
          <span className="content">
            {kind === 'marker'
              ? line
              : syntaxHighlightLine(line, [tokens[index] ?? {}])}
          </span>
        </div>
      </CellMeasurer>
    )
  }

  private get lineNumberStyle() {
    return { width: `${String(this.state.lines.length).length + 2}ch` }
  }

  private getRowHeight = (row: { index: number }) =>
    this.heights.rowHeight(row) ?? RowHeight

  private onListRef = (list: List | null) => {
    this.list = list
  }

  private onResize = () => {
    this.heights.clearAll()
  }

  private onPrevious = () => {
    const n = this.state.regions.length
    this.scrollToConflict((this.state.current - 1 + n) % n)
  }

  private onNext = () => {
    this.scrollToConflict((this.state.current + 1) % this.state.regions.length)
  }

  private scrollToConflict(current: number) {
    const region = this.state.regions[current]
    if (region === undefined) {
      return
    }
    // A few lines of context above; heights above are estimates until
    // measured, so settle once more on the next frame.
    const row = Math.max(region.start - 3, 0)
    this.setState({ current })
    this.list?.scrollToRow(row)
    requestAnimationFrame(() => this.list?.scrollToRow(row))
  }
}
