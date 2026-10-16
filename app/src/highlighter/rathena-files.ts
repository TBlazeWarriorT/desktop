/// <reference path="./globals.d.ts" />

import { defineMode, getMode } from 'codemirror/addon/runmode/runmode.node.js'
import { ILineTokens } from '../lib/highlighter/types'
import { IRathenaModeOptions } from './rathena'

// The other files of an rAthena server: its .conf files and the script
// command reference in doc/. Token names reuse the script mode's styles.

const confDirectives = new Set(['import', 'npc', 'delnpc', 'include'])
const confBools = /^(yes|no|on|off|true|false)\b/i
const numberRe = /^-?(0x[\da-f]+|\d+(\.\d+)?)\b/i

interface IConfState {
  inBlockComment: boolean
}

/** conf/*.conf (`key: value`, libconfig blocks) and npc/*.conf (`npc: path`). */
defineMode('rathena-conf', () => ({
  name: 'rathena-conf',

  startState: (): IConfState => ({ inBlockComment: false }),

  token(stream, state: IConfState) {
    if (state.inBlockComment) {
      state.inBlockComment = !stream.skipTo('*/')
      if (state.inBlockComment) {
        stream.skipToEnd()
      } else {
        stream.pos += 2
      }
      return 'comment'
    }
    if (stream.eatSpace()) {
      return null
    }
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match('/*')) {
      state.inBlockComment = true
      return 'comment'
    }

    // A key starts its line (after indentation) and is followed by ':'.
    const atLineStart = stream.string.slice(0, stream.pos).trim() === ''
    const key = atLineStart ? stream.match(/^[\w.-]+(?=\s*:)/) : null
    if (key) {
      return confDirectives.has((key as RegExpMatchArray)[0].toLowerCase())
        ? 'keyword rathena-keyword'
        : 'rathena-function'
    }

    if (stream.match(/^"([^"\\]|\\.)*"?/)) {
      return 'string'
    }
    if (stream.match(numberRe)) {
      return 'number'
    }
    if (stream.match(confBools)) {
      return 'rathena-bool'
    }
    if (stream.match(/^[{}[\]()]/)) {
      return 'rathena-brace'
    }
    // Paths and other plain values, up to a comment.
    stream.next()
    stream.match(/^[^\s"/{}[\]()]*/)
    return null
  },
}))

/** The command reference format: `*command <args>;` entries. */
const commandEntryRe = /^\*{1,2}[A-Za-z_]/

/** doc/script_commands.txt and similar references (not doc/sample). */
export function looksLikeCommandDoc(lines: ReadonlyArray<string>) {
  let entries = 0
  for (const line of lines) {
    if (/^\*[A-Za-z_]\w*/.test(line) && ++entries >= 10) {
      return true
    }
  }
  return false
}

interface IDocState {
  inBlockComment: boolean
  /** Tab-indented example code, highlighted as script; persists across it. */
  example: unknown | null
  inExample: boolean
  /** This line is a `*command` entry; its arguments get colored. */
  inEntry: boolean
}

defineMode('rathena-doc', (config, options?: IRathenaModeOptions) => {
  const script = getMode<any>(config, { ...options, name: 'rathena' })

  return {
    name: 'rathena-doc',

    startState: (): IDocState => ({
      inBlockComment: false,
      example: null,
      inExample: false,
      inEntry: false,
    }),

    token(stream, state: IDocState) {
      if (stream.sol()) {
        state.inExample = !state.inBlockComment && stream.peek() === '\t'
        state.inEntry = commandEntryRe.test(stream.string)
        if (state.inExample && state.example === null) {
          state.example = script.startState!()
        } else if (!state.inExample) {
          state.example = null
        }
      }

      if (state.inExample) {
        return script.token(stream, state.example)
      }

      if (state.inBlockComment) {
        state.inBlockComment = !stream.skipTo('*/')
        if (state.inBlockComment) {
          stream.skipToEnd()
        } else {
          stream.pos += 2
        }
        return 'comment'
      }

      if (stream.sol()) {
        // ======= and ------- rules, and |1.- Section| titles.
        if (/^\s*[=-]{3,}\s*$/.test(stream.string)) {
          stream.skipToEnd()
          return 'comment'
        }
        if (/^\|.*\|\s*$/.test(stream.string)) {
          stream.skipToEnd()
          return 'header'
        }
        if (stream.match(/^\*\*[^\n]*/)) {
          return 'header'
        }
        if (stream.match(/^\*[A-Za-z_]\w*/)) {
          return 'rathena-command rathena-doc-command'
        }
      }

      if (stream.eatSpace()) {
        return null
      }
      if (stream.match('//')) {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match('/*')) {
        state.inBlockComment = true
        return 'comment'
      }

      if (state.inEntry) {
        if (stream.match(/^<[^>]*>/)) {
          return 'rathena-param'
        }
        if (stream.match(/^"([^"\\]|\\.)*"?/)) {
          return 'string'
        }
        if (stream.match(/^[{}]/)) {
          return 'rathena-brace'
        }
      }
      if (stream.match(numberRe)) {
        return 'number'
      }
      stream.next()
      stream.match(/^[^\s\d/<"{}]*/)
      return null
    },

    // Outside examples there's no inner mode; null tells CodeMirror so.
    innerMode: (state: IDocState) =>
      state.inExample ? { mode: script, state: state.example } : null,
  } as CodeMirror.Mode<IDocState>
})

/**
 * Splits every tab into its own token with `rathena-tab` added, keeping the
 * style it had: tabs are syntax in rAthena scripts and get drawn as arrows.
 */
export function markTabs(
  line: string,
  tokens: ILineTokens | undefined
): ILineTokens | undefined {
  if (!line.includes('\t')) {
    return tokens
  }
  // The style at each offset; gaps between tokens have none.
  const styles = new Array<string | null>(line.length).fill(null)
  for (const [offset, { length, token }] of Object.entries(tokens ?? {})) {
    for (let i = Number(offset); i < Number(offset) + length; i++) {
      styles[i] = token
    }
  }

  const result: ILineTokens = {}
  let start = 0
  const flush = (end: number) => {
    if (end > start && styles[start] !== null) {
      result[start] = { length: end - start, token: styles[start]! }
    }
  }
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\t') {
      flush(i)
      const style = styles[i]
      result[i] = {
        length: 1,
        token: style === null ? 'rathena-tab' : `${style} rathena-tab`,
      }
      start = i + 1
    } else if (i > start && styles[i] !== styles[start]) {
      flush(i)
      start = i
    }
  }
  flush(line.length)
  return result
}
