import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'
import { isMarkdownFile } from '../../lib/markdown-files'
import { getConflictMarkerCount } from '../../lib/conflict-markers'
import { IViewMode, ViewModeSwitcher } from './view-mode-switcher'

type ViewMode = 'conflicts' | 'diff' | 'preview'
import * as octicons from '../octicons/octicons.generated'

interface IDiffHeaderProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Whether we should hide whitespace in diffs. */
  readonly hideWhitespaceInDiff: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void

  /** Whether a markdown file is shown rendered instead of as a diff. */
  readonly markdownPreview?: boolean
  readonly onMarkdownPreviewChanged?: (preview: boolean) => void

  /** Whether a file with conflict markers is shown in the conflict view. */
  readonly conflictView?: boolean
  readonly onConflictViewChanged?: (conflictView: boolean) => void
}

/** Displays information about a file */
export class DiffHeader extends React.Component<IDiffHeaderProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />

        {this.renderViewModes()}
        {this.renderDiffOptions()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  /** Conflicts / Diff / Preview, whichever apply to this file. */
  private renderViewModes() {
    const modes = this.getViewModes()
    if (modes.length < 2) {
      return null
    }
    return (
      <ViewModeSwitcher
        modes={modes}
        selected={this.getViewMode(modes)}
        onChange={this.onViewModeChanged}
      />
    )
  }

  private getViewModes() {
    const { status, path } = this.props
    const modes = new Array<IViewMode<ViewMode>>()
    if (
      this.props.onConflictViewChanged !== undefined &&
      getConflictMarkerCount(status) > 0
    ) {
      modes.push({
        id: 'conflicts',
        label: 'Conflicts',
        icon: octicons.alert,
        tooltip: 'The whole file with its conflicts highlighted',
      })
    }
    modes.push({
      id: 'diff',
      label: 'Diff',
      icon: octicons.diff,
      tooltip: 'What changed',
    })
    if (
      this.props.onMarkdownPreviewChanged !== undefined &&
      isMarkdownFile(path)
    ) {
      modes.push({
        id: 'preview',
        label: 'Preview',
        icon: octicons.eye,
        tooltip: 'The rendered file',
      })
    }
    return modes
  }

  /** Same precedence as the content: conflicts, then preview, then diff. */
  private getViewMode(modes: ReadonlyArray<IViewMode<ViewMode>>): ViewMode {
    const has = (id: ViewMode) => modes.some(m => m.id === id)
    if (has('conflicts') && this.props.conflictView) {
      return 'conflicts'
    }
    if (has('preview') && this.props.markdownPreview) {
      return 'preview'
    }
    return 'diff'
  }

  private onViewModeChanged = (mode: ViewMode) => {
    const modes = this.getViewModes()
    if (modes.some(m => m.id === 'conflicts')) {
      this.props.onConflictViewChanged?.(mode === 'conflicts')
    }
    if (mode !== 'conflicts' && modes.some(m => m.id === 'preview')) {
      this.props.onMarkdownPreviewChanged?.(mode === 'preview')
    }
  }

  private renderDiffOptions() {
    if (this.props.diff?.kind === DiffType.Submodule) {
      return null
    }

    return (
      <DiffOptions
        isInteractiveDiff={true}
        onHideWhitespaceChangesChanged={
          this.props.onHideWhitespaceInDiffChanged
        }
        hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
        onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onDiffOptionsOpened={this.props.onDiffOptionsOpened}
      />
    )
  }
}
