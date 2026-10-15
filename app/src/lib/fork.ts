/**
 * This fork's own builds: they never send usage stats to GitHub nor update
 * themselves from GitHub's servers (they'd turn into the official app).
 */
export const phonesHome = false

/**
 * Windows identity of the standalone build (GitHub Desktop Blazium): groups its
 * windows, taskbar pin, Start menu entry and notifications apart from the
 * official app. Dev builds keep the official one for notifications.
 */
export const BlaziumAppUserModelId = 'com.blazium.GitHubDesktopBlazium'

/**
 * Prefix of the app's entries in the OS credential store (login, SSH, BYOK).
 * Production builds used the official app's names, so signing in or out here
 * replaced or deleted its credentials.
 */
export const credentialAppName = __DEV__
  ? 'GitHub Desktop Dev'
  : 'GitHub Desktop Blazium'
