import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { RetryActionType } from '../../models/retry-actions'

/**
 * Restore (apply and drop) or Apply (keep) a stash. Errors carry a retry
 * action, so local changes in the way get the "stash them and continue" dialog.
 */
export async function restoreStash(
  dispatcher: Dispatcher,
  repository: Repository,
  stashEntry: IStashEntry,
  keep: boolean
) {
  try {
    await (keep
      ? dispatcher.applyStash(repository, stashEntry)
      : dispatcher.popStash(repository, stashEntry))
  } catch (err) {
    dispatcher.postError(
      new ErrorWithMetadata(err, {
        repository,
        retryAction: {
          type: keep ? RetryActionType.ApplyStash : RetryActionType.PopStash,
          stashEntry,
          repository,
        },
      })
    )
  }
}
