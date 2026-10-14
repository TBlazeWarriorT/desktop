import { IConflictRegion } from './conflict-markers'

/** What a conflict block becomes; "both" keeps the current side first. */
export type ConflictChoice = 'current' | 'incoming' | 'both' | 'both-reversed'

/** The lines that replace the whole block, markers included. */
export function resolveConflict(
  lines: ReadonlyArray<string>,
  region: IConflictRegion,
  choice: ConflictChoice
): ReadonlyArray<string> {
  const current = lines.slice(region.start + 1, region.base ?? region.separator)
  const incoming = lines.slice(region.separator + 1, region.end)
  switch (choice) {
    case 'current':
      return current
    case 'incoming':
      return incoming
    case 'both':
      return [...current, ...incoming]
    case 'both-reversed':
      return [...incoming, ...current]
  }
}
