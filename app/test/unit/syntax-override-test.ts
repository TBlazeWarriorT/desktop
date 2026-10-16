import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getSyntaxLabel,
  getSyntaxOverride,
  onSyntaxOverrideChanged,
  setSyntaxOverride,
} from '../../src/lib/syntax-override'

describe('syntax override', () => {
  it('is remembered per repository and path, and announced', () => {
    let changes = 0
    const unsubscribe = onSyntaxOverrideChanged(() => changes++)

    setSyntaxOverride('C:/repo', 'doc/notes.txt', 'rathena')
    assert.equal(getSyntaxOverride('C:/repo', 'doc/notes.txt'), 'rathena')
    assert.equal(getSyntaxOverride('C:/repo', 'doc/other.txt'), undefined)
    assert.equal(getSyntaxOverride('C:/other', 'doc/notes.txt'), undefined)
    assert.equal(getSyntaxLabel('rathena'), 'rAthena script')

    setSyntaxOverride('C:/repo', 'doc/notes.txt', null)
    assert.equal(getSyntaxOverride('C:/repo', 'doc/notes.txt'), undefined)
    assert.equal(getSyntaxLabel(undefined), 'Auto')

    unsubscribe()
    setSyntaxOverride('C:/repo', 'a.txt', 'plain')
    assert.equal(changes, 2)
  })
})
