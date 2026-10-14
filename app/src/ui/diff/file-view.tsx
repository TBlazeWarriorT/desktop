import * as React from 'react'
import { Repository } from '../../models/repository'
import { ITokens } from '../../lib/highlighter/types'
import {
  IWholeFile,
  WholeFileLines,
  WholeFileSource,
  highlightWholeFile,
  loadWholeFile,
  sameLines,
} from './whole-file-lines'

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
  /** The shown lines got their tokens; a reload of the same text can stop. */
  private highlighted = false

  public constructor(props: IFileViewProps) {
    super(props)
    this.state = { file: null, tokens: {} }
  }

  public componentDidMount() {
    this.load(false)
  }

  public componentDidUpdate(prevProps: IFileViewProps) {
    const { path, source, reloadKey, repository } = this.props
    if (
      prevProps.path !== path ||
      prevProps.repository.id !== repository.id ||
      sourceKey(prevProps.source) !== sourceKey(source)
    ) {
      this.load(false)
    } else if (prevProps.reloadKey !== reloadKey) {
      this.load(true)
    }
  }

  /** `isReload`: same file, maybe changed (e.g. the app got focus again). */
  private async load(isReload: boolean) {
    const id = ++this.loadId
    const { repository, path, source } = this.props
    const file = await loadWholeFile(repository, path, source)
    const previous = this.state.file
    if (
      id !== this.loadId ||
      (isReload &&
        this.highlighted &&
        previous !== null &&
        sameLines(previous.lines, file.lines))
    ) {
      return
    }
    // A changed file keeps its old colors until the new ones arrive, no flash.
    this.setState({ file, tokens: isReload ? this.state.tokens : {} })
    this.highlighted = false

    if (file.lines.length > 0) {
      const tokens = await highlightWholeFile(repository, path, file.lines)
      if (id === this.loadId) {
        this.setState({ tokens })
        this.highlighted = true
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
            <WholeFileLines
              // A new file starts at the top, not at the last one's scroll.
              key={`${this.props.path}|${sourceKey(this.props.source)}`}
              lines={file.lines}
              tokens={tokens}
            />
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
