import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  countCommitsAbove,
  isInCurrentHistory,
} from '../../../src/lib/git/commit-position'

describe('commit position', () => {
  it('finds commits in the current branch and how deep they are', async t => {
    const repository = await setupEmptyRepository(t)
    const run = (...args: string[]) => exec(args, repository.path)
    const commit = async (message: string) => {
      await writeFile(join(repository.path, 'file.txt'), message)
      await run('add', '.')
      await run('commit', '-m', message)
      return (await run('rev-parse', 'HEAD')).stdout.trim()
    }

    const first = await commit('first')
    await run('checkout', '-b', 'side')
    const onSide = await commit('only on side')
    await run('checkout', '-')
    await commit('second')
    const head = await commit('third')

    assert.equal(await isInCurrentHistory(repository, first), true)
    assert.equal(await isInCurrentHistory(repository, onSide), false)
    assert.equal(await countCommitsAbove(repository, first), 2)
    assert.equal(await countCommitsAbove(repository, head), 0)
  })
})
