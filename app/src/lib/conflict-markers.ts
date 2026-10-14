import { AppFileStatus, AppFileStatusKind } from '../models/status'

/** One `<<<<<<<` … `>>>>>>>` block, as 0-based line indexes. */
export interface IConflictRegion {
  readonly start: number
  /** The `|||||||` line of diff3/zdiff3 conflicts. */
  readonly base: number | null
  readonly separator: number
  readonly end: number
  readonly currentLabel: string
  readonly incomingLabel: string
}

export type ConflictLineKind = 'marker' | 'current' | 'base' | 'incoming'

const startRe = /^<{7}(?:\s(.*))?$/
const baseRe = /^\|{7}(?:\s.*)?$/
const separatorRe = /^={7}$/
const endRe = /^>{7}(?:\s(.*))?$/

/** Complete conflict blocks in the file; unfinished ones are ignored. */
export function findConflicts(
  lines: ReadonlyArray<string>
): ReadonlyArray<IConflictRegion> {
  const regions = new Array<IConflictRegion>()
  let start: { line: number; label: string } | null = null
  let base: number | null = null
  let separator: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const startMatch = startRe.exec(line)
    if (startMatch !== null) {
      start = { line: i, label: startMatch[1]?.trim() ?? '' }
      base = separator = null
    } else if (start === null) {
      continue
    } else if (separator === null && base === null && baseRe.test(line)) {
      base = i
    } else if (separator === null && separatorRe.test(line)) {
      separator = i
    } else if (separator !== null) {
      const endMatch = endRe.exec(line)
      if (endMatch !== null) {
        regions.push({
          start: start.line,
          base,
          separator,
          end: i,
          currentLabel: start.label,
          incomingLabel: endMatch[1]?.trim() ?? '',
        })
        start = null
      }
    }
  }

  return regions
}

/** What each line of the file is, or undefined outside conflicts. */
export function getConflictLineKinds(
  lineCount: number,
  regions: ReadonlyArray<IConflictRegion>
): ReadonlyArray<ConflictLineKind | undefined> {
  const kinds = new Array<ConflictLineKind | undefined>(lineCount).fill(
    undefined
  )
  for (const r of regions) {
    const baseOrSeparator = r.base ?? r.separator
    for (let i = r.start; i <= r.end; i++) {
      kinds[i] =
        i === r.start || i === r.base || i === r.separator || i === r.end
          ? 'marker'
          : i < baseOrSeparator
          ? 'current'
          : i < r.separator
          ? 'base'
          : 'incoming'
    }
  }
  return kinds
}

/**
 * Marker lines `git diff --check` found in the file (three or four per
 * conflict): in conflicted files, and leftovers in otherwise normal ones.
 */
export function getConflictMarkerCount(status: AppFileStatus): number {
  switch (status.kind) {
    case AppFileStatusKind.Conflicted:
    case AppFileStatusKind.New:
    case AppFileStatusKind.Modified:
      return 'conflictMarkerCount' in status
        ? status.conflictMarkerCount ?? 0
        : 0
    default:
      return 0
  }
}
