import { describe, it } from 'node:test'
import assert from 'node:assert'
import { findConflicts } from '../../src/lib/conflict-markers'
import { resolveConflict } from '../../src/lib/conflict-resolution'

describe('resolveConflict', () => {
  const merge = ['<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> b']
  const diff3 = [
    '<<<<<<< HEAD',
    'mine',
    '||||||| base',
    'old',
    '=======',
    'theirs 1',
    'theirs 2',
    '>>>>>>> b',
  ]

  it('keeps one side or both, without markers', () => {
    const [region] = findConflicts(merge)
    assert.deepEqual(resolveConflict(merge, region, 'current'), ['mine'])
    assert.deepEqual(resolveConflict(merge, region, 'incoming'), ['theirs'])
    assert.deepEqual(resolveConflict(merge, region, 'both'), ['mine', 'theirs'])
    assert.deepEqual(resolveConflict(merge, region, 'both-reversed'), [
      'theirs',
      'mine',
    ])
  })

  it('leaves the diff3 base out', () => {
    const [region] = findConflicts(diff3)
    assert.deepEqual(resolveConflict(diff3, region, 'current'), ['mine'])
    assert.deepEqual(resolveConflict(diff3, region, 'incoming'), [
      'theirs 1',
      'theirs 2',
    ])
  })
})
