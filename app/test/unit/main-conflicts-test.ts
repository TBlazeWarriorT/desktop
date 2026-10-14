import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import { Repository } from '../../src/models/repository'
import { checkBranchAgainstMain } from '../../src/lib/git/main-conflicts'
import { GitStore } from '../../src/lib/stores'
import { shell } from '../helpers/test-app-shell'
import { TestStatsStore } from '../helpers/test-stats-store'

async function run(repo: Repository, ...args: string[]) {
  const r = await exec(args, repo.path)
  assert.equal(r.exitCode, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

async function commit(repo: Repository, file: string, content: string) {
  await writeFile(join(repo.path, file), content)
  await run(repo, 'add', '.')
  await run(repo, 'commit', '-q', '-m', `${file}: ${content.trim()}`)
  return run(repo, 'rev-parse', 'HEAD')
}

describe('checkBranchAgainstMain', () => {
  it('marks the commits from the one that starts conflicting', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo, 'config', 'core.autocrlf', 'false')
    await run(repo, 'checkout', '-q', '-b', 'main')
    await commit(repo, 'a.txt', 'base\n')
    await commit(repo, 'b.txt', 'base\n')

    // Pretend main moved on GitHub: a remote-tracking ref only.
    await run(repo, 'checkout', '-q', '-b', 'remote-main')
    await commit(repo, 'a.txt', 'changed on main\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await run(repo, 'checkout', '-q', 'main')

    await run(repo, 'checkout', '-q', '-b', 'feature')
    const clean = await commit(repo, 'b.txt', 'feature\n')
    const conflicting = await commit(repo, 'a.txt', 'changed on feature\n')
    const after = await commit(repo, 'c.txt', 'new\n')

    const result = await checkBranchAgainstMain(repo)
    assert.equal(result?.mainRef, 'origin/main')
    assert.deepStrictEqual(
      [...result!.conflicts],
      [
        [after, ['a.txt']],
        [conflicting, ['a.txt']],
        [clean, []],
      ]
    )
  })

  // allBranches drops remote branches a local one tracks; the branch dropdown's
  // ↓↑ and ⚠ need their tips anyway.
  it('keeps the tips of tracked remote branches', async t => {
    const repo = await setupEmptyRepository(t)
    await run(repo, 'checkout', '-q', '-b', 'main')
    const tip = await commit(repo, 'a.txt', 'x\n')
    await run(repo, 'remote', 'add', 'origin', 'https://example.invalid/r.git')
    await run(repo, 'update-ref', 'refs/remotes/origin/main', tip)
    await run(repo, 'config', 'branch.main.remote', 'origin')
    await run(repo, 'config', 'branch.main.merge', 'refs/heads/main')

    const store = new GitStore(repo, shell, new TestStatsStore())
    await store.loadBranches()
    assert.ok(!store.allBranches.some(b => b.name === 'origin/main'))
    assert.equal(store.remoteTips.get('origin/main'), tip)
  })

  it('does nothing without a remote main', async t => {
    const repo = await setupEmptyRepository(t)
    await commit(repo, 'a.txt', 'x\n')
    assert.equal(await checkBranchAgainstMain(repo), null)
  })
})
