import * as Path from 'path'
import { app, shell } from 'electron'
import { BlaziumAppUserModelId } from '../lib/fork'

/**
 * Keeps a Start menu entry pointing at this exe, with the same app ID as its
 * windows, so pinning it to the taskbar groups with the running app. Rewritten
 * on every launch: a rebuilt or moved exe stays reachable.
 */
export function updateStartMenuShortcut() {
  const programs = Path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )
  try {
    const written = shell.writeShortcutLink(
      Path.join(programs, `${app.getName()}.lnk`),
      // 'replace' fails when there's no shortcut yet; 'create' also overwrites.
      'create',
      {
        target: process.execPath,
        cwd: Path.dirname(process.execPath),
        icon: process.execPath,
        iconIndex: 0,
        appUserModelId: BlaziumAppUserModelId,
        description: app.getName(),
      }
    )
    // It reports failure by returning false, not by throwing.
    if (!written) {
      log.warn('Could not write the Start menu shortcut')
    }
  } catch (e) {
    log.warn('Could not update the Start menu shortcut', e)
  }
}
