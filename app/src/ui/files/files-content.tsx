import * as React from 'react'
import { SyntaxSelect } from '../diff/syntax-select'
import { Repository } from '../../models/repository'
import { Emoji } from '../../lib/emoji'
import { FileView } from '../diff/file-view'
import {
  MarkdownPreview,
  getMarkdownPreview,
  isMarkdownFile,
  setMarkdownPreview,
} from '../diff/markdown-preview'
import { WholeFileSource } from '../diff/whole-file-lines'
import { viewModeInfo } from '../diff/diff-header'
import { ViewModeSwitcher } from '../diff/view-mode-switcher'
import { PathText } from '../lib/path-text'
import { Dispatcher } from '../dispatcher'
import { EditableFileView } from '../editor/editable-file-view'
import { hasDraft } from '../editor/file-editor'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  canStepFilesLocation,
  recordFilesLocation,
  stepFilesLocation,
} from '../../lib/files-navigation'

type FilesViewMode = 'file' | 'preview'
const filesViewModes = (['file', 'preview'] as const).map(id => ({
  id,
  ...viewModeInfo[id],
}))

interface IFilesContentProps {
  readonly repository: Repository
  readonly commitish: string | null
  readonly path: string | null
  /** Reloads a working-directory file when this changes. */
  readonly reloadKey: unknown
  readonly emoji: Map<string, Emoji>
  readonly dispatcher: Dispatcher
  readonly onLinkClicked: (url: string) => void
}

interface IFilesContentState {
  /** Shared with the diffs' Preview/Diff choice. */
  readonly markdownPreview: boolean
}

/** The Files tab's main pane: the selected file, whole. */
export class FilesContent extends React.Component<
  IFilesContentProps,
  IFilesContentState
> {
  public constructor(props: IFilesContentProps) {
    super(props)
    this.state = { markdownPreview: getMarkdownPreview() }
  }

  public componentDidMount() {
    this.record()
    // Mouse back/forward buttons and Alt+Left/Right, like a browser.
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('keydown', this.onKeyDown)
  }

  public componentDidUpdate(prevProps: IFilesContentProps) {
    if (
      prevProps.commitish !== this.props.commitish ||
      prevProps.path !== this.props.path ||
      prevProps.repository.hash !== this.props.repository.hash
    ) {
      this.record()
    }
  }

  public componentWillUnmount() {
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private record() {
    const { repository, commitish, path } = this.props
    recordFilesLocation(repository.hash, { commitish, path })
    // Back/Forward were drawn before this entry existed.
    this.forceUpdate()
  }

  private step(step: -1 | 1) {
    const { repository, dispatcher } = this.props
    const target = stepFilesLocation(repository.hash, step)
    if (target !== null) {
      dispatcher.browseFiles(repository, target.commitish, target.path)
    }
  }

  private onBack = () => this.step(-1)
  private onForward = () => this.step(1)

  private onMouseUp = (event: MouseEvent) => {
    if (event.button === 3 || event.button === 4) {
      event.preventDefault()
      this.step(event.button === 3 ? -1 : 1)
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const arrow =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null
    // Alt+arrows inside a text field or the editor are theirs.
    const target = event.target as HTMLElement | null
    const typing =
      target !== null &&
      (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))
    if (
      arrow !== null &&
      event.altKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !typing
    ) {
      event.preventDefault()
      this.step(arrow)
    }
  }

  private renderNavigation() {
    const key = this.props.repository.hash
    return (
      <div className="files-navigation">
        <Button
          size="small"
          onClick={this.onBack}
          disabled={!canStepFilesLocation(key, -1)}
          tooltip="Back (Alt+Left, mouse back button)"
          ariaLabel="Back"
        >
          <Octicon symbol={octicons.arrowLeft} />
        </Button>
        <Button
          size="small"
          onClick={this.onForward}
          disabled={!canStepFilesLocation(key, 1)}
          tooltip="Forward (Alt+Right, mouse forward button)"
          ariaLabel="Forward"
        >
          <Octicon symbol={octicons.arrowRight} />
        </Button>
      </div>
    )
  }

  public render() {
    const { repository, commitish, path, reloadKey } = this.props
    if (path === null) {
      return (
        <div className="files-content panel blankslate">
          Pick a file on the left, or type to find one.
        </div>
      )
    }
    const source: WholeFileSource =
      commitish === null ? { kind: 'disk' } : { kind: 'commit', commitish }
    const fileReloadKey = commitish === null ? reloadKey : undefined
    const markdown = isMarkdownFile(path)
    // Unsaved edits show up even where Preview would be picked.
    const editing = commitish === null && hasDraft(repository, path)
    const mode: FilesViewMode =
      markdown && this.state.markdownPreview && !editing ? 'preview' : 'file'

    return (
      <div className="files-content">
        <div className="files-content-header">
          {this.renderNavigation()}
          <PathText path={path} />
          <SyntaxSelect repositoryPath={repository.path} path={path} />
          {markdown && (
            <ViewModeSwitcher
              modes={filesViewModes}
              selected={mode}
              onChange={this.onViewModeChanged}
            />
          )}
        </div>
        {mode === 'preview' ? (
          <MarkdownPreview
            repository={repository}
            path={path}
            source={source}
            reloadKey={fileReloadKey}
            emoji={this.props.emoji}
            onLinkClicked={this.props.onLinkClicked}
          />
        ) : commitish === null ? (
          <EditableFileView
            key={path}
            repository={repository}
            dispatcher={this.props.dispatcher}
            path={path}
            reloadKey={fileReloadKey}
          />
        ) : (
          <FileView
            repository={repository}
            path={path}
            source={source}
            reloadKey={fileReloadKey}
          />
        )}
      </div>
    )
  }

  private onViewModeChanged = (mode: FilesViewMode) => {
    const markdownPreview = mode === 'preview'
    setMarkdownPreview(markdownPreview)
    this.setState({ markdownPreview })
  }
}
