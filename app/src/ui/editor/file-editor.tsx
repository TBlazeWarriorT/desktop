import * as React from 'react'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { CodeEditor } from './code-editor'

/** Larger files stay read-only, like the 1 MB the viewers load. */
const MaxEditableBytes = 1024 * 1024

/** Unsaved edits by repository and path; they outlive switching files. */
const drafts = new Map<string, string>()
const draftKey = (repository: Repository, path: string) =>
  `${repository.id}:${path}`

/** Whether a file has unsaved edits, so its view reopens the editor. */
export const hasDraft = (repository: Repository, path: string) =>
  drafts.has(draftKey(repository, path))

interface IFileEditorProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly path: string
  readonly extensions?: Extension
  /** The left of the toolbar; defaults to "Editing" / "Unsaved changes". */
  readonly renderStatus?: (
    text: string,
    dirty: boolean,
    getView: () => EditorView | null
  ) => React.ReactNode
  /** 0-based line to show at the top when opened. */
  readonly initialTopLine?: number
  /** Back to the read-only view (after Save, Discard or Close), at this line. */
  readonly onClose: (topLine: number | null) => void
}

interface ILoadedFile {
  /** As on disk, with `\n` line breaks. */
  readonly diskText: string
  /** What the file uses, restored on save. */
  readonly eol: '\n' | '\r\n'
  /** What the editor starts from: the draft, else the file. */
  readonly initialText: string
}

interface IFileEditorState {
  readonly file: ILoadedFile | null
  readonly error: string | null
  readonly text: string
  readonly saving: boolean
}

/** A working-directory file, editable and saved back keeping its line endings. */
export class FileEditor extends React.Component<
  IFileEditorProps,
  IFileEditorState
> {
  private view: EditorView | null = null
  private readonly editorRef = React.createRef<CodeEditor>()

  public constructor(props: IFileEditorProps) {
    super(props)
    this.state = { file: null, error: null, text: '', saving: false }
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
      <div className="file-editor">
        {this.renderToolbar()}
        {error !== null ? (
          <div className="file-editor-message">{error}</div>
        ) : file === null ? null : (
          <CodeEditor
            ref={this.editorRef}
            initialTopLine={this.props.initialTopLine}
            repository={this.props.repository}
            path={this.props.path}
            text={file.initialText}
            extensions={this.props.extensions}
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
    const dirty = file !== null && text !== file.diskText
    return (
      <div className="file-editor-toolbar">
        {this.props.renderStatus?.(text, dirty, this.getView) ?? (
          <span className="file-editor-status">
            {dirty ? 'Unsaved changes' : 'Editing'}
          </span>
        )}
        <span className="file-editor-spacer" />
        {dirty ? (
          <>
            <Button onClick={this.onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button
              onClick={this.onSaveAndClose}
              disabled={saving}
              tooltip="Ctrl+S saves without closing"
            >
              Save
            </Button>
          </>
        ) : (
          <Button onClick={this.close}>Close</Button>
        )}
      </div>
    )
  }

  private onViewReady = (view: EditorView | null) => {
    this.view = view
  }

  private getView = () => this.view

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
      this.close()
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
      // Changes, diffs and conflict markers pick up the new content.
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
    this.close()
  }

  private close = () => {
    this.props.onClose(this.editorRef.current?.getTopLine() ?? null)
  }
}
