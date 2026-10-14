import { AppFileStatus, AppFileStatusKind } from '../../models/status'
import { getConflictMarkerCount } from '../../lib/conflict-markers'
import { isMarkdownFile } from '../../lib/markdown-files'

/** The ways a changed file can be shown, in switcher order. */
export type ViewMode = 'conflicts' | 'diff' | 'file' | 'preview'

/** Which modes a screen offers at all (History has no conflict view). */
export interface IViewModeFeatures {
  readonly conflicts: boolean
  readonly file: boolean
  readonly preview: boolean
}

/** The remembered choices; each one only applies where its mode exists. */
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
  // A deleted file has nothing left to show in full.
  if (features.file && status.kind !== AppFileStatusKind.Deleted) {
    modes.push('file')
  }
  if (features.preview && isMarkdownFile(path)) {
    modes.push('preview')
  }
  return modes
}

/** Conflicts win, then Preview, then File; Diff otherwise. */
export function getCurrentViewMode(
  modes: ReadonlyArray<ViewMode>,
  prefs: IViewModePrefs
): ViewMode {
  if (modes.includes('conflicts') && prefs.conflictView) {
    return 'conflicts'
  } else if (modes.includes('preview') && prefs.markdownPreview) {
    return 'preview'
  } else if (modes.includes('file') && prefs.wholeFile) {
    return 'file'
  }
  return 'diff'
}

/** The preferences to store so that `mode` is the one shown. */
export function getPrefsForViewMode(
  mode: ViewMode,
  modes: ReadonlyArray<ViewMode>
): IViewModePrefs {
  // Modes this file lacks stay undefined, so their stored choice is kept.
  return {
    conflictView: modes.includes('conflicts')
      ? mode === 'conflicts'
      : undefined,
    markdownPreview:
      mode !== 'conflicts' && modes.includes('preview')
        ? mode === 'preview'
        : undefined,
    wholeFile:
      mode !== 'conflicts' && modes.includes('file')
        ? mode === 'file'
        : undefined,
  }
}
