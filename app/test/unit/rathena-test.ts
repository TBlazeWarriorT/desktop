import { describe, it } from 'node:test'
import assert from 'node:assert'
import { runMode } from 'codemirror/addon/runmode/runmode.node.js'
import {
  parseBuiltins,
  parseConstants,
} from '../../src/lib/rathena/parse-source'
import { looksLikeRathenaScript } from '../../src/highlighter/rathena'
import { IRathenaDefinitions } from '../../src/lib/rathena/types'

const definitions: IRathenaDefinitions = {
  source: 'test',
  commands: { mes: 'v*', close: '', getmonsterinfo: 'vi*', oldcmd: '' },
  deprecatedCommands: ['oldcmd'],
  constants: ['INT_MAX', '1_M_PAY_ELDER'],
  parameters: ['Zeny'],
  deprecatedConstants: ['OLD_CONST'],
}

/** Returns [text, style] pairs for one line, skipping unstyled tokens. */
function tokens(text: string) {
  const out = new Array<[string, string]>()
  runMode(text, { name: 'rathena', definitions }, (t, style) => {
    if (style) {
      out.push([t, style])
    }
  })
  return out
}

const styleOf = (text: string, token: string) =>
  tokens(text).find(([t]) => t === token)?.[1]

describe('rathena source parsing', () => {
  it('reads BUILDIN_DEF variants and skips comments and macros', () => {
    const { commands, deprecatedCommands } = parseBuiltins(`
#define BUILDIN_DEF(x,args) { buildin_ ## x , #x , args, nullptr }
/* BUILDIN_DEF(inblock,"") */
//BUILDIN_DEF(example,""),
  BUILDIN_DEF(mes,"v*"), // trailing comment
  BUILDIN_DEF(getmonsterinfo,"vi*"),
  BUILDIN_DEF2(round, "floor", "i"),
  BUILDIN_DEF2_DEPRECATED(strmobinfo, "getmonsterinfo", "ii", "2025-03-11"),
  BUILDIN_DEF_DEPRECATED(oldcmd,"i","2020-01-01"),
`)
    assert.deepEqual(Object.keys(commands).sort(), [
      'floor',
      'getmonsterinfo',
      'mes',
      'oldcmd',
    ])
    assert.equal(commands.getmonsterinfo, 'vi*')
    assert.deepEqual(deprecatedCommands, ['oldcmd'])
  })

  it('reads every export_* constant form', () => {
    const r = parseConstants(`
  #define export_constant(a) script_set_constant(#a,a,false,false)
  export_constant(INT_MAX);
  export_constant2("SWORDCLAN", 1);
  export_constant_npc(JT_1_M_PAY_ELDER);
  export_parameter("Zeny", SP_ZENY);
  export_deprecated_constant(OLD_A);
  export_deprecated_constant3("OLD_B", NEW_B, "NEW_B");
`)
    assert.deepEqual(r.constants.sort(), [
      '1_M_PAY_ELDER',
      'INT_MAX',
      'SWORDCLAN',
    ])
    assert.deepEqual(r.parameters, ['Zeny'])
    assert.deepEqual(r.deprecatedConstants, ['OLD_A', 'OLD_B'])
  })
})

describe('rathena highlighting', () => {
  it('detects scripts by their NPC header', () => {
    assert.ok(
      looksLikeRathenaScript([
        '// x',
        'prontera,150,150,4\tscript\tGuide\t4_M_MANAGER,{',
      ])
    )
    assert.ok(looksLikeRathenaScript(['-\tshop\tMyShop\t-1,501:-1']))
    assert.ok(
      !looksLikeRathenaScript(['just some notes', 'with\ttabs\tin\tthem'])
    )
    assert.ok(!looksLikeRathenaScript(['int main() {', '\treturn 0;', '}']))
  })

  it('marks functions declared anywhere in the file', () => {
    const text = [
      '-\tscript\tX\t-1,{',
      '\tChkResult(1);',
      '\tfunction ChkResult;',
      '\tfunction FinalReport {',
      '}',
      'function\tscript\tF_Global\t{',
    ].join('\n')
    const all = new Array<[string, string]>()
    runMode(text, { name: 'rathena', definitions }, (t, style) => {
      if (style) {
        all.push([t, style])
      }
    })
    const styles = (word: string) =>
      all.filter(([t]) => t === word).map(([, s]) => s)
    assert.deepEqual(styles('ChkResult'), [
      'rathena-function',
      'rathena-function',
    ])
    assert.deepEqual(styles('FinalReport'), ['rathena-function'])
    assert.deepEqual(styles('F_Global'), ['rathena-npc-name'])
    assert.equal(styleOf('F_Global();', 'F_Global'), undefined)
  })

  it('splits NPC header fields', () => {
    const t = tokens(
      'prontera,150,150,4\tscript\tGuide#g1::GuideA\t1_M_PAY_ELDER,{'
    )
    assert.deepEqual(t.slice(0, 7), [
      ['prontera', 'rathena-map'],
      ['150', 'number'],
      ['150', 'number'],
      ['4', 'number'],
      ['script', 'rathena-header-type'],
      ['Guide', 'rathena-npc-name'],
      ['#g1', 'rathena-npc-hidden'],
    ])
    assert.deepEqual(t[7], ['::GuideA', 'rathena-npc-unique'])
    assert.equal(
      styleOf('-\tscript\tX\t1_M_PAY_ELDER,{', '1_M_PAY_ELDER'),
      'rathena-constant'
    )
  })

  it('classifies words', () => {
    const line =
      'if (Zeny > INT_MAX) mes "hi"; oldcmd; SC_BLESSING; set .@a$, $@b + ##c; unknown;'
    assert.equal(styleOf(line, 'if'), 'keyword rathena-keyword')
    assert.equal(styleOf(line, 'Zeny'), 'rathena-param')
    assert.equal(styleOf(line, 'INT_MAX'), 'rathena-constant')
    assert.equal(styleOf(line, 'mes'), 'rathena-command')
    assert.equal(styleOf(line, 'oldcmd'), 'rathena-command rathena-deprecated')
    assert.equal(styleOf(line, 'SC_BLESSING'), 'rathena-constant')
    assert.equal(styleOf(line, '.@a$'), 'rathena-var-scope')
    assert.equal(styleOf(line, '$@b'), 'rathena-var-global')
    assert.equal(styleOf(line, '##c'), 'rathena-var-global')
    assert.equal(styleOf(line, 'unknown'), undefined)
  })

  it('marks labels', () => {
    assert.equal(styleOf('OnInit:', 'OnInit'), 'rathena-label')
    assert.equal(styleOf('L_Menu:', 'L_Menu'), 'rathena-label')
    assert.equal(styleOf('\tcase 1:', 'case'), 'keyword rathena-keyword')
    assert.equal(styleOf('donpcevent "x::OnFoo"; end;', 'end'), undefined)
  })

  it('colors ^RRGGBB codes inside strings', () => {
    assert.deepEqual(tokens('mes "^FF0000Red^000000 ok";').slice(1), [
      ['"', 'string'],
      ['^FF0000', 'string rathena-color rathena-color-ff0000'],
      ['Red', 'string'],
      ['^000000', 'string rathena-color rathena-color-000000'],
      [' ok"', 'string'],
      [';', 'rathena-operator'],
    ])
  })

  it('handles comments and !TODO markers', () => {
    assert.deepEqual(tokens('a; // note !TODO fix this').slice(1), [
      ['// note ', 'comment'],
      ['!TODO fix this', 'comment rathena-todo'],
    ])
    assert.deepEqual(tokens('/* one\n!FIXME two */ mes'), [
      ['/* one', 'comment'],
      ['!FIXME two */', 'comment rathena-todo'],
      ['mes', 'rathena-command'],
    ])
  })
})
