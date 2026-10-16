/// <reference path="./globals.d.ts" />

import {
  defineMode,
  defineMIME,
  getMode,
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

// PowerShell's approved verbs (Get-Verb). Any Verb-Noun with one of them is a
// cmdlet, whatever module it comes from.
const powershellVerbs = (
  'Add Approve Assert Backup Block Build Checkpoint Clear Close Compare ' +
  'Complete Compress Confirm Connect Convert ConvertFrom ConvertTo Copy Debug ' +
  'Deny Deploy Disable Disconnect Dismount Edit Enable Enter Exit Expand ' +
  'Export Find Format Get Grant Group Hide Import Initialize Install Invoke ' +
  'Join Limit Lock Measure Merge Mount Move New Open Optimize Out Ping Pop ' +
  'Protect Publish Push Read Receive Redo Register Remove Rename Repair ' +
  'Request Reset Resize Resolve Restart Restore Resume Revoke Save Search ' +
  'Select Send Set Show Skip Split Start Step Stop Submit Suspend Switch Sync ' +
  'Test Trace Unblock Undo Uninstall Unlock Unprotect Unpublish Unregister ' +
  'Update Use Wait Watch Write'
).split(' ')
const cmdletRe = new RegExp(
  '^(' + powershellVerbs.join('|') + ')-[A-Za-z][A-Za-z0-9_]*$',
  'i'
)

/**
 * CodeMirror's PowerShell mode, plus: cmdlets it doesn't list (by approved
 * verb) and `-Parameter` names as one token instead of `-` and a word.
 */
defineMode('powershell-plus', config => {
  const powershell = getMode(config, 'powershell')
  return {
    ...powershell,
    name: 'powershell',
    token(stream, state) {
      const style = powershell.token(stream, state)
      if (style !== 'identifier') {
        return style
      }
      const text = stream.current()
      if (cmdletRe.test(text)) {
        return 'builtin'
      }
      const before = stream.string.slice(0, stream.start)
      if (/(^|\s)-$/.test(before)) {
        return 'attribute'
      }
      return style
    },
  }
})
defineMIME('text/x-powershell-plus', 'powershell-plus')
