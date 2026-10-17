import { describe, it } from 'node:test'
import assert from 'node:assert'
import { detectIndentUnit } from '../../src/lib/indent-unit'

describe('detectIndentUnit', () => {
  it('finds tabs, spaces, and defaults to a tab', () => {
    const tab = String.fromCharCode(9)
    assert.equal(
      detectIndentUnit(['a {', tab + 'b', tab + tab + 'c', '}'].join('\n')),
      tab
    )
    assert.equal(
      detectIndentUnit(['a {', '  b', '    c', '}'].join('\r\n')),
      '  '
    )
    assert.equal(
      detectIndentUnit(['a {', '    b', '        c'].join('\n')),
      '    '
    )
    assert.equal(detectIndentUnit('no indentation at all'), tab)
  })
})
