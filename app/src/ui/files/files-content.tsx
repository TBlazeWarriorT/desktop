import * as React from 'react'
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
    const mode: FilesViewMode =
      markdown && this.state.markdownPreview ? 'preview' : 'file'

    return (
      <div className="files-content">
        <div className="files-content-header">
          <PathText path={path} />
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
