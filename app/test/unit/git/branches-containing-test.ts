import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { getBranchesContaining } from '../../../src/lib/git/branches-containing'

describe('getBranchesContaining', () => {
  it('lists the branches that contain a commit', async t => {
    const repository = await setupEmptyRepository(t)
    const run = (...args: string[]) => exec(args, repository.path)
    const commit = async (message: string) => {
      await writeFile(join(repository.path, 'file.txt'), message)
      await run('add', '.')
      await run('commit', '-m', message)
      return (await run('rev-parse', 'HEAD')).stdout.trim()
    }

    const base = await commit('base')
    await run('branch', 'other')
    const onMain = await commit('only on the first branch')

    assert.deepEqual(
      [...(await getBranchesContaining(repository, base))].sort(),
      ['master', 'other'].sort()
    )
    assert.deepEqual(await getBranchesContaining(repository, onMain), [
      'master',
    ])
  })
})
