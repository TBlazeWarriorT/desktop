import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IStashNameDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** Set to rename this stash; otherwise a new one is created. */
  readonly stash?: IStashEntry
  /** Stash only these files instead of every change. */
  readonly files?: ReadonlyArray<WorkingDirectoryFileChange>
  readonly onDismissed: () => void
}

interface IStashNameDialogState {
  readonly title: string
  readonly isSaving: boolean
}

/** Asks for a stash name, both when stashing and when renaming. */
export class StashNameDialog extends React.Component<
  IStashNameDialogProps,
  IStashNameDialogState
> {
  public constructor(props: IStashNameDialogProps) {
    super(props)
    this.state = { title: props.stash?.title ?? '', isSaving: false }
  }

  public render() {
    const { stash, files } = this.props
    const renaming = stash !== undefined
    const title = renaming
      ? __DARWIN__
        ? 'Rename Stash'
        : 'Rename stash'
      : files !== undefined
      ? `Stash ${files.length} ${files.length === 1 ? 'file' : 'files'}`
      : __DARWIN__
      ? 'Stash All Changes'
      : 'Stash all changes'

    return (
      <Dialog
        id="stash-name"
        title={title}
        loading={this.state.isSaving}
        disabled={this.state.isSaving}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <TextBox
            label="Name"
            placeholder={renaming ? undefined : 'Optional'}
            value={this.state.title}
            autoFocus={true}
            onValueChanged={this.onTitleChanged}
          />
          {files !== undefined && (
            <Row className="stash-name-files">
              {files.map(f => f.path).join(', ')}
            </Row>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={renaming ? 'Rename' : 'Stash'}
            okButtonDisabled={renaming && this.state.title.trim() === ''}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onTitleChanged = (title: string) => {
    this.setState({ title })
  }

  private onSubmit = async () => {
    const { dispatcher, repository, stash, files, onDismissed } = this.props
    this.setState({ isSaving: true })
    try {
      if (stash !== undefined) {
        await dispatcher.renameStash(repository, stash, this.state.title)
      } else {
        await dispatcher.createStash(repository, this.state.title, files)
      }
    } finally {
      this.setState({ isSaving: false })
    }
    onDismissed()
  }
}
