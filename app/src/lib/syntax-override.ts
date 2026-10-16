/**
 * The syntax picked by hand for a file (the "Syntax" menu next to Diff
 * Options), remembered per repository and path. Values are what the
 * highlighter worker takes as `syntax`: 'plain', an rAthena mode name, or a
 * CodeMirror MIME type.
 */

export interface ISyntaxChoice {
  readonly id: string
  readonly label: string
}

export const rathenaSyntaxChoices: ReadonlyArray<ISyntaxChoice> = [
  { id: 'rathena', label: 'rAthena script' },
  { id: 'rathena-yaml', label: 'rAthena YAML' },
  { id: 'rathena-conf', label: 'rAthena conf' },
  { id: 'rathena-doc', label: 'rAthena docs' },
]

export const otherSyntaxChoices: ReadonlyArray<ISyntaxChoice> = [
  { id: 'text/x-batch', label: 'Batch' },
  { id: 'text/x-c++src', label: 'C/C++' },
  { id: 'text/x-csharp', label: 'C#' },
  { id: 'text/css', label: 'CSS' },
  { id: 'text/html', label: 'HTML' },
  { id: 'text/x-ini', label: 'INI' },
  { id: 'text/x-java', label: 'Java' },
  { id: 'text/javascript', label: 'JavaScript' },
  { id: 'application/json', label: 'JSON' },
  { id: 'text/x-lua', label: 'Lua' },
  { id: 'text/x-markdown', label: 'Markdown' },
  { id: 'application/x-powershell', label: 'PowerShell' },
  { id: 'text/x-python', label: 'Python' },
  { id: 'text/x-sh', label: 'Shell' },
  { id: 'text/x-sql', label: 'SQL' },
  { id: 'text/typescript', label: 'TypeScript' },
  { id: 'text/x-vs-solution', label: 'VS Solution' },
  { id: 'text/xml', label: 'XML' },
  { id: 'text/yaml', label: 'YAML' },
]

export const plainSyntax: ISyntaxChoice = { id: 'plain', label: 'Plain text' }

export function getSyntaxLabel(id: string | undefined) {
  if (id === undefined) {
    return 'Auto'
  }
  return (
    [plainSyntax, ...rathenaSyntaxChoices, ...otherSyntaxChoices].find(
      c => c.id === id
    )?.label ?? id
  )
}

const storageKey = (repositoryPath: string) =>
  `syntax-override:${repositoryPath}`

function load(repositoryPath: string): Record<string, string> {
  try {
    const stored = localStorage.getItem(storageKey(repositoryPath))
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/** The syntax picked for this file, or undefined for automatic detection. */
export function getSyntaxOverride(
  repositoryPath: string,
  path: string
): string | undefined {
  return load(repositoryPath)[path]
}

const listeners = new Set<() => void>()

/** Null goes back to automatic detection. Open views re-highlight. */
export function setSyntaxOverride(
  repositoryPath: string,
  path: string,
  syntax: string | null
) {
  const all = load(repositoryPath)
  if (syntax === null) {
    delete all[path]
  } else {
    all[path] = syntax
  }
  try {
    localStorage.setItem(storageKey(repositoryPath), JSON.stringify(all))
  } catch (e) {
    log.warn('Could not save the syntax override', e)
  }
  listeners.forEach(listener => listener())
}

/** Calls back when any file's syntax changes; returns the unsubscribe. */
export function onSyntaxOverrideChanged(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
