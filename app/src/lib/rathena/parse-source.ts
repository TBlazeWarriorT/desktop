import { IRathenaDefinitions } from './types'

/**
 * Blanks out comments and preprocessor lines so commented-out or macro
 * definitions (`//BUILDIN_DEF(example,"")`, `#define export_constant(a)`)
 * are never picked up. String literals are kept intact.
 */
function stripCode(text: string): string {
  let out = ''
  let i = 0
  let lineStart = true

  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    if (lineStart && /\s/.test(ch) && ch !== '\n') {
      out += ch
      i++
      continue
    }

    if (lineStart && ch === '#') {
      // Skip the whole preprocessor line, honoring backslash continuations.
      while (i < text.length) {
        const continued = /\\\r?$/.test(text.slice(Math.max(0, i - 2), i))
        if (text[i] === '\n' && !continued) {
          break
        }
        i++
      }
      continue
    }

    lineStart = false

    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++
      }
      continue
    }

    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      // Keep newlines so the next real line still counts as a line start.
      out += text.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      lineStart = text[stop - 1] === '\n'
      continue
    }

    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== ch && text[j] !== '\n') {
        j += text[j] === '\\' ? 2 : 1
      }
      out += text.slice(i, j + 1)
      i = j + 1
      continue
    }

    if (ch === '\n') {
      lineStart = true
    }

    out += ch
    i++
  }

  return out
}

interface IParsedBuiltins {
  readonly commands: { [name: string]: string }
  readonly deprecatedCommands: Array<string>
}

/** Parses BUILDIN_DEF* entries from script.cpp or src/custom/script_def.inc. */
export function parseBuiltins(text: string): IParsedBuiltins {
  const commands: { [name: string]: string } = {}
  const current = new Set<string>()
  const deprecated = new Set<string>()
  const code = stripCode(text)

  // A name can be both current and a deprecated alias (getmonsterinfo); current wins.
  const add = (name: string, args: string, isDeprecated: boolean) => {
    if (isDeprecated) {
      deprecated.add(name)
      commands[name] ??= args
    } else {
      current.add(name)
      commands[name] = args
    }
  }

  const def =
    /\bBUILDIN_DEF(_DEPRECATED)?\s*\(\s*(\w+)\s*,\s*"((?:[^"\\]|\\.)*)"/g
  for (const [, dep, name, args] of code.matchAll(def)) {
    add(name, args, dep !== undefined)
  }

  const def2 =
    /\bBUILDIN_DEF2(_DEPRECATED)?\s*\(\s*\w+\s*,\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g
  for (const [, dep, name, args] of code.matchAll(def2)) {
    add(name, args, dep !== undefined)
  }

  const deprecatedCommands = [...deprecated].filter(n => !current.has(n))
  return { commands, deprecatedCommands }
}

interface IParsedConstants {
  readonly constants: Array<string>
  readonly parameters: Array<string>
  readonly deprecatedConstants: Array<string>
}

/** Parses export_* entries from script_constants.hpp. */
export function parseConstants(text: string): IParsedConstants {
  const constants = new Array<string>()
  const parameters = new Array<string>()
  const deprecatedConstants = new Array<string>()
  const code = stripCode(text)

  const patterns: ReadonlyArray<[RegExp, Array<string>, number]> = [
    [/\bexport_constant\s*\(\s*(\w+)\s*\)/g, constants, 0],
    [/\bexport_constant2\s*\(\s*"([^"]+)"/g, constants, 0],
    // export_constant_npc strips the "JT_" prefix (offset 3).
    [/\bexport_constant_npc\s*\(\s*(\w+)\s*\)/g, constants, 3],
    [/\bexport_parameter\s*\(\s*"([^"]+)"/g, parameters, 0],
    [/\bexport_deprecated_constant\s*\(\s*(\w+)\s*\)/g, deprecatedConstants, 0],
    [
      /\bexport_deprecated_constant[23]\s*\(\s*"([^"]+)"/g,
      deprecatedConstants,
      0,
    ],
  ]

  for (const [re, target, offset] of patterns) {
    for (const [, name] of code.matchAll(re)) {
      target.push(name.slice(offset))
    }
  }

  for (const [, name, offset] of code.matchAll(
    /\bexport_constant_offset\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/g
  )) {
    constants.push(name.slice(Number(offset)))
  }

  return { constants, parameters, deprecatedConstants }
}

export interface IRathenaSourceFiles {
  readonly scriptCpp: string
  readonly constantsHpp: string
  /** src/custom/script_def.inc, when present. */
  readonly customDefs?: string
}

export function buildDefinitions(
  source: string,
  files: IRathenaSourceFiles
): IRathenaDefinitions {
  const base = parseBuiltins(files.scriptCpp)
  const custom = parseBuiltins(files.customDefs ?? '')
  const consts = parseConstants(files.constantsHpp)
  const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort()

  const commands: { [name: string]: string } = {}
  for (const name of Object.keys({
    ...base.commands,
    ...custom.commands,
  }).sort()) {
    commands[name] = custom.commands[name] ?? base.commands[name]
  }

  return {
    source,
    commands,
    deprecatedCommands: sorted([
      ...base.deprecatedCommands.filter(n => !(n in custom.commands)),
      ...custom.deprecatedCommands,
    ]),
    constants: sorted(consts.constants),
    parameters: sorted(consts.parameters),
    deprecatedConstants: sorted(consts.deprecatedConstants),
  }
}
