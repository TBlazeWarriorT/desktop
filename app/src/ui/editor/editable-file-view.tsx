import * as React from 'react'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { FileView } from '../diff/file-view'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { FileEditor, hasDraft } from './file-editor'

interface IEditableFileViewProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly path: string
  /** Reloads the read-only view when this changes. */
  readonly reloadKey?: unknown
}

interface IEditableFileViewState {
  readonly editing: boolean
  /** The line on top, carried between the viewer and the editor. */
  readonly topLine: number
}

/**
 * A working-directory file, read-only with an Edit button. Key it by path:
 * a file with unsaved edits opens straight in the editor.
 */
export class EditableFileView extends React.Component<
  IEditableFileViewProps,
  IEditableFileViewState
> {
  private readonly fileViewRef = React.createRef<FileView>()

  public constructor(props: IEditableFileViewProps) {
    super(props)
    this.state = {
      editing: hasDraft(props.repository, props.path),
      topLine: 0,
    }
  }

  public render() {
    const { repository, dispatcher, path, reloadKey } = this.props
    if (this.state.editing) {
      return (
        <FileEditor
          repository={repository}
          dispatcher={dispatcher}
          path={path}
          initialTopLine={this.state.topLine}
          onClose={this.onClose}
        />
      )
    }
    return (
      <div className="file-editor">
        <div className="file-editor-toolbar">
          <span className="file-editor-spacer" />
          <Button onClick={this.onEdit} tooltip="Edit this file">
            <Octicon symbol={octicons.pencil} />
            Edit
          </Button>
        </div>
        <FileView
          ref={this.fileViewRef}
          initialTopRow={this.state.topLine}
          repository={repository}
          path={path}
          source={{ kind: 'disk' }}
          reloadKey={reloadKey}
        />
      </div>
    )
  }

  private onEdit = () => {
    const topLine = this.fileViewRef.current?.getTopRow() ?? 0
    this.setState({ editing: true, topLine })
  }

  private onClose = (topLine: number | null) => {
    this.setState({ editing: false, topLine: topLine ?? this.state.topLine })
  }
}
