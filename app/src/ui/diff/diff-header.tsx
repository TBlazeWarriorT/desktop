import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'
import {
  ViewMode,
  getAvailableViewModes,
  getCurrentViewMode,
  getPrefsForViewMode,
} from './view-mode'
import { IViewMode, ViewModeSwitcher } from './view-mode-switcher'

import * as octicons from '../octicons/octicons.generated'

export const viewModeInfo: Record<ViewMode, Omit<IViewMode<ViewMode>, 'id'>> = {
  conflicts: {
    label: 'Conflicts',
    icon: octicons.alert,
    tooltip: 'The whole file with its conflicts highlighted',
  },
  diff: { label: 'Diff', icon: octicons.diff, tooltip: 'What changed' },
  file: {
    label: 'File',
    icon: octicons.file,
    tooltip: 'The whole file as it is in this version',
  },
  preview: {
    label: 'Preview',
    icon: octicons.eye,
    tooltip: 'The rendered file',
  },
}

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

  /** Whether the file is shown whole instead of as a diff. */
  readonly wholeFile?: boolean
  readonly onWholeFileChanged?: (wholeFile: boolean) => void
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

  private getViewModes(): ReadonlyArray<IViewMode<ViewMode>> {
    const { status, path } = this.props
    return getAvailableViewModes(path, status, {
      conflicts: this.props.onConflictViewChanged !== undefined,
      file: this.props.onWholeFileChanged !== undefined,
      preview: this.props.onMarkdownPreviewChanged !== undefined,
    }).map(id => ({ id, ...viewModeInfo[id] }))
  }

  private getViewMode(modes: ReadonlyArray<IViewMode<ViewMode>>): ViewMode {
    const { conflictView, markdownPreview, wholeFile } = this.props
    return getCurrentViewMode(
      modes.map(m => m.id),
      { conflictView, markdownPreview, wholeFile }
    )
  }

  private onViewModeChanged = (mode: ViewMode) => {
    const prefs = getPrefsForViewMode(
      mode,
      this.getViewModes().map(m => m.id)
    )
    if (prefs.conflictView !== undefined) {
      this.props.onConflictViewChanged?.(prefs.conflictView)
    }
    if (prefs.markdownPreview !== undefined) {
      this.props.onMarkdownPreviewChanged?.(prefs.markdownPreview)
    }
    if (prefs.wholeFile !== undefined) {
      this.props.onWholeFileChanged?.(prefs.wholeFile)
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
