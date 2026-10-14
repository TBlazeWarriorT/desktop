import * as React from 'react'
import { Range, StateField, Text } from '@codemirror/state'
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import {
  IConflictRegion,
  findConflicts,
  getConflictLineKinds,
} from '../../lib/conflict-markers'
import { ConflictChoice, resolveConflict } from '../../lib/conflict-resolution'
import { FileEditor } from '../editor/file-editor'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

const choices: ReadonlyArray<[ConflictChoice, string]> = [
  ['current', 'Current'],
  ['incoming', 'Incoming'],
  ['both', 'Both'],
  ['both-reversed', 'Both, incoming first'],
]

const shortLabel = (label: string) => (label.length > 0 ? ` (${label})` : '')

/** Replaces block `index` (markers included) with the chosen side(s). */
function applyChoice(view: EditorView, index: number, choice: ConflictChoice) {
  const doc = view.state.doc
  const lines = doc.toJSON()
  const region = findConflicts(lines)[index]
  if (region === undefined) {
    return
  }
  const replacement = resolveConflict(lines, region, choice)
  let from = doc.line(region.start + 1).from
  let to = doc.line(region.end + 1).to
  if (replacement.length === 0) {
    // Nothing kept: take one line break along, or a blank line is left.
    if (region.end + 1 < doc.lines) {
      to = doc.line(region.end + 2).from
    } else if (from > 0) {
      from--
    }
  }
  view.dispatch({
    changes: { from, to, insert: replacement.join('\n') },
    selection: { anchor: from },
    userEvent: 'input.resolve',
  })
  view.focus()
}

/** The buttons above each block's `<<<<<<<` line. */
class ConflictActions extends WidgetType {
  public constructor(
    private readonly index: number,
    private readonly region: IConflictRegion
  ) {
    super()
  }

  public eq(other: ConflictActions) {
    return (
      other.index === this.index &&
      other.region.currentLabel === this.region.currentLabel &&
      other.region.incomingLabel === this.region.incomingLabel
    )
  }

  public toDOM(view: EditorView) {
    const div = document.createElement('div')
    div.className = 'conflict-actions'
    for (const [choice, text] of choices) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent =
        choice === 'current'
          ? text + shortLabel(this.region.currentLabel)
          : choice === 'incoming'
          ? text + shortLabel(this.region.incomingLabel)
          : text
      button.addEventListener('click', () =>
        applyChoice(view, this.index, choice)
      )
      div.append(button)
    }
    return div
  }

  public ignoreEvent() {
    return true
  }
}

function conflictDecorations(doc: Text): DecorationSet {
  const lines = doc.toJSON()
  const regions = findConflicts(lines)
  const kinds = getConflictLineKinds(lines.length, regions)
  const ranges = new Array<Range<Decoration>>()
  regions.forEach((region, index) => {
    const widget = new ConflictActions(index, region)
    ranges.push(
      Decoration.widget({ widget, block: true, side: -1 }).range(
        doc.line(region.start + 1).from
      )
    )
  })
  kinds.forEach((kind, i) => {
    if (kind !== undefined) {
      const line = Decoration.line({ class: `conflict-line ${kind}` })
      ranges.push(line.range(doc.line(i + 1).from))
    }
  })
  return Decoration.set(ranges, true)
}

// Block widgets can't come from a view plugin, hence a state field.
const conflictField = StateField.define<DecorationSet>({
  create: state => conflictDecorations(state.doc),
  update: (decorations, tr) =>
    tr.docChanged ? conflictDecorations(tr.state.doc) : decorations,
  provide: field => EditorView.decorations.from(field),
})

interface IConflictEditorProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly path: string
  /** 0-based line to show at the top when opened. */
  readonly initialTopLine?: number
  /** Back to the read-only view (after Save, Discard or Close), at this line. */
  readonly onClose: (topLine: number | null) => void
}

/**
 * The conflicted file, editable: each block gets Current / Incoming / Both
 * buttons, and anything can be edited by hand. Saving a file without
 * markers is what marks it resolved.
 */
export class ConflictEditor extends React.Component<IConflictEditorProps> {
  private getView: () => EditorView | null = () => null

  public render() {
    return (
      <FileEditor
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        path={this.props.path}
        extensions={conflictField}
        renderStatus={this.renderStatus}
        initialTopLine={this.props.initialTopLine}
        onClose={this.props.onClose}
      />
    )
  }

  private renderStatus = (
    text: string,
    dirty: boolean,
    getView: () => EditorView | null
  ) => {
    this.getView = getView
    const left = findConflicts(text.split('\n')).length
    return (
      <>
        <span className="file-editor-status">
          {left > 0
            ? `${left} conflict${left === 1 ? '' : 's'} left`
            : dirty
            ? 'No conflicts left: save to mark the file resolved'
            : 'No conflicts left'}
        </span>
        <Button
          onClick={this.onPrevious}
          disabled={left === 0}
          tooltip="Previous conflict"
          ariaLabel="Previous conflict"
        >
          <Octicon symbol={octicons.arrowUp} />
        </Button>
        <Button
          onClick={this.onNext}
          disabled={left === 0}
          tooltip="Next conflict"
          ariaLabel="Next conflict"
        >
          <Octicon symbol={octicons.arrowDown} />
        </Button>
      </>
    )
  }

  private onPrevious = () => this.goToConflict(-1)
  private onNext = () => this.goToConflict(1)

  /** The next or previous block from the cursor, wrapping around. */
  private goToConflict(direction: 1 | -1) {
    const view = this.getView()
    if (view === null) {
      return
    }
    const doc = view.state.doc
    const regions = findConflicts(doc.toJSON())
    if (regions.length === 0) {
      return
    }
    const cursorLine = doc.lineAt(view.state.selection.main.head).number - 1
    const target =
      direction === 1
        ? regions.find(r => r.start > cursorLine) ?? regions[0]
        : [...regions].reverse().find(r => r.end < cursorLine) ??
          regions[regions.length - 1]
    const pos = doc.line(target.start + 1).from
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }),
    })
    view.focus()
  }
}
