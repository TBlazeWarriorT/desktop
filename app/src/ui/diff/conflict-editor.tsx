import * as React from 'react'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'
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
import { CodeEditor } from '../editor/code-editor'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/** Larger files stay read-only, like the 1 MB the viewers load. */
const MaxEditableBytes = 1024 * 1024

/** Unsaved edits by repository and path; they outlive switching files. */
const drafts = new Map<string, string>()
const draftKey = (repository: Repository, path: string) =>
  `${repository.id}:${path}`

export const hasConflictDraft = (repository: Repository, path: string) =>
  drafts.has(draftKey(repository, path))

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
  /** Back to the read-only view (after Save, Discard or Close). */
  readonly onClose: () => void
}

interface ILoadedFile {
  /** As on disk, with `\n` line breaks. */
  readonly diskText: string
  /** What the file uses, restored on save. */
  readonly eol: '\n' | '\r\n'
  /** What the editor starts from: the draft, else the file. */
  readonly initialText: string
}

interface IConflictEditorState {
  readonly file: ILoadedFile | null
  readonly error: string | null
  readonly text: string
  readonly saving: boolean
}

/**
 * The conflicted file, editable: each block gets Current / Incoming / Both
 * buttons, and anything can be edited by hand. Saving a file without
 * markers is what marks it resolved.
 */
export class ConflictEditor extends React.Component<
  IConflictEditorProps,
  IConflictEditorState
> {
  private view: EditorView | null = null

  public constructor(props: IConflictEditorProps) {
    super(props)
    this.state = {
      file: null,
      error: null,
      text: '',
      saving: false,
    }
  }

  public componentDidMount() {
    this.load()
  }

  private get fullPath() {
    return Path.join(this.props.repository.path, this.props.path)
  }

  private get key() {
    return draftKey(this.props.repository, this.props.path)
  }

  private async load() {
    let buffer: Buffer
    try {
      buffer = await readFile(this.fullPath)
    } catch (e) {
      this.setState({ error: `Could not read the file: ${e}` })
      return
    }
    if (buffer.length > MaxEditableBytes) {
      this.setState({ error: 'Files over 1 MB can only be viewed.' })
      return
    }
    if (buffer.subarray(0, 8000).includes(0)) {
      this.setState({ error: 'Binary files cannot be edited.' })
      return
    }
    const raw = buffer.toString('utf8')
    const diskText = raw.replace(/\r\n/g, '\n')
    const initialText = drafts.get(this.key) ?? diskText
    this.setState({
      file: {
        diskText,
        eol: raw.includes('\r\n') ? '\r\n' : '\n',
        initialText,
      },
      text: initialText,
    })
  }

  public render() {
    const { file, error } = this.state
    return (
      <div className="conflict-editor">
        {this.renderToolbar()}
        {error !== null ? (
          <div className="conflict-editor-message">{error}</div>
        ) : file === null ? null : (
          <CodeEditor
            repository={this.props.repository}
            path={this.props.path}
            text={file.initialText}
            extensions={conflictField}
            onChange={this.onChange}
            onSave={this.onSave}
            onViewReady={this.onViewReady}
          />
        )}
      </div>
    )
  }

  private renderToolbar() {
    const { file, text, saving } = this.state
    const left = file === null ? 0 : findConflicts(text.split('\n')).length
    const dirty = file !== null && text !== file.diskText
    return (
      <div className="conflict-view-toolbar">
        <span className="conflict-view-count">
          {file === null
            ? 'Editing'
            : left === 0
            ? dirty
              ? 'No conflicts left: save to mark the file resolved'
              : 'No conflicts left'
            : `${left} conflict${left === 1 ? '' : 's'} left`}
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
        <span className="conflict-editor-spacer" />
        {dirty ? (
          <>
            <Button onClick={this.onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button onClick={this.onSaveAndClose} disabled={saving}>
              Save
            </Button>
          </>
        ) : (
          <Button onClick={this.props.onClose}>Close</Button>
        )}
      </div>
    )
  }

  private onViewReady = (view: EditorView | null) => {
    this.view = view
  }

  private onChange = (text: string) => {
    if (this.state.file !== null && text !== this.state.file.diskText) {
      drafts.set(this.key, text)
    } else {
      drafts.delete(this.key)
    }
    this.setState({ text })
  }

  /** Ctrl+S: saves and keeps editing. */
  private onSave = () => {
    this.save()
  }

  private onSaveAndClose = async () => {
    if (await this.save()) {
      this.props.onClose()
    }
  }

  private async save(): Promise<boolean> {
    const { file, text, saving } = this.state
    if (file === null || saving || text === file.diskText) {
      return false
    }
    this.setState({ saving: true })
    try {
      await writeFile(this.fullPath, text.replace(/\n/g, file.eol))
      drafts.delete(this.key)
      this.setState({ file: { ...file, diskText: text } })
      // The conflict marker count drives "resolved" in Changes.
      await this.props.dispatcher.refreshRepository(this.props.repository)
      this.setState({ saving: false })
      return true
    } catch (e) {
      this.setState({ saving: false, error: `Could not save the file: ${e}` })
      return false
    }
  }

  /** Throws the edits away and goes back to the read-only view. */
  private onDiscard = () => {
    drafts.delete(this.key)
    this.props.onClose()
  }

  private onPrevious = () => this.goToConflict(-1)
  private onNext = () => this.goToConflict(1)

  /** The next or previous block from the cursor, wrapping around. */
  private goToConflict(direction: 1 | -1) {
    const view = this.view
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
