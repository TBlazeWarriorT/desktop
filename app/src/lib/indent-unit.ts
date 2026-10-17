/**
 * The file's indentation: a tab when its indented lines mostly start with one
 * (or nothing is indented yet), else the smallest run of spaces it uses.
 */
export function detectIndentUnit(text: string): string {
  let tabs = 0
  let spaced = 0
  let smallest = Infinity
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('\t')) {
      tabs++
    } else {
      const spaces = /^ +(?=\S)/.exec(line)?.[0].length ?? 0
      if (spaces >= 2) {
        spaced++
        smallest = Math.min(smallest, spaces)
      }
    }
  }
  return spaced > tabs ? ' '.repeat(Math.min(smallest, 8)) : '\t'
}
