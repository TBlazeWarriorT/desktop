/// <reference path="./globals.d.ts" />

import {
  defineMode,
  defineMIME,
} from 'codemirror/addon/runmode/runmode.node.js'
import { IRathenaDefinitions, IRathenaExtra } from '../lib/rathena/types'

export const RathenaMIME = 'text/x-rathena'

/** Language keywords that are not BUILDIN commands. */
const keywords = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'function',
])

const bools = new Set(['true', 'false', 'TRUE', 'FALSE'])

// Constant families that are only known at runtime (db-driven) or by prefix.
const constantPrefixes = [
  'FOOTPRINT_',
  'CD_',
  'JT_',
  'Job_',
  'JOB_',
  'JOBL_',
  'MAPID_',
  'EAJL_',
  'EAJ_',
  'SEX_',
  'BC_',
  'bc_',
  'MF_',
  'mf_',
  'CELL_',
  'cell_',
  'SP_',
  'EQI_',
  'EQP_',
  'LOOK_',
  'VAR_',
  'Eff_',
  'SC_',
  'SI_',
  'EFST_',
  'ELE_',
  'Ele_',
  'RC_',
  'RC2_',
  'CLASS_',
  'AI_',
  'ATF_',
  'BF_',
  'e_',
  'E_',
  'ET_',
  'PET_',
  'MOB_',
  'Option_',
  'EF_',
  'IT_',
  'W_',
  'A_',
  'FW_',
  'BSF_',
  'BOUND_',
  'Bound_',
  'OPTION_',
  'BG_',
  'DIR_',
  'IM_',
  'QTYPE_',
  'NAV_',
  'ADOPT_',
  'RDMOPT_',
]
const constantWords = new Set(['WARPNPC', 'HIDDEN_MOB'])

const headerTypes =
  'script|function|warp2?|shop|cashshop|itemshop|pointshop|marketshop|' +
  'monster|boss_monster|miniboss_monster|mapflag|duplicate\\([^)\\t]*\\)'
const headerRe = new RegExp(
  `^([^\\t/]+)\\t(${headerTypes})\\t([^\\t]*)(?:\\t|$)`
)

/** `prontera,150,150,4<TAB>script<TAB>Name#hid::Unique<TAB>sprite,{` */
export function looksLikeRathenaScript(lines: ReadonlyArray<string>) {
  return lines.some(l => headerRe.test(l))
}

const todoRe = /!(TODO|FIXME|CHECKME|BUG|CONFIRM)\b/

export interface IRathenaModeOptions {
  readonly definitions: IRathenaDefinitions
  readonly extra?: IRathenaExtra
  readonly globalFunctions?: ReadonlyArray<string>
  /** Identifies the options across worker messages, which clone them. */
  readonly key?: string
}

interface ICompiled {
  readonly commands: ReadonlySet<string>
  readonly deprecatedCommands: ReadonlySet<string>
  readonly constants: ReadonlySet<string>
  readonly parameters: ReadonlySet<string>
  readonly deprecatedConstants: ReadonlySet<string>
  readonly keywords: ReadonlySet<string>
  readonly prefixes: ReadonlyArray<string>
  readonly globalFunctions: ReadonlySet<string>
}

const compiledByKey = new Map<string, ICompiled>()
const compiledByObject = new WeakMap<IRathenaModeOptions, ICompiled>()

function compile(options: IRathenaModeOptions): ICompiled {
  const { definitions: defs, extra = {}, key } = options
  let compiled =
    key !== undefined ? compiledByKey.get(key) : compiledByObject.get(options)

  if (compiled === undefined) {
    compiled = {
      commands: new Set([
        ...Object.keys(defs.commands),
        ...(extra.commands ?? []),
      ]),
      deprecatedCommands: new Set(defs.deprecatedCommands),
      constants: new Set([...defs.constants, ...(extra.constants ?? [])]),
      parameters: new Set(defs.parameters),
      deprecatedConstants: new Set(defs.deprecatedConstants),
      keywords: new Set([...keywords, ...(extra.keywords ?? [])]),
      prefixes: [...constantPrefixes, ...(extra.prefixes ?? [])],
      globalFunctions: new Set(options.globalFunctions),
    }
    if (key !== undefined) {
      // A worker only ever sees a couple of repositories at a time.
      if (compiledByKey.size > 4) {
        compiledByKey.clear()
      }
      compiledByKey.set(key, compiled)
    } else {
      compiledByObject.set(options, compiled)
    }
  }
  return compiled
}

interface IState {
  inBlockComment: boolean
  inString: boolean
  /** End offsets of the location, type and name fields of an NPC header line. */
  header: [number, number, number] | null
  /** Local (`function X;`) and global (`function<TAB>script<TAB>X`) functions in this file. */
  functions: Set<string> | null
  /** Last word seen on this line, to recognize `callfunc "F_Name"`. */
  lastWord: string | null
}

const localFunctionRe = /\bfunction\s+([A-Za-z_]\w*)\s*(?:[;{]|$)/g

/** Scans the whole file once, so calls before the declaration are caught too. */
function collectFunctions(stream: CodeMirror.StringStream): Set<string> {
  const names = new Set<string>()
  let line: string | undefined = stream.string
  for (let n = 1; line !== undefined; n++) {
    const header = headerRe.exec(line)
    if (header && header[2] === 'function') {
      names.add(header[3])
    } else {
      for (const [, name] of line.matchAll(localFunctionRe)) {
        names.add(name)
      }
    }
    line = stream.lookAhead(n)
  }
  return names
}

/** Comment text up to a `!TODO`-style marker, which runs to the end. */
function commentUntil(stream: CodeMirror.StringStream, stop: RegExp) {
  const rest = stream.string.slice(stream.pos)
  const todo = todoRe.exec(rest)
  const end = stop.exec(rest)

  if (todo && todo.index === 0) {
    const len = end ? end.index + end[0].length : rest.length
    stream.pos += len
    return { style: 'comment rathena-todo', closed: end !== null }
  }

  const todoAt = todo && (!end || todo.index < end.index) ? todo.index : null
  if (todoAt !== null) {
    stream.pos += todoAt
    return { style: 'comment', closed: false }
  }

  stream.pos += end ? end.index + end[0].length : rest.length
  return { style: 'comment', closed: end !== null }
}

function headerToken(stream: CodeMirror.StringStream, state: IState) {
  const [locEnd, typeEnd, nameEnd] = state.header!
  const pos = stream.pos

  if (stream.peek() === '\t') {
    stream.next()
    return null
  }

  if (pos < locEnd) {
    if (stream.match(/^\d+/)) {
      return 'number'
    }
    if (stream.match(/^[^,\t]+/)) {
      return 'rathena-map'
    }
    stream.next()
    return null
  }

  if (pos < typeEnd) {
    stream.pos = typeEnd
    return 'rathena-header-type'
  }

  // Name field: "Display Name#hidden::Unique"
  const field = stream.string.slice(pos, nameEnd)
  if (field.startsWith('::')) {
    stream.pos = nameEnd
    return 'rathena-npc-unique'
  }
  if (field.startsWith('#')) {
    const unique = field.indexOf('::')
    stream.pos = unique === -1 ? nameEnd : pos + unique
    return 'rathena-npc-hidden'
  }
  const cut = field.search(/#|::/)
  stream.pos = cut === -1 ? nameEnd : pos + cut
  return 'rathena-npc-name'
}

function stringToken(stream: CodeMirror.StringStream, state: IState) {
  const color = stream.match(/^\^([0-9a-fA-F]{6})/)
  if (color) {
    return `string rathena-color rathena-color-${color[1].toLowerCase()}`
  }

  while (!stream.eol()) {
    const ch = stream.peek()
    if (
      ch === '^' &&
      /^\^[0-9a-fA-F]{6}/.test(stream.string.slice(stream.pos))
    ) {
      return 'string'
    }
    stream.next()
    if (ch === '\\') {
      stream.next()
    } else if (ch === '"') {
      state.inString = false
      return 'string'
    }
  }

  state.inString = false
  return 'string'
}

function wordStyle(
  word: string,
  c: ICompiled,
  functions: ReadonlySet<string>
): string | null {
  if (bools.has(word)) {
    return 'rathena-bool'
  }
  if (c.keywords.has(word)) {
    return 'keyword rathena-keyword'
  }
  if (functions.has(word) || c.globalFunctions.has(word)) {
    return 'rathena-function'
  }
  if (c.commands.has(word)) {
    return c.deprecatedCommands.has(word)
      ? 'rathena-command rathena-deprecated'
      : 'rathena-command'
  }
  if (c.parameters.has(word)) {
    return 'rathena-param'
  }
  if (c.deprecatedConstants.has(word)) {
    return 'rathena-constant rathena-deprecated'
  }
  if (
    c.constants.has(word) ||
    constantWords.has(word) ||
    c.prefixes.some(p => word.startsWith(p))
  ) {
    return 'rathena-constant'
  }
  if (/^On[A-Z]/.test(word)) {
    return 'rathena-label'
  }
  return null
}

defineMode('rathena', (_config, options?: IRathenaModeOptions) => {
  if (options?.definitions === undefined) {
    throw new Error('The rathena mode needs definitions')
  }
  const c = compile(options)

  return {
    name: 'rathena',

    startState: (): IState => ({
      inBlockComment: false,
      inString: false,
      header: null,
      functions: null,
      lastWord: null,
    }),

    token(stream, state: IState) {
      state.functions ??= collectFunctions(stream)

      if (stream.sol()) {
        state.inString = false
        state.lastWord = null
        const m = state.inBlockComment ? null : headerRe.exec(stream.string)
        state.header = m
          ? [
              m[1].length,
              m[1].length + 1 + m[2].length,
              m[1].length + 1 + m[2].length + 1 + m[3].length,
            ]
          : null
      }

      if (state.header !== null && stream.pos < state.header[2]) {
        return headerToken(stream, state)
      }

      if (state.inBlockComment) {
        const r = commentUntil(stream, /\*\//)
        state.inBlockComment = !r.closed
        return r.style
      }

      if (state.inString) {
        return stringToken(stream, state)
      }

      if (stream.eatSpace()) {
        return null
      }

      if (stream.match('//')) {
        return commentUntil(stream, /$^/).style
      }

      if (stream.match('/*')) {
        state.inBlockComment = true
        const r = commentUntil(stream, /\*\//)
        state.inBlockComment = !r.closed
        return r.style
      }

      if (stream.peek() === '"') {
        const callee = /^callfunc$/i.test(state.lastWord ?? '')
          ? stream.match(/^"([^"\\]*)"/, false)
          : null
        if (callee && c.globalFunctions.has(callee[1])) {
          stream.pos += callee[0].length
          return 'string rathena-function'
        }
        stream.next()
        state.inString = true
        return 'string'
      }

      const todo = stream.match(todoRe)
      if (todo) {
        stream.skipToEnd()
        return 'comment rathena-todo'
      }

      // Sprite names such as 4_M_MANAGER or 1_SHADOW_NPC.
      if (stream.match(/^\d+_\w+/)) {
        return 'rathena-constant'
      }

      if (stream.match(/^0x[0-9a-fA-F]+/) || stream.match(/^\d+/)) {
        return 'number'
      }

      if (stream.match(/^(\.@|\.|@|')[A-Za-z_]\w*\$?/)) {
        return 'rathena-var-scope'
      }
      if (stream.match(/^(\$@|\$|##|#)[A-Za-z_]\w*\$?/)) {
        return 'rathena-var-global'
      }

      const word = stream.match(/^[A-Za-z_]\w*\$?/)
      if (word) {
        const name = word[0]
        state.lastWord = name
        const isFirst = stream.string.slice(0, stream.start).trim() === ''
        if (
          isFirst &&
          /^:(?!:)/.test(stream.string.slice(stream.pos)) &&
          !c.keywords.has(name)
        ) {
          return 'rathena-label'
        }
        return wordStyle(name, c, state.functions)
      }

      const ch = stream.next()
      if (ch === '{' || ch === '}') {
        return 'rathena-brace'
      }
      return ch !== null && /[-!%&()*,:;[\]|+<=>?^/~]/.test(ch)
        ? 'rathena-operator'
        : null
    },

    lineComment: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
  }
})

defineMIME(RathenaMIME, 'rathena')
