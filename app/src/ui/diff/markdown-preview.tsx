import * as React from 'react'
import * as Path from 'path'
import { readFile } from 'fs/promises'
import { Repository } from '../../models/repository'
import {
  AppFileStatusKind,
  CommittedFileChange,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { Emoji } from '../../lib/emoji'
import { getPartialBlobContents } from '../../lib/git/show'
import { WholeFileSource, loadWholeFile } from './whole-file-lines'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import {
  markdownImagePatterns as imagePatterns,
  resolveImagePath,
} from '../../lib/markdown-files'

export { isMarkdownFile } from '../../lib/markdown-files'

const PreviewKey = 'markdown-preview'
const MaxImageBytes = 5 * 1024 * 1024

/** The last Preview/Code choice, shared by every diff. */
export const getMarkdownPreview = () => getBoolean(PreviewKey, false)
export const setMarkdownPreview = (value: boolean) =>
  setBoolean(PreviewKey, value)

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

const imageMimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

/** The version a changed file is previewed in: the new one, or the old if deleted. */
export function getPreviewSource(file: ChangedFile): WholeFileSource {
  const deleted = file.status.kind === AppFileStatusKind.Deleted
  if (file instanceof WorkingDirectoryFileChange) {
    return deleted ? { kind: 'commit', commitish: 'HEAD' } : { kind: 'disk' }
  }
  return {
    kind: 'commit',
    commitish: deleted ? file.parentCommitish : file.commitish,
  }
}

/** Reads a repository file as it is in the working tree or in a commit. */
async function readRepoFile(
  repository: Repository,
  source: WholeFileSource,
  path: string
): Promise<Buffer | null> {
  if (source.kind === 'disk') {
    return readFile(Path.join(repository.path, path)).catch(() => null)
  }
  return getPartialBlobContents(
    repository,
    source.commitish,
    path,
    MaxImageBytes
  ).catch(() => null)
}

/**
 * Inlines relative images as data URIs. File URLs don't load from the sandboxed
 * iframe (nor from the dev server origin), and this also picks the image
 * version from the file's own commit.
 */
async function inlineImages(
  markdown: string,
  repository: Repository,
  path: string,
  source: WholeFileSource
): Promise<string> {
  const dataUris = new Map<string, string>()

  for (const re of imagePatterns) {
    for (const [, , src] of markdown.matchAll(re)) {
      const target = dataUris.has(src) ? null : resolveImagePath(src, path)
      const mime = target && imageMimeTypes[Path.extname(target).toLowerCase()]
      const data = mime ? await readRepoFile(repository, source, target!) : null
      if (data && data.length <= MaxImageBytes) {
        dataUris.set(src, `data:${mime};base64,${data.toString('base64')}`)
      }
    }
  }

  return imagePatterns.reduce(
    (text, re) =>
      text.replace(re, (all, before: string, src: string) => {
        const uri = dataUris.get(src)
        return uri === undefined ? all : before + uri
      }),
    markdown
  )
}

interface IMarkdownPreviewProps {
  readonly repository: Repository
  readonly path: string
  readonly source: WholeFileSource
  /** Reloads when this changes, e.g. the diff the app reloaded. */
  readonly reloadKey?: unknown
  readonly emoji: Map<string, Emoji>
  readonly onLinkClicked: (url: string) => void
}

interface IMarkdownPreviewState {
  readonly markdown: string | null
}

/** A markdown file rendered, from the working directory or a commit. */
export class MarkdownPreview extends React.Component<
  IMarkdownPreviewProps,
  IMarkdownPreviewState
> {
  private loadId = 0

  public constructor(props: IMarkdownPreviewProps) {
    super(props)
    this.state = { markdown: null }
  }

  public componentDidMount() {
    this.load()
  }

  public componentDidUpdate(prevProps: IMarkdownPreviewProps) {
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
    const markdown = await inlineImages(
      file.lines.join('\n'),
      repository,
      path,
      source
    )

    if (id === this.loadId) {
      this.setState({ markdown })
    }
  }

  public render() {
    if (this.state.markdown === null) {
      return <div className="markdown-preview" />
    }

    return (
      <div className="markdown-preview">
        <SandboxedMarkdown
          markdown={this.state.markdown}
          emoji={this.props.emoji}
          repository={this.props.repository.gitHubRepository ?? undefined}
          onMarkdownLinkClicked={this.props.onLinkClicked}
          underlineLinks={true}
          title={`Preview of ${this.props.path}`}
        />
      </div>
    )
  }
}

const sourceKey = (source: WholeFileSource) =>
  source.kind === 'disk' ? 'disk' : `commit:${source.commitish}`
