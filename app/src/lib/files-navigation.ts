/** Where the Files tab is: a commit (null: working directory) and a file. */
export interface IFilesLocation {
  readonly commitish: string | null
  readonly path: string | null
}

interface IHistory {
  entries: IFilesLocation[]
  index: number
}

const MaxEntries = 100
const histories = new Map<string, IHistory>()

const same = (a: IFilesLocation, b: IFilesLocation) =>
  a.commitish === b.commitish && a.path === b.path

function historyOf(repositoryKey: string) {
  let history = histories.get(repositoryKey)
  if (history === undefined) {
    history = { entries: [], index: -1 }
    histories.set(repositoryKey, history)
  }
  return history
}

/**
 * Notes where the Files tab went. Going back or forward lands on the current
 * entry, so it isn't recorded again; anything else drops the forward entries.
 */
export function recordFilesLocation(
  repositoryKey: string,
  location: IFilesLocation
) {
  const history = historyOf(repositoryKey)
  const current = history.entries[history.index]
  if (current !== undefined && same(current, location)) {
    return
  }
  history.entries = history.entries.slice(0, history.index + 1)
  history.entries.push(location)
  if (history.entries.length > MaxEntries) {
    history.entries.shift()
  }
  history.index = history.entries.length - 1
}

/** The entry one step back (-1) or forward (1), made current; or null. */
export function stepFilesLocation(
  repositoryKey: string,
  step: -1 | 1
): IFilesLocation | null {
  const history = historyOf(repositoryKey)
  const target = history.entries[history.index + step]
  if (target === undefined) {
    return null
  }
  history.index += step
  return target
}

export function canStepFilesLocation(repositoryKey: string, step: -1 | 1) {
  const history = historyOf(repositoryKey)
  return history.entries[history.index + step] !== undefined
}
