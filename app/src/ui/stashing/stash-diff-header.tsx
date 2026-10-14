import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { RetryActionType } from '../../models/retry-actions'
import { Button } from '../lib/button'
import { getStashTitle } from './stash-list'

interface IStashDiffHeaderProps {
  readonly stashEntry: IStashEntry
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly askForConfirmationOnDiscardStash: boolean
}

interface IStashDiffHeaderState {
  readonly isRestoring: boolean
  readonly isDiscarding: boolean
  readonly isApplying: boolean
}

/**
 * Component to provide the actions that can be performed
 * on a stash while viewing a stash diff
 */
export class StashDiffHeader extends React.Component<
  IStashDiffHeaderProps,
  IStashDiffHeaderState
> {
  public constructor(props: IStashDiffHeaderProps) {
    super(props)

    this.state = {
      isRestoring: false,
      isDiscarding: false,
      isApplying: false,
    }
  }

  public render() {
    const { isRestoring, isDiscarding, isApplying } = this.state
    const busy = isRestoring || isDiscarding || isApplying
    const { stashEntry } = this.props

    return (
      <div className="header">
        <h3>
          {getStashTitle(stashEntry)}
          {stashEntry.branchName && (
            <span className="stash-header-branch">
              {' '}
              on {stashEntry.branchName}
            </span>
          )}
        </h3>
        <div className="row">
          <OkCancelButtonGroup
            okButtonText="Restore"
            okButtonDisabled={busy}
            onOkButtonClick={this.onRestoreClick}
            cancelButtonText="Discard"
            cancelButtonDisabled={busy}
            onCancelButtonClick={this.onDiscardClick}
            okButtonAriaDescribedBy="restore-description"
          />
          <Button
            className="stash-apply-button"
            disabled={busy}
            onClick={this.onApplyClick}
          >
            Apply
          </Button>
          <div className="explanatory-text" id="restore-description">
            <span className="text">
              <strong>Restore</strong> moves the stashed files to the Changes
              list; <strong>Apply</strong> copies them and keeps the stash.
            </span>
          </div>
        </div>
      </div>
    )
  }

  private onDiscardClick = async () => {
    const {
      dispatcher,
      repository,
      stashEntry,
      askForConfirmationOnDiscardStash,
    } = this.props

    if (!askForConfirmationOnDiscardStash) {
      this.setState({
        isDiscarding: true,
      })

      try {
        await dispatcher.dropStash(repository, stashEntry)
      } finally {
        this.setState({
          isDiscarding: false,
        })
      }
    } else {
      dispatcher.showPopup({
        type: PopupType.ConfirmDiscardStash,
        stash: stashEntry,
        repository,
      })
    }
  }

  private onApplyClick = async () => {
    const { dispatcher, repository, stashEntry } = this.props
    this.setState({ isApplying: true })
    try {
      await dispatcher.applyStash(repository, stashEntry)
    } finally {
      this.setState({ isApplying: false })
    }
  }

  private onRestoreClick = async () => {
    const { dispatcher, repository, stashEntry } = this.props

    try {
      this.setState({ isRestoring: true })
      await dispatcher.popStash(repository, stashEntry)
    } catch (err) {
      const errorWithMetadata = new ErrorWithMetadata(err, {
        repository: repository,
        retryAction: {
          type: RetryActionType.PopStash,
          stashEntry,
          repository,
        },
      })
      dispatcher.postError(errorWithMetadata)
    } finally {
      this.setState({ isRestoring: false })
    }
  }
}
