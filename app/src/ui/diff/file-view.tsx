import * as React from 'react'
import { Repository } from '../../models/repository'
import { ITokens } from '../../lib/highlighter/types'
import {
  IWholeFile,
  WholeFileLines,
  WholeFileSource,
  highlightWholeFile,
  loadWholeFile,
} from './whole-file-lines'
import { getBoolean, setBoolean } from '../../lib/local-storage'

const WholeFileKey = 'whole-file-view'

/** The last File/Diff choice, shared by every diff. */
export const getWholeFileView = () => getBoolean(WholeFileKey, false)
export const setWholeFileView = (value: boolean) =>
  setBoolean(WholeFileKey, value)

interface IFileViewProps {
  readonly repository: Repository
  readonly path: string
  readonly source: WholeFileSource
  /** Reloads when this changes, e.g. the diff the app reloaded. */
  readonly reloadKey?: unknown
}

interface IFileViewState {
  readonly file: IWholeFile | null
  readonly tokens: ITokens
}

/** A file in full, read-only, with syntax highlighting and line numbers. */
export class FileView extends React.Component<IFileViewProps, IFileViewState> {
  private loadId = 0

  public constructor(props: IFileViewProps) {
    super(props)
    this.state = { file: null, tokens: {} }
  }

  public componentDidMount() {
    this.load()
  }

  public componentDidUpdate(prevProps: IFileViewProps) {
    const { path, source, reloadKey, repository } = this.props
    if (
      prevProps.path !== path ||
      prevProps.repository.id !== repository.id ||
      prevProps.reloadKey !== reloadKey ||
      sourceKey(prevProps.source) !== sourceKey(source)
    ) {
      this.load()
    }
  }

  private async load() {
    const id = ++this.loadId
    const { repository, path, source } = this.props
    const file = await loadWholeFile(repository, path, source)
    if (id !== this.loadId) {
      return
    }
    this.setState({ file, tokens: {} })

    if (file.lines.length > 0) {
      const tokens = await highlightWholeFile(repository, path, file.lines)
      if (id === this.loadId) {
        this.setState({ tokens })
      }
    }
  }

  public render() {
    const { file, tokens } = this.state
    return (
      <div className="file-view">
        {file === null ? null : file.missing ? (
          this.renderMessage(
            this.props.source.kind === 'disk'
              ? 'This file is not on disk.'
              : 'This file does not exist in this commit.'
          )
        ) : file.binary ? (
          this.renderMessage('Binary file, not shown.')
        ) : (
          <>
            {file.truncated &&
              this.renderMessage('Only the first 1 MB is shown.', true)}
            <WholeFileLines lines={file.lines} tokens={tokens} />
          </>
        )}
      </div>
    )
  }

  private renderMessage(text: string, banner = false) {
    return (
      <div className={banner ? 'file-view-banner' : 'file-view-message'}>
        {text}
      </div>
    )
  }
}

const sourceKey = (source: WholeFileSource) =>
  source.kind === 'disk' ? 'disk' : `commit:${source.commitish}`
