import * as React from 'react'
import { DiffHeader } from '../diff/diff-header'
import {
  DiffSelection,
  IDiff,
  ImageDiffType,
  ITextDiff,
} from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { PopupType } from '../../models/popup'
import { Emoji } from '../../lib/emoji'
import {
  MarkdownPreview,
  getMarkdownPreview,
  getPreviewSource,
  setMarkdownPreview,
} from '../diff/markdown-preview'
import {
  ConflictView,
  getConflictView,
  setConflictView,
} from '../diff/conflict-view'
import { FileView } from '../diff/file-view'
import { getAvailableViewModes, getCurrentViewMode } from '../diff/view-mode'

interface IChangesProps {
  readonly repository: Repository
  readonly emoji: Map<string, Emoji>
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff | null
  readonly dispatcher: Dispatcher
  readonly imageDiffType: ImageDiffType

  /** Whether a commit is in progress */
  readonly isCommitting: boolean
  readonly hideWhitespaceInDiff: boolean

  /**
   * Called when the user requests to open a binary file in an the
   * system-assigned application for said file type.
   */
  readonly onOpenBinaryFile: (fullPath: string) => void

  /** Called when the user requests to open a submodule. */
  readonly onOpenSubmodule: (fullPath: string) => void

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /**
   * Whether we should show a confirmation dialog when the user
   * discards changes
   */
  readonly askForConfirmationOnDiscardChanges: boolean

  /**
   * Whether we should display side by side diffs.
   */
  readonly showSideBySideDiff: boolean

  /** Whether or not to show the diff check marks indicating inclusion in a commit */
  readonly showDiffCheckMarks: boolean

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

interface IChangesState {
  readonly markdownPreview: boolean
  readonly conflictView: boolean
  readonly wholeFile: boolean
}

export class Changes extends React.Component<IChangesProps, IChangesState> {
  public constructor(props: IChangesProps) {
    super(props)
    this.state = {
      markdownPreview: getMarkdownPreview(),
      conflictView: getConflictView(),
      wholeFile: false,
    }
  }

  public componentDidUpdate(prevProps: IChangesProps) {
    // File is picked per file; another file opens in Diff (or Preview).
    if (prevProps.file.path !== this.props.file.path && this.state.wholeFile) {
      this.setState({ wholeFile: false })
    }
  }

  /**
   * Whether or not it's currently possible to change the line selection
   * of a diff. Changing selection is not possible while a commit is in
   * progress or if the user has opted to hide whitespace changes.
   */
  private get lineSelectionDisabled() {
    return this.props.isCommitting || this.props.hideWhitespaceInDiff
  }

  private onDiffLineIncludeChanged = (selection: DiffSelection) => {
    if (!this.lineSelectionDisabled) {
      const { repository, file } = this.props
      this.props.dispatcher.changeFileLineSelection(repository, file, selection)
    }
  }

  private onDiscardChanges = (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => {
    if (this.lineSelectionDisabled) {
      return
    }

    if (this.props.askForConfirmationOnDiscardChanges) {
      this.props.dispatcher.showPopup({
        type: PopupType.ConfirmDiscardSelection,
        repository: this.props.repository,
        file: this.props.file,
        diff,
        selection: diffSelection,
      })
    } else {
      this.props.dispatcher.discardChangesFromSelection(
        this.props.repository,
        this.props.file.path,
        diff,
        diffSelection
      )
    }
  }

  public render() {
    return (
      <div className="diff-container">
        <DiffHeader
          path={this.props.file.path}
          status={this.props.file.status}
          diff={this.props.diff}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
          hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
          onDiffOptionsOpened={this.props.onDiffOptionsOpened}
          markdownPreview={this.state.markdownPreview}
          onMarkdownPreviewChanged={this.onMarkdownPreviewChanged}
          conflictView={this.state.conflictView}
          onConflictViewChanged={this.onConflictViewChanged}
          wholeFile={this.state.wholeFile}
          onWholeFileChanged={this.onWholeFileChanged}
        />

        {this.renderContent()}
      </div>
    )
  }

  private renderContent() {
    const { file, repository, diff } = this.props
    const modes = getAvailableViewModes(file.path, file.status, {
      conflicts: true,
      file: true,
      preview: true,
    })
    switch (getCurrentViewMode(modes, this.state)) {
      case 'conflicts':
        return (
          <ConflictView
            repository={repository}
            file={file}
            diff={diff}
            dispatcher={this.props.dispatcher}
          />
        )
      case 'preview':
        return this.renderMarkdownPreview()
      case 'file':
        return (
          <FileView
            repository={repository}
            path={file.path}
            source={{ kind: 'disk' }}
            reloadKey={diff}
          />
        )
      case 'diff':
        return this.renderDiff()
    }
  }

  private onWholeFileChanged = (wholeFile: boolean) => {
    this.setState({ wholeFile })
  }

  private onConflictViewChanged = (conflictView: boolean) => {
    setConflictView(conflictView)
    this.setState({ conflictView })
  }

  private renderMarkdownPreview() {
    return (
      <MarkdownPreview
        repository={this.props.repository}
        path={this.props.file.path}
        source={getPreviewSource(this.props.file)}
        reloadKey={this.props.diff}
        emoji={this.props.emoji}
        onLinkClicked={this.onMarkdownLinkClicked}
      />
    )
  }

  private onMarkdownPreviewChanged = (markdownPreview: boolean) => {
    setMarkdownPreview(markdownPreview)
    this.setState({ markdownPreview })
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderDiff() {
    return (
      <SeamlessDiffSwitcher
        repository={this.props.repository}
        imageDiffType={this.props.imageDiffType}
        file={this.props.file}
        readOnly={false}
        onIncludeChanged={this.onDiffLineIncludeChanged}
        onDiscardChanges={this.onDiscardChanges}
        diff={this.props.diff}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        showDiffCheckMarks={this.props.showDiffCheckMarks}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        onOpenBinaryFile={this.props.onOpenBinaryFile}
        onOpenSubmodule={this.props.onOpenSubmodule}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
      />
    )
  }

  private onShowSideBySideDiffChanged = (showSideBySideDiff: boolean) => {
    this.props.dispatcher.onShowSideBySideDiffChanged(showSideBySideDiff)
  }

  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    return this.props.dispatcher.onHideWhitespaceInChangesDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository
    )
  }
}
