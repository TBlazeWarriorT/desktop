import { CommittedFileChange } from './status'

export interface IStashEntry {
  /** The fully qualified name of the entry i.e., `refs/stash@{0}` */
  readonly name: string

  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string

  /** The list of files this stash touches */
  readonly files: StashedFileChanges

  readonly tree: string
  readonly parents: ReadonlyArray<string>

  /** The name given when stashing, or git's message for other stashes. */
  readonly title?: string
  /** Author date of the stash commit. */
  readonly createdAt?: Date
  /** False for stashes made outside Desktop (`git stash`). */
  readonly isDesktopEntry?: boolean
}

/** Whether file changes for a stash entry are loaded or not */
export enum StashedChangesLoadStates {
  NotLoaded = 'NotLoaded',
  Loading = 'Loading',
  Loaded = 'Loaded',
}

/**
 * The status of stashed file changes
 *
 * When the status us `Loaded` all the files associated
 * with the stash are made available.
 */
export type StashedFileChanges =
  | {
      readonly kind:
        | StashedChangesLoadStates.NotLoaded
        | StashedChangesLoadStates.Loading
    }
  | {
      readonly kind: StashedChangesLoadStates.Loaded
      readonly files: ReadonlyArray<CommittedFileChange>
    }

export type StashCallback = (stashEntry: IStashEntry) => Promise<void>
