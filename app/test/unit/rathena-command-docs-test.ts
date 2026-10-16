import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseCommandDocs } from '../../src/lib/rathena/command-docs'

describe('parseCommandDocs', () => {
  const text = [
    '//===== rAthena Documentation =====',
    '',
    '|1.- Basic commands.|',
    '=====================',
    '---------------------------------------',
    '',
    '*mes "<string>"{,"<string>"{,...}};',
    '',
    'Displays a box with the string.',
    '',
    '\tmes "Hello";',
    '',
    '---------------------------------------',
    '',
    '*getitem <item id>,<amount>{,<account ID>};',
    '*getitem2 <item id>,<amount>,<identify>;',
    '',
    'Gives items.',
    '',
    '*next;',
    '',
    'Shows a next button.',
    '---------------------------------------',
    '*stopnpctimer{ "<NPC name>" } |',
    '             { <Detach Flag> };',
    '*startnpctimer{ "<NPC name>" } |',
    '              { <Attach Flag> };',
    '',
    'Timers.',
    '---------------------------------------',
    '*not_an_entry in the middle of a paragraph',
  ].join('\r\n')

  it('splits entries and keeps signatures, body and examples', () => {
    const docs = parseCommandDocs(text)
    const mes = docs.get('mes')!
    assert.deepEqual(mes.signatures, ['mes "<string>"{,"<string>"{,...}};'])
    assert.equal(mes.body, 'Displays a box with the string.\n\n\tmes "Hello";')
  })

  it('shares one entry between signatures written together', () => {
    const docs = parseCommandDocs(text)
    assert.equal(docs.get('getitem'), docs.get('getitem2'))
    assert.equal(docs.get('getitem')!.body, 'Gives items.')
  })

  it('joins signatures that go on in the next line', () => {
    const docs = parseCommandDocs(text)
    assert.equal(docs.get('stopnpctimer'), docs.get('startnpctimer'))
    assert.deepEqual(docs.get('startnpctimer')!.signatures, [
      'stopnpctimer{ "<NPC name>" } | { <Detach Flag> };',
      'startnpctimer{ "<NPC name>" } | { <Attach Flag> };',
    ])
    assert.equal(docs.get('startnpctimer')!.body, 'Timers.')
  })

  it('starts an entry after a blank line, even without a separator', () => {
    const docs = parseCommandDocs(text)
    assert.equal(docs.get('next')!.body, 'Shows a next button.')
  })
})
