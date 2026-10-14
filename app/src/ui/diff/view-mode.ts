import { AppFileStatus, AppFileStatusKind } from '../../models/status'
import { getConflictMarkerCount } from '../../lib/conflict-markers'
import { isMarkdownFile } from '../../lib/markdown-files'

/** The ways a changed file can be shown, in switcher order. */
export type ViewMode = 'conflicts' | 'diff' | 'preview' | 'file'

/** Which modes a screen offers at all (History has no conflict view). */
export interface IViewModeFeatures {
  readonly conflicts: boolean
  readonly file: boolean
  readonly preview: boolean
}

/**
 * The choices behind the shown mode. Conflicts and Preview are remembered
 * across files; File only lasts for the file it was picked on.
 */
export interface IViewModePrefs {
  readonly conflictView?: boolean
  readonly markdownPreview?: boolean
  readonly wholeFile?: boolean
}

export function getAvailableViewModes(
  path: string,
  status: AppFileStatus,
  features: IViewModeFeatures
): ReadonlyArray<ViewMode> {
  const modes = new Array<ViewMode>()
  if (features.conflicts && getConflictMarkerCount(status) > 0) {
    modes.push('conflicts')
  }
  modes.push('diff')
  if (features.preview && isMarkdownFile(path)) {
    modes.push('preview')
  }
  // A deleted file has nothing left to show in full.
  if (features.file && status.kind !== AppFileStatusKind.Deleted) {
    modes.push('file')
  }
  return modes
}

/** File when just picked, then Conflicts, then Preview; Diff otherwise. */
export function getCurrentViewMode(
  modes: ReadonlyArray<ViewMode>,
  prefs: IViewModePrefs
): ViewMode {
  if (modes.includes('file') && prefs.wholeFile) {
    return 'file'
  } else if (modes.includes('conflicts') && prefs.conflictView) {
    return 'conflicts'
  } else if (modes.includes('preview') && prefs.markdownPreview) {
    return 'preview'
  }
  return 'diff'
}

/**
 * The choices to store so that `mode` is the one shown. Undefined ones keep
 * their value: picking File doesn't forget that Markdown opens in Preview.
 */
export function getPrefsForViewMode(
  mode: ViewMode,
  modes: ReadonlyArray<ViewMode>
): IViewModePrefs {
  const has = (m: ViewMode) => modes.includes(m)
  switch (mode) {
    case 'file':
      return { wholeFile: true }
    case 'conflicts':
      return { conflictView: true, wholeFile: false }
    case 'preview':
      return {
        markdownPreview: true,
        conflictView: has('conflicts') ? false : undefined,
        wholeFile: false,
      }
    case 'diff':
      return {
        conflictView: has('conflicts') ? false : undefined,
        markdownPreview: has('preview') ? false : undefined,
        wholeFile: false,
      }
  }
}
