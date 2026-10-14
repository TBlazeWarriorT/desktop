import * as Path from 'path'

export const isMarkdownFile = (path: string) => /\.(md|markdown)$/i.test(path)

// `![alt](src)` and `<img src="src">`; group 1 is everything before the src.
export const markdownImagePatterns: ReadonlyArray<RegExp> = [
  /(!\[[^\]]*\]\(\s*<?)([^)\s>]+)/g,
  /(<img\b[^>]*\bsrc=["'])([^"']+)/gi,
]

/**
 * Repository-relative path of an image referenced from a markdown file, or null
 * for URLs and paths outside the repository. A leading `/` is the repo root.
 */
export function resolveImagePath(src: string, markdownPath: string) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(src)) {
    return null
  }
  let clean: string
  try {
    clean = decodeURI(src.split(/[?#]/)[0])
  } catch {
    return null
  }
  const dir = Path.posix.dirname(markdownPath.replace(/\\/g, '/'))
  const target = Path.posix.normalize(
    clean.startsWith('/') ? clean.slice(1) : Path.posix.join(dir, clean)
  )
  return target.startsWith('..') ? null : target
}
