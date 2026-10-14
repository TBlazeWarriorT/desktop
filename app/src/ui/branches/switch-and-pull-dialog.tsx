import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Row } from '../lib/row'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { getSymbolicRef } from '../../lib/git/refs'

interface ISwitchAndPullDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly message: string
  readonly onDismissed: () => void
}

/** Offered when a branch can't be pulled without checking it out. */
export class SwitchAndPullDialog extends React.Component<ISwitchAndPullDialogProps> {
  public render() {
    return (
      <Dialog
        id="switch-and-pull"
        type="warning"
        title={__DARWIN__ ? 'Switch and Pull?' : 'Switch and pull?'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        ariaDescribedBy="switch-and-pull-message"
        role="alertdialog"
      >
        <DialogContent>
          <Row id="switch-and-pull-message">{this.props.message}</Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Switch and Pull' : 'Switch and pull'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, branch, onDismissed } = this.props
    onDismissed()

    // With uncommitted changes the checkout may stop at the stash dialog
    // instead, and pulling then would pull the wrong branch.
    const repo = await dispatcher.checkoutBranch(repository, branch)
    if ((await getSymbolicRef(repo, 'HEAD')) === branch.ref) {
      await dispatcher.pull(repo)
    }
  }
}
