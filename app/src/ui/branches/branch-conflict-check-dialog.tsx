import * as React from 'react'
import { Dialog, DialogContent, DefaultDialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { PathText } from '../lib/path-text'

interface IBranchConflictCheckDialogProps {
  readonly branchName: string
  readonly currentBranchName: string
  /** Files that would conflict; empty when the merge is clean. */
  readonly files: ReadonlyArray<string>
  readonly onDismissed: () => void
}

/** Result of Right Click > Check conflicts with the current branch. */
export class BranchConflictCheckDialog extends React.Component<IBranchConflictCheckDialogProps> {
  public render() {
    const { branchName, currentBranchName, files } = this.props
    const clean = files.length === 0
    return (
      <Dialog
        id="branch-conflict-check"
        title={clean ? 'No conflicts' : 'Conflicts'}
        type={clean ? 'normal' : 'warning'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            Merging <Ref>{branchName}</Ref> into <Ref>{currentBranchName}</Ref>{' '}
            {clean
              ? 'has no conflicts.'
              : `would conflict in ${files.length} ${
                  files.length === 1 ? 'file' : 'files'
                }:`}
          </p>
          {!clean && (
            <ul className="branch-conflict-check-files">
              {files.map(f => (
                <li key={f}>
                  <PathText path={f} />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
        <DefaultDialogFooter />
      </Dialog>
    )
  }
}
