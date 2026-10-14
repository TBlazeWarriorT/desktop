import * as React from 'react'
import { Repository } from '../../models/repository'
import { FileView } from '../diff/file-view'
import { PathText } from '../lib/path-text'

interface IFilesContentProps {
  readonly repository: Repository
  readonly commitish: string | null
  readonly path: string | null
  /** Reloads a working-directory file when this changes. */
  readonly reloadKey: unknown
}

/** The Files tab's main pane: the selected file, whole. */
export class FilesContent extends React.Component<IFilesContentProps> {
  public render() {
    const { repository, commitish, path, reloadKey } = this.props
    if (path === null) {
      return (
        <div className="files-content panel blankslate">
          Pick a file on the left, or type to find one.
        </div>
      )
    }
    return (
      <div className="files-content">
        <div className="files-content-header">
          <PathText path={path} />
        </div>
        <FileView
          repository={repository}
          path={path}
          source={
            commitish === null
              ? { kind: 'disk' }
              : { kind: 'commit', commitish }
          }
          reloadKey={commitish === null ? reloadKey : undefined}
        />
      </div>
    )
  }
}
