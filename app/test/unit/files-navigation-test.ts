import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  canStepFilesLocation,
  recordFilesLocation,
  stepFilesLocation,
} from '../../src/lib/files-navigation'

describe('Files tab navigation', () => {
  it('goes back and forward like a browser', () => {
    const repo = 'repo-a'
    const a = { commitish: null, path: 'a.txt' }
    const b = { commitish: null, path: 'b.txt' }
    const c = { commitish: 'abc123', path: 'b.txt' }
    recordFilesLocation(repo, a)
    recordFilesLocation(repo, b)
    recordFilesLocation(repo, b) // the same place again: no new entry
    recordFilesLocation(repo, c)

    assert.equal(canStepFilesLocation(repo, 1), false)
    assert.deepEqual(stepFilesLocation(repo, -1), b)
    // Landing there is reported back, and must not cut the forward entries.
    recordFilesLocation(repo, b)
    assert.deepEqual(stepFilesLocation(repo, -1), a)
    assert.equal(stepFilesLocation(repo, -1), null)
    assert.deepEqual(stepFilesLocation(repo, 1), b)
    assert.deepEqual(stepFilesLocation(repo, 1), c)
  })

  it('drops the forward entries when going somewhere new', () => {
    const repo = 'repo-b'
    recordFilesLocation(repo, { commitish: null, path: 'a' })
    recordFilesLocation(repo, { commitish: null, path: 'b' })
    stepFilesLocation(repo, -1)
    recordFilesLocation(repo, { commitish: null, path: 'c' })
    assert.equal(canStepFilesLocation(repo, 1), false)
    assert.deepEqual(stepFilesLocation(repo, -1), {
      commitish: null,
      path: 'a',
    })
  })
})
