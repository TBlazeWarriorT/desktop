import * as React from 'react'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { IDiff } from '../../models/diff'
import { ITokens } from '../../lib/highlighter/types'
import {
  ConflictLineKind,
  IConflictRegion,
  findConflicts,
  getConflictLineKinds,
} from '../../lib/conflict-markers'
import {
  WholeFileLines,
  highlightWholeFile,
  loadWholeFile,
  sameLines,
} from './whole-file-lines'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import { Dispatcher } from '../dispatcher'
import { ConflictEditor, hasConflictDraft } from './conflict-editor'

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
  readonly dispatcher: Dispatcher
}

interface IConflictViewState {
  readonly lines: ReadonlyArray<string>
  readonly tokens: ITokens
  readonly regions: ReadonlyArray<IConflictRegion>
  readonly kinds: ReadonlyArray<ConflictLineKind | undefined>
  readonly current: number
  /** The merge editor instead of the read-only view. */
  readonly editing: boolean
}

/**
 * The whole working file with its conflict blocks colored, a count and
 * buttons to jump between them. Read-only.
 */
export class ConflictView extends React.Component<
  IConflictViewProps,
  IConflictViewState
> {
  private readonly linesRef = React.createRef<WholeFileLines>()
  private loadId = 0
  /** The shown lines got their tokens; a reload of the same text can stop. */
  private highlighted = false

  public constructor(props: IConflictViewProps) {
    super(props)
    this.state = {
      lines: [],
      tokens: {},
      regions: [],
      kinds: [],
      current: 0,
      editing: hasConflictDraft(props.repository, props.file.path),
    }
  }

  public componentDidMount() {
    this.load(true)
  }

  public componentDidUpdate(prevProps: IConflictViewProps) {
    if (prevProps.file.path !== this.props.file.path) {
      // Files with unsaved edits reopen in the editor.
      const { repository, file } = this.props
      this.setState({ editing: hasConflictDraft(repository, file.path) })
      this.load(true)
    } else if (prevProps.diff !== this.props.diff) {
      this.load(false)
    }
  }

  private async load(isNewFile: boolean) {
    const id = ++this.loadId
    const { repository, file } = this.props
    const { lines } = await loadWholeFile(repository, file.path, {
      kind: 'disk',
    })
    const regions = findConflicts(lines)
    // Refocusing the app reloads the file; unchanged, keep it as it is.
    if (
      id !== this.loadId ||
      (!isNewFile && this.highlighted && sameLines(this.state.lines, lines))
    ) {
      return
    }

    this.setState(
      {
        lines,
        regions,
        kinds: getConflictLineKinds(lines.length, regions),
        // A changed file keeps its old colors until the new ones arrive.
        tokens: isNewFile ? {} : this.state.tokens,
        current: isNewFile
          ? 0
          : Math.min(this.state.current, Math.max(regions.length - 1, 0)),
      },
      () => isNewFile && this.scrollToConflict(0)
    )

    this.highlighted = false
    const tokens = await highlightWholeFile(repository, file.path, lines)
    if (id === this.loadId) {
      this.setState({ tokens })
      this.highlighted = true
    }
  }

  public render() {
    const { lines, regions, current } = this.state

    if (this.state.editing) {
      return (
        <div className="conflict-view">
          <ConflictEditor
            key={this.props.file.path}
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            path={this.props.file.path}
            onClose={this.onStopEditing}
          />
        </div>
      )
    }

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
          <Button onClick={this.onEdit} tooltip="Resolve the conflicts here">
            <Octicon symbol={octicons.pencil} />
            Edit
          </Button>
        </div>
        <WholeFileLines
          // A new file starts at the top, not at the last one's scroll.
          key={this.props.file.path}
          ref={this.linesRef}
          lines={lines}
          tokens={this.state.tokens}
          rowClassName={this.rowClassName}
          isPlain={this.isMarker}
          decorationKey={current}
        />
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

  private rowClassName = (index: number) => {
    const region = this.state.regions[this.state.current]
    return classNames(this.state.kinds[index], {
      'current-conflict':
        region !== undefined && index >= region.start && index <= region.end,
    })
  }

  private isMarker = (index: number) => this.state.kinds[index] === 'marker'

  private onEdit = () => {
    this.setState({ editing: true })
  }

  private onStopEditing = () => {
    this.setState({ editing: false })
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
    this.setState({ current })
    // A few lines of context above.
    this.linesRef.current?.scrollToRow(Math.max(region.start - 3, 0))
  }
}
