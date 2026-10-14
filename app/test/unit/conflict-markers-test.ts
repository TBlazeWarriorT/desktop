import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import { getStatus } from '../../src/lib/git/status'
import {
  findConflicts,
  getConflictLineKinds,
  getConflictMarkerCount,
} from '../../src/lib/conflict-markers'

describe('conflict markers', () => {
  it('finds merge and diff3 conflicts with their labels', () => {
    const lines = [
      'a',
      '<<<<<<< HEAD',
      'mine',
      '=======',
      'theirs',
      '>>>>>>> origin/main',
      'b',
      '<<<<<<< HEAD',
      'mine',
      '||||||| base',
      'old',
      '=======',
      '>>>>>>> 1a2b3c (Some commit)',
    ]
    const regions = findConflicts(lines)
    assert.deepStrictEqual(regions, [
      {
        start: 1,
        base: null,
        separator: 3,
        end: 5,
        currentLabel: 'HEAD',
        incomingLabel: 'origin/main',
      },
      {
        start: 7,
        base: 9,
        separator: 11,
        end: 12,
        currentLabel: 'HEAD',
        incomingLabel: '1a2b3c (Some commit)',
      },
    ])
    assert.deepStrictEqual(getConflictLineKinds(lines.length, regions), [
      undefined,
      'marker',
      'current',
      'marker',
      'incoming',
      'marker',
      undefined,
      'marker',
      'current',
      'marker',
      'base',
      'marker',
      'marker',
    ])
  })

  it('ignores unfinished blocks and look-alike lines', () => {
    const lines = [
      '<<<<<<<< eight',
      '=======',
      '<<<<<<< HEAD',
      'x',
      '=======',
      '<<<<<<< HEAD',
      'y',
      '=======',
      'z',
      '>>>>>>>',
    ]
    assert.deepStrictEqual(findConflicts(lines), [
      {
        start: 5,
        base: null,
        separator: 7,
        end: 9,
        currentLabel: 'HEAD',
        incomingLabel: '',
      },
    ])
  })

  it('reports leftover markers in files that are not conflicted', async t => {
    const repo = await setupEmptyRepository(t)
    const crlf = (...lines: string[]) => lines.join('\r\n') + '\r\n'
    await writeFile(join(repo.path, 'clean.txt'), crlf('a', 'b'))
    await writeFile(join(repo.path, 'left.txt'), crlf('a', 'b'))
    await exec(['add', '.'], repo.path)
    await exec(['commit', '-m', 'init'], repo.path)

    await writeFile(join(repo.path, 'clean.txt'), crlf('a  ', 'b', 'c'))
    await writeFile(
      join(repo.path, 'left.txt'),
      crlf('<<<<<<< HEAD', 'a', '=======', 'x', '>>>>>>> other', 'b')
    )

    const status = await getStatus(repo)
    const count = (path: string) =>
      getConflictMarkerCount(
        status!.workingDirectory.files.find(f => f.path === path)!.status
      )
    assert.equal(count('left.txt'), 3)
    assert.equal(count('clean.txt'), 0)
  })
})
