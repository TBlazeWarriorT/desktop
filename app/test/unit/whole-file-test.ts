import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import { AppFileStatusKind } from '../../src/models/status'
import { loadWholeFile } from '../../src/ui/diff/whole-file-lines'
import {
  getAvailableViewModes,
  getCurrentViewMode,
  getPrefsForViewMode,
} from '../../src/ui/diff/view-mode'

const all = { conflicts: true, file: true, preview: true }
const modified = { kind: AppFileStatusKind.Modified } as const

describe('view modes', () => {
  it('offers only what applies to the file', () => {
    assert.deepStrictEqual(getAvailableViewModes('a.txt', modified, all), [
      'diff',
      'file',
    ])
    assert.deepStrictEqual(getAvailableViewModes('README.md', modified, all), [
      'diff',
      'file',
      'preview',
    ])
    const deleted = { kind: AppFileStatusKind.Deleted } as const
    assert.deepStrictEqual(getAvailableViewModes('a.txt', deleted, all), [
      'diff',
    ])
    const conflicted = { ...modified, conflictMarkerCount: 3 }
    assert.deepStrictEqual(
      getAvailableViewModes('a.md', conflicted, { ...all, conflicts: false }),
      ['diff', 'file', 'preview']
    )
  })

  it('round-trips a choice through the stored preferences', () => {
    const modes = ['conflicts', 'diff', 'file', 'preview'] as const
    for (const mode of modes) {
      const prefs = getPrefsForViewMode(mode, modes)
      assert.equal(getCurrentViewMode(modes, prefs), mode)
    }
    // A file without Preview leaves that choice alone.
    assert.equal(
      getPrefsForViewMode('file', ['diff', 'file']).markdownPreview,
      undefined
    )
  })
})

describe('loadWholeFile', () => {
  it('reads from disk or from a commit', async t => {
    const repo = await setupEmptyRepository(t)
    await writeFile(join(repo.path, 'a.txt'), 'one\r\ntwo\n')
    await exec(['add', '.'], repo.path)
    await exec(['commit', '-q', '-m', 'init'], repo.path)
    await writeFile(join(repo.path, 'a.txt'), 'changed\n')
    await writeFile(join(repo.path, 'bin.dat'), Buffer.from([1, 0, 2]))

    const disk = await loadWholeFile(repo, 'a.txt', { kind: 'disk' })
    assert.deepStrictEqual(disk.lines, ['changed', ''])
    const head = await loadWholeFile(repo, 'a.txt', {
      kind: 'commit',
      commitish: 'HEAD',
    })
    assert.deepStrictEqual(head.lines, ['one', 'two', ''])

    assert.ok((await loadWholeFile(repo, 'bin.dat', { kind: 'disk' })).binary)
    assert.ok((await loadWholeFile(repo, 'nope', { kind: 'disk' })).missing)
    const notInCommit = await loadWholeFile(repo, 'bin.dat', {
      kind: 'commit',
      commitish: 'HEAD',
    })
    assert.ok(notInCommit.missing)
  })
})
