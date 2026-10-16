import { describe, it } from 'node:test'
import assert from 'node:assert'
import { runMode } from 'codemirror/addon/runmode/runmode.node.js'
import '../../src/highlighter/rathena'
import { markTabs } from '../../src/highlighter/rathena-files'
import '../../src/highlighter/extra-modes'
import { IRathenaDefinitions } from '../../src/lib/rathena/types'

const definitions: IRathenaDefinitions = {
  source: 'test',
  commands: { mes: 'v*', close: '' },
  deprecatedCommands: [],
  constants: [],
  parameters: [],
  deprecatedConstants: [],
}

/** [text, style] pairs of a mode's output, skipping unstyled tokens. */
function tokens(text: string, name: string) {
  const out = new Array<[string, string]>()
  runMode(text, { name, definitions }, (t, style) => {
    if (style) {
      out.push([t, style])
    }
  })
  return out
}

const styleOf = (out: ReadonlyArray<[string, string]>, text: string) =>
  out.find(([t]) => t === text)?.[1]

describe('rathena .conf files', () => {
  it('colors keys, directives, values and comments', () => {
    const out = tokens(
      [
        '// Players maximum HP rate',
        'hp_rate: 100',
        'left_cardfix_to_right: yes',
        'npc: npc/functions/travel.cpp',
        'server_name: "Gear"  // inline',
        'char_ip: 26.254.217.21',
      ].join('\n'),
      'rathena-conf'
    )
    assert.equal(styleOf(out, '// Players maximum HP rate'), 'comment')
    assert.equal(styleOf(out, 'hp_rate'), 'rathena-function')
    assert.equal(styleOf(out, '100'), 'number')
    assert.equal(styleOf(out, 'yes'), 'rathena-bool')
    assert.equal(styleOf(out, 'npc'), 'keyword rathena-keyword')
    assert.equal(styleOf(out, '"Gear"'), 'string')
    assert.equal(styleOf(out, '// inline'), 'comment')
    assert.equal(styleOf(out, '26.254.217.21'), 'number')
  })
})

describe('batch files and VS solutions', () => {
  it('colors batch comments, labels, variables and keywords', () => {
    const out = tokens(
      [
        '@echo off',
        'rem Builds it',
        ':: also a comment',
        'set "EXE=%~dp0app.exe"',
        'if errorlevel 1 goto :fail',
        'for %%i in (*.txt) do echo %%i',
        ':fail',
      ].join('\n'),
      'batch'
    )
    assert.equal(styleOf(out, '@'), 'meta')
    assert.equal(styleOf(out, 'echo'), 'keyword')
    assert.equal(styleOf(out, 'rem Builds it'), 'comment')
    assert.equal(styleOf(out, ':: also a comment'), 'comment')
    assert.equal(styleOf(out, '"EXE=%~dp0app.exe"'), 'string')
    assert.equal(styleOf(out, '%%i'), 'variable-2')
    assert.equal(styleOf(out, ':fail'), 'def')
  })

  it('colors solution sections, GUIDs and keys', () => {
    const out = tokens(
      [
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        '# Visual Studio Version 17',
        'VisualStudioVersion = 17.0.0.0',
        'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "common", "src/common.vcxproj", "{F8FD7B1E-8E1C-4CC3-9CD1-2E28F77B6559}"',
        '\tProjectSection(ProjectDependencies) = postProject',
        'EndProject',
      ].join('\n'),
      'vs-solution'
    )
    assert.equal(styleOf(out, '# Visual Studio Version 17'), 'comment')
    assert.equal(styleOf(out, 'VisualStudioVersion'), 'variable')
    assert.equal(styleOf(out, '17.0.0.0'), 'number')
    assert.equal(styleOf(out, 'Project'), 'keyword')
    assert.equal(
      styleOf(out, '"{2150E333-8FDC-42A3-9474-1A3956D46DE8}"'),
      'atom'
    )
    assert.equal(styleOf(out, '"common"'), 'string')
    assert.equal(styleOf(out, 'postProject'), 'variable-2')
    assert.equal(styleOf(out, 'EndProject'), 'keyword')
  })
})

describe('PowerShell', () => {
  it('colors any approved-verb cmdlet and -Parameter names', async () => {
    await import('codemirror/mode/powershell/powershell')
    const out = tokens(
      [
        'New-Item -Path $x -Force',
        'Install-Module Foo',
        'Frobnicate-Thing',
      ].join('\n'),
      'powershell-plus'
    )
    assert.equal(styleOf(out, 'New-Item'), 'builtin')
    assert.equal(styleOf(out, 'Install-Module'), 'builtin')
    assert.equal(styleOf(out, 'Path'), 'attribute')
    assert.equal(styleOf(out, 'Force'), 'attribute')
    assert.equal(styleOf(out, 'Frobnicate-Thing'), 'identifier')
  })
})

describe('rathena command reference', () => {
  const doc = [
    '//===== rAthena Documentation',
    '|1.- Basic commands.|',
    '=====================',
    '',
    '*mes "<string>"{,"<string>"{,...}};',
    '',
    'Displays up to 2 lines.',
    '',
    '\tmes "Hello";',
    '\tclose;',
    '',
    '** Set a map flag:',
  ]

  it('colors entries, titles and highlights tab-indented examples', () => {
    const out = tokens(doc.join('\n'), 'rathena-doc')
    assert.equal(styleOf(out, '*mes'), 'rathena-command rathena-doc-command')
    assert.equal(styleOf(out, '<string>'), undefined) // inside a string
    assert.equal(styleOf(out, '|1.- Basic commands.|'), 'header')
    assert.equal(styleOf(out, '** Set a map flag:'), 'header')
    assert.equal(styleOf(out, '2'), 'number')
    // The example lines are script: commands and strings colored as such.
    assert.deepEqual(
      out.filter(([t]) => t === 'mes').map(([, s]) => s),
      ['rathena-command']
    )
    assert.equal(styleOf(out, 'close'), 'rathena-command')
  })
})

describe('markTabs', () => {
  it('gives every tab its own token, keeping the style around it', () => {
    const line = '\tmes\t"a\tb";'
    const marked = markTabs(line, {
      1: { length: 3, token: 'rathena-command' },
      5: { length: 5, token: 'string' },
    })
    assert.deepEqual(marked, {
      0: { length: 1, token: 'rathena-tab' },
      1: { length: 3, token: 'rathena-command' },
      4: { length: 1, token: 'rathena-tab' },
      5: { length: 2, token: 'string' },
      7: { length: 1, token: 'string rathena-tab' },
      8: { length: 2, token: 'string' },
    })
  })

  it('leaves lines without tabs alone', () => {
    const tokens = { 0: { length: 3, token: 'number' } }
    assert.equal(markTabs('123', tokens), tokens)
  })
})
