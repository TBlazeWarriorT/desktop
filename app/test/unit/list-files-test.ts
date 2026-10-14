import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import {
  comparePaths,
  getFileTreeRows,
  listRepositoryFiles,
} from '../../src/lib/git/list-files'

describe('repository files', () => {
  it('sorts folders before files at each level', () => {
    const paths = ['b.txt', 'a/z.txt', 'A.md', 'a/b/c.txt', 'c/d.txt']
    assert.deepStrictEqual([...paths].sort(comparePaths), [
      'a/b/c.txt',
      'a/z.txt',
      'c/d.txt',
      'A.md',
      'b.txt',
    ])
  })

  it('shows only the open folders in the tree', () => {
    const paths = ['npc/custom/a.txt', 'npc/custom/b.txt', 'npc/x.txt', 'r.md']
    const rows = (expanded: string[]) =>
      getFileTreeRows(paths, new Set(expanded)).map(
        r => `${'  '.repeat(r.depth)}${r.name}${r.isFolder ? '/' : ''}`
      )
    assert.deepStrictEqual(rows([]), ['npc/', 'r.md'])
    assert.deepStrictEqual(rows(['npc']), [
      'npc/',
      '  custom/',
      '  x.txt',
      'r.md',
    ])
    assert.deepStrictEqual(rows(['npc', 'npc/custom']), [
      'npc/',
      '  custom/',
      '    a.txt',
      '    b.txt',
      '  x.txt',
      'r.md',
    ])
  })

  it('lists the working directory or a commit', async t => {
    const repo = await setupEmptyRepository(t)
    await mkdir(join(repo.path, 'src'))
    await writeFile(join(repo.path, 'src', 'a.txt'), 'a')
    await writeFile(join(repo.path, '.gitignore'), 'ignored.log\n')
    await exec(['add', '.'], repo.path)
    await exec(['commit', '-q', '-m', 'init'], repo.path)
    await writeFile(join(repo.path, 'new.txt'), 'untracked')
    await writeFile(join(repo.path, 'ignored.log'), 'x')

    assert.deepStrictEqual(await listRepositoryFiles(repo, null), [
      'src/a.txt',
      '.gitignore',
      'new.txt',
    ])
    assert.deepStrictEqual(await listRepositoryFiles(repo, 'HEAD'), [
      'src/a.txt',
      '.gitignore',
    ])
  })
})
