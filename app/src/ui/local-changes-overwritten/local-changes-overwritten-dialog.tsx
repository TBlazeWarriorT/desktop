import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import { Dispatcher } from '../dispatcher'
import { PathText } from '../lib/path-text'
import { assertNever } from '../../lib/fatal-error'
import { PopupType } from '../../models/popup'
import { getStashTitle } from '../stashing/stash-list'
import { Button } from '../lib/button'

interface ILocalChangesOverwrittenDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /**
   * Whether there's already a stash entry for the local branch.
   */
  readonly hasExistingStash: boolean
  /**
   * The action that should get executed if the user selects "Stash and Continue".
   */
  readonly retryAction: RetryAction
  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onDismissed: () => void

  /**
   * The files that prevented the operation from completing, i.e. the files
   * that would be overwritten.
   */
  readonly files: ReadonlyArray<string>
}
interface ILocalChangesOverwrittenDialogState {
  readonly stashing: boolean
}

export class LocalChangesOverwrittenDialog extends React.Component<
  ILocalChangesOverwrittenDialogProps,
  ILocalChangesOverwrittenDialogState
> {
  public constructor(props: ILocalChangesOverwrittenDialogProps) {
    super(props)
    this.state = { stashing: false }
  }

  public render() {
    const overwrittenText =
      this.props.files.length > 0
        ? ' The following files would be overwritten:'
        : null

    return (
      <Dialog
        title="Error"
        id="local-changes-overwritten"
        loading={this.state.stashing}
        disabled={this.state.stashing}
        onDismissed={this.onDismissPopup}
        onSubmit={this.onSubmit}
        type="error"
        role="alertdialog"
        ariaDescribedBy="local-changes-error-description"
      >
        <DialogContent>
          <div id="local-changes-error-description">
            <p>
              Unable to {this.getRetryActionName()} when changes are present on
              your branch.{overwrittenText}
            </p>
            {this.renderFiles()}
            {this.renderStashText()}
          </div>
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFiles() {
    const { files } = this.props
    if (files.length === 0) {
      return null
    }

    return (
      <div className="files-list">
        <ul>
          {files.map(fileName => (
            <li key={fileName}>
              <PathText path={fileName} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  private get canStashChanges() {
    // Stashes don't overwrite each other in this fork, so restoring one can
    // stash the current changes too.
    return !this.props.hasExistingStash && !this.state.stashing
  }

  private renderStashText() {
    if (!this.canStashChanges) {
      return null
    }

    if (this.stashToMerge !== null) {
      return (
        <p>
          Stash your changes to restore them later, or merge them with the stash
          and resolve the conflicts in the files.
        </p>
      )
    }

    return <p>You can stash your changes now and recover them afterwards.</p>
  }

  /** The stash being applied, which can be merged with the changes instead. */
  private get stashToMerge() {
    const { retryAction } = this.props
    return retryAction.type === RetryActionType.PopStash ||
      retryAction.type === RetryActionType.ApplyStash
      ? retryAction.stashEntry
      : null
  }

  private onMergeClick = async () => {
    const { repository, dispatcher, retryAction } = this.props
    const stash = this.stashToMerge
    if (stash === null) {
      return
    }
    this.setState({ stashing: true })
    this.props.onDismissed()
    await dispatcher.mergeStash(
      repository,
      stash,
      retryAction.type === RetryActionType.ApplyStash
    )
  }

  private renderFooter() {
    if (!this.canStashChanges) {
      return <DefaultDialogFooter />
    }

    return (
      <DialogFooter>
        {this.stashToMerge !== null && (
          <Button className="merge-stash-button" onClick={this.onMergeClick}>
            {__DARWIN__ ? 'Merge with My Changes' : 'Merge with my changes'}
          </Button>
        )}
        <OkCancelButtonGroup
          okButtonText={
            __DARWIN__
              ? 'Stash Changes and Continue'
              : 'Stash changes and continue'
          }
          okButtonTitle="This will create a stash with your current changes. You can recover them by restoring the stash afterwards."
          cancelButtonText="Close"
        />
      </DialogFooter>
    )
  }

  private onSubmit = async () => {
    const { repository, dispatcher, retryAction } = this.props

    if (!this.canStashChanges) {
      // Only a "Close" button is shown then, and it submits the dialog.
      this.props.onDismissed()
      return
    }

    this.setState({ stashing: true })

    const createdStash = await dispatcher.createStash(
      repository,
      this.getStashTitle()
    )

    this.props.onDismissed()

    if (createdStash) {
      await dispatcher.performRetry(retryAction)
    }
  }

  /**
   * on Dismiss, abort rebase if the retryAction is rebase, then call the onDismissed callback
   */
  private onDismissPopup = async () => {
    const { dispatcher, retryAction, onDismissed } = this.props
    // default dismiss handler , closes the popup via onPopupDismissedFn
    onDismissed()

    // Rebase flow is interrupted, user aborting due to unstashed changes, close outer multi commit operation popup
    if (retryAction.type === RetryActionType.Rebase) {
      dispatcher.closePopup(PopupType.MultiCommitOperation)
    }
  }

  /** Names the stash made to get the current changes out of the way. */
  private getStashTitle() {
    const { retryAction } = this.props
    if (
      retryAction.type === RetryActionType.PopStash ||
      retryAction.type === RetryActionType.ApplyStash
    ) {
      const verb =
        retryAction.type === RetryActionType.PopStash ? 'restoring' : 'applying'
      return `Before ${verb} "${getStashTitle(retryAction.stashEntry)}"`
    }
    return ''
  }

  /**
   * Returns a user-friendly string to describe the current retryAction.
   */
  private getRetryActionName() {
    switch (this.props.retryAction.type) {
      case RetryActionType.Checkout:
        return 'checkout'
      case RetryActionType.Pull:
        return 'pull'
      case RetryActionType.Merge:
        return 'merge'
      case RetryActionType.Rebase:
        return 'rebase'
      case RetryActionType.Clone:
        return 'clone'
      case RetryActionType.Fetch:
        return 'fetch'
      case RetryActionType.Push:
        return 'push'
      case RetryActionType.CherryPick:
      case RetryActionType.CreateBranchForCherryPick:
        return 'cherry-pick'
      case RetryActionType.Squash:
        return 'squash'
      case RetryActionType.Reorder:
        return 'reorder'
      case RetryActionType.DiscardChanges:
        return 'discard changes'
      case RetryActionType.PopStash:
        return 'restore stashed changes'
      case RetryActionType.ApplyStash:
        return 'apply stashed changes'
      default:
        assertNever(
          this.props.retryAction,
          `Unknown retryAction: ${this.props.retryAction}`
        )
    }
  }
}
