import { git } from './core'

/**
 * Returns a list of files with conflict markers present
 *
 * @param repositoryPath filepath to repository
 * @param paths only check these (a short list skips stat-ing the whole repo)
 * @returns filepaths with their number of conflicted markers
 */
export async function getFilesWithConflictMarkers(
  repositoryPath: string,
  paths?: ReadonlyArray<string>
): Promise<Map<string, number>> {
  if (paths?.length === 0) {
    return new Map()
  }
  const pathspec =
    paths !== undefined && paths.length <= 200 ? ['--', ...paths] : []

  // Whitespace checks off: only markers matter, and CRLF files would report
  // every changed line.
  const { stdout } = await git(
    [
      '--literal-pathspecs',
      '-c',
      'core.whitespace=-blank-at-eol,-blank-at-eof,-space-before-tab',
      'diff',
      '--check',
      ...pathspec,
    ],
    repositoryPath,
    'getFilesWithConflictMarkers',
    { successExitCodes: new Set([0, 2]) }
  )

  const files = new Map<string, number>()
  const matches = stdout.matchAll(/^(.+):\d+: leftover conflict marker/gm)

  for (const [, path] of matches) {
    files.set(path, (files.get(path) ?? 0) + 1)
  }

  return files
}
