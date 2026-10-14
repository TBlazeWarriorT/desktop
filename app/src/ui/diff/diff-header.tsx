import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'
import { Button } from '../lib/button'
import { isMarkdownFile } from '../../lib/markdown-files'
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
}

/** Displays information about a file */
export class DiffHeader extends React.Component<IDiffHeaderProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />

        {this.renderMarkdownToggle()}
        {this.renderDiffOptions()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderMarkdownToggle() {
    const { markdownPreview, onMarkdownPreviewChanged } = this.props
    if (
      onMarkdownPreviewChanged === undefined ||
      !isMarkdownFile(this.props.path)
    ) {
      return null
    }

    return (
      <Button
        className="markdown-preview-toggle"
        size="small"
        ariaPressed={markdownPreview === true}
        onClick={this.onMarkdownToggleClick}
        tooltip={markdownPreview ? 'Show the diff' : 'Show the rendered file'}
      >
        <Octicon symbol={markdownPreview ? octicons.code : octicons.eye} />
        {markdownPreview ? 'Diff' : 'Preview'}
      </Button>
    )
  }

  private onMarkdownToggleClick = () => {
    this.props.onMarkdownPreviewChanged?.(this.props.markdownPreview !== true)
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
