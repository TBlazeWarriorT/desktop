import * as Path from 'path'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { revealInFileManager } from '../../lib/app-shell'
import { pathExists } from '../../lib/path-exists'
import { openFile } from '../lib/open-file'
import { writeClipboardText } from '../main-process-proxy'
import {
  CopyFilePathLabel,
  CopyRelativeFilePathLabel,
  DefaultEditorLabel,
  FileHistoryLabel,
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
  isSafeFileExtension,
} from '../lib/context-menu'

export interface IFilesMenuContext {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /** The commit browsed; null for the working directory. */
  readonly commitish: string | null
  /** For "View on GitHub" while browsing the working directory. */
  readonly currentBranchName: string | null
  readonly externalEditorLabel?: string
  /**
   * Takes the repository-relative path: the app joins it to the repository's
   * (despite upstream naming this prop `fullPath`).
   */
  readonly onOpenInExternalEditor: (path: string) => void
}

/** Right Click on a file or folder in the Files tab. */
export async function showFilesContextMenu(
  path: string,
  isFolder: boolean,
  ctx: IFilesMenuContext
) {
  const { repository, dispatcher, commitish } = ctx
  const fullPath = Path.join(repository.path, path)
  const onDisk = await pathExists(fullPath)
  // At an old commit these open what is on disk today, so say so.
  const current = commitish === null ? '' : ' (current version)'

  const items: IMenuItem[] = [
    {
      label: RevealInFileManagerLabel + current,
      action: () => revealInFileManager(repository, path),
      enabled: onDisk,
    },
  ]
  if (!isFolder) {
    items.push(
      {
        label:
          (ctx.externalEditorLabel
            ? `Open in ${ctx.externalEditorLabel}`
            : DefaultEditorLabel) + current,
        action: () => ctx.onOpenInExternalEditor(path),
        enabled: onDisk,
      },
      {
        label: OpenWithDefaultProgramLabel + current,
        action: () => openFile(fullPath, dispatcher),
        enabled: onDisk && isSafeFileExtension(Path.extname(path)),
      }
    )
  }
  items.push(
    { type: 'separator' },
    { label: CopyFilePathLabel, action: () => writeClipboardText(fullPath) },
    {
      label: CopyRelativeFilePathLabel,
      action: () => writeClipboardText(Path.normalize(path)),
    },
    { type: 'separator' },
    {
      label: FileHistoryLabel,
      // A trailing slash marks a folder: its history doesn't follow renames.
      action: () =>
        dispatcher.showFileHistory(repository, isFolder ? `${path}/` : path),
    }
  )

  const url = getGitHubUrl(path, isFolder, ctx)
  if (url !== null) {
    items.push({
      label: 'View on GitHub',
      action: () => dispatcher.openInBrowser(url),
    })
  }

  showContextualMenu(items)
}

function getGitHubUrl(path: string, isFolder: boolean, ctx: IFilesMenuContext) {
  const htmlURL = ctx.repository.gitHubRepository?.htmlURL
  const ref = ctx.commitish ?? ctx.currentBranchName
  if (!htmlURL || !ref) {
    return null
  }
  // Branch names like feature/x keep their slashes in GitHub URLs.
  const encode = (s: string) => s.split('/').map(encodeURIComponent).join('/')
  return `${htmlURL}/${isFolder ? 'tree' : 'blob'}/${encode(ref)}/${encode(
    path
  )}`
}
