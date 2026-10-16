/// <reference path="./globals.d.ts" />

import {
  defineMode,
  defineMIME,
} from 'codemirror/addon/runmode/runmode.node.js'

// Modes CodeMirror 5 doesn't ship: Windows batch files and Visual Studio
// solutions. Token names are CodeMirror's standard ones, themed already.

const batchKeywords = new Set(
  (
    'if else for in do goto call set setlocal endlocal echo exit not exist ' +
    'defined errorlevel start cd chdir pushd popd shift pause title choice ' +
    'timeout del erase copy xcopy robocopy move mkdir md rmdir rd ren rename ' +
    'type find findstr where cls color mode ver vol tasklist taskkill'
  ).split(' ')
)
const batchOperators = /^(==|equ|neq|lss|leq|gtr|geq)\b/i

interface IBatchState {
  /** Continues a `^` line or the rest of a `rem`. */
  commentLine: boolean
}

defineMode('batch', () => ({
  name: 'batch',
  startState: (): IBatchState => ({ commentLine: false }),
  token(stream, state: IBatchState) {
    if (stream.sol()) {
      state.commentLine = false
      stream.eatSpace()
      if (stream.match(/^(@?rem\b|::)/i)) {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match(/^:[^\s:]+/)) {
        return 'def'
      }
      if (stream.match('@')) {
        return 'meta'
      }
    }
    if (stream.eatSpace()) {
      return null
    }
    // %VAR%, %~dp0, %1, %%i and delayed !VAR!.
    if (stream.match(/^%%~?[a-z]/i) || stream.match(/^%~[a-z]*\d/i)) {
      return 'variable-2'
    }
    if (stream.match(/^%[^%\s]+%/) || stream.match(/^%\d/)) {
      return 'variable-2'
    }
    if (stream.match(/^![^!\s]+!/)) {
      return 'variable-2'
    }
    if (stream.match(/^"[^"]*"?/)) {
      return 'string'
    }
    if (stream.match(/^(>>?|<|\|\|?|&&?|2>&1)/)) {
      return 'operator'
    }
    if (stream.match(batchOperators)) {
      return 'operator'
    }
    if (stream.match(/^\d+\b/)) {
      return 'number'
    }
    const word = stream.match(/^[\w.-]+/) as RegExpMatchArray | null
    if (word) {
      return batchKeywords.has(word[0].toLowerCase()) ? 'keyword' : null
    }
    stream.next()
    return null
  },
}))
defineMIME('text/x-batch', 'batch')

const solutionKeywords =
  /^(Project|EndProject|ProjectSection|EndProjectSection|Global|EndGlobal|GlobalSection|EndGlobalSection)\b/

defineMode('vs-solution', () => ({
  name: 'vs-solution',
  token(stream) {
    if (stream.sol()) {
      stream.eatSpace()
      if (stream.peek() === '#') {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match(/^Microsoft Visual Studio Solution File.*/)) {
        return 'meta'
      }
      if (stream.match(solutionKeywords)) {
        return 'keyword'
      }
      // `Key = value` lines: the key.
      if (stream.match(/^[^=(]+?(?=\s*=)/)) {
        return 'variable'
      }
    }
    if (stream.eatSpace()) {
      return null
    }
    // GUIDs, quoted or not (project types and ids are quoted).
    if (stream.match(/^"?\{[0-9A-Fa-f-]{36}\}"?/)) {
      return 'atom'
    }
    if (stream.match(/^"[^"]*"?/)) {
      return 'string'
    }
    if (stream.match(/^(preSolution|postSolution|postProject)\b/)) {
      return 'variable-2'
    }
    if (stream.match(/^\d+(\.\d+)*/)) {
      return 'number'
    }
    if (stream.match(/^[=(),|]/)) {
      return 'operator'
    }
    stream.next()
    stream.match(/^[^\s"{=(),|]*/)
    return null
  },
}))
defineMIME('text/x-vs-solution', 'vs-solution')
