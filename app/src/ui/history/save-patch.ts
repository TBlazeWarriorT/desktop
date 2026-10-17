import { writeFile } from 'fs/promises'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { showOpenDialog, showSaveDialog } from '../main-process-proxy'
import {
  formatCommitPatch,
  formatSquashedPatch,
  writeCommitPatches,
} from '../../lib/git/patch'

/** One commit's patch, squashed commits, or one file per commit. */
export type PatchMode = 'single' | 'merged' | 'separate'

const filters = [{ name: 'Patch', extensions: ['patch', 'diff'] }]

/** Asks where to save the commits (oldest first) as patches and saves them. */
export async function savePatch(
  repository: Repository,
  commits: ReadonlyArray<Commit>,
  mode: PatchMode
) {
  if (mode === 'separate') {
    const folder = await showOpenDialog({
      buttonLabel: `Save ${commits.length} patches`,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (folder !== null) {
      await writeCommitPatches(repository, commits, folder)
    }
    return
  }

  const { patch, fileName } =
    mode === 'single'
      ? await formatCommitPatch(repository, commits[0].sha)
      : {
          patch: await formatSquashedPatch(repository, commits),
          fileName: `${repository.name}-${commits.length}-commits.patch`,
        }
  const path = await showSaveDialog({ defaultPath: fileName, filters })
  if (path !== null) {
    await writeFile(path, patch)
  }
}
