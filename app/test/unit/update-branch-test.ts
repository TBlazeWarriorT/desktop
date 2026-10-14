import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import { Repository } from '../../src/models/repository'
import { updateBranchFromUpstream } from '../../src/lib/git/update-branch'

async function run(repo: Repository, ...args: string[]) {
  const r = await exec(args, repo.path)
  assert.equal(r.exitCode, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

/** A commit on top of `parent` writing `file`, without touching the worktree. */
async function commit(
  repo: Repository,
  parent: string | null,
  file: string,
  content: string
) {
  const blob = (
    await exec(['hash-object', '-w', '--stdin'], repo.path, { stdin: content })
  ).stdout.trim()
  const base = parent === null ? '' : `${parent}^{tree}`
  const index = `${repo.path}/.git/tmp-index`
  const env = { GIT_INDEX_FILE: index }
  await exec(['read-tree', ...(base ? [base] : ['--empty'])], repo.path, {
    env,
  })
  await exec(
    ['update-index', '--add', '--cacheinfo', `100644,${blob},${file}`],
    repo.path,
    { env }
  )
  const tree = (await exec(['write-tree'], repo.path, { env })).stdout.trim()
  const parents = parent === null ? [] : ['-p', parent]
  return run(repo, 'commit-tree', tree, ...parents, '-m', `${file}: ${content}`)
}

/**
 * master is checked out; `feature` and `origin/feature` start from `base`.
 * Returns the repo plus the base commit.
 */
async function setup(t: TestContext) {
  const repo = await setupEmptyRepository(t)
  const base = await commit(repo, null, 'shared.txt', 'base\n')
  await run(repo, 'update-ref', 'refs/heads/master', base)
  await run(repo, 'reset', '--hard', 'master')
  await run(repo, 'update-ref', 'refs/heads/feature', base)
  await run(repo, 'update-ref', 'refs/remotes/origin/feature', base)
  return { repo, base }
}

const tipOf = (repo: Repository, ref: string) => run(repo, 'rev-parse', ref)

describe('updateBranchFromUpstream', () => {
  it('fast-forwards a branch that is only behind', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'b.txt', 'remote\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'fast-forwarded')
    assert.equal(await tipOf(repo, 'feature'), remote)
    assert.equal(await run(repo, 'symbolic-ref', 'HEAD'), 'refs/heads/master')
  })

  it('leaves a branch that is only ahead alone', async t => {
    const { repo, base } = await setup(t)
    const local = await commit(repo, base, 'c.txt', 'local\n')
    await run(repo, 'update-ref', 'refs/heads/feature', local)

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'up-to-date')
    assert.equal(await tipOf(repo, 'feature'), local)
  })

  it('merges a diverged branch without checking it out', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'b.txt', 'remote\n')
    const local = await commit(repo, base, 'c.txt', 'local\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)
    await run(repo, 'update-ref', 'refs/heads/feature', local)

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'merged')
    const parents = await run(repo, 'rev-list', '--parents', '-n1', 'feature')
    assert.deepEqual(parents.split(' ').slice(1), [local, remote])
    const files = await run(repo, 'ls-tree', '--name-only', 'feature')
    assert.deepEqual(files.split('\n').sort(), ['b.txt', 'c.txt', 'shared.txt'])
    assert.equal(await run(repo, 'status', '--porcelain'), '')
  })

  it('rebases when pull.rebase is set', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'b.txt', 'remote\n')
    const local = await commit(repo, base, 'c.txt', 'local\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)
    await run(repo, 'update-ref', 'refs/heads/feature', local)
    await run(repo, 'config', 'pull.rebase', 'true')

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'rebased')
    assert.equal(await tipOf(repo, 'feature~1'), remote)
    const files = await run(repo, 'ls-tree', '--name-only', 'feature')
    assert.deepEqual(files.split('\n').sort(), ['b.txt', 'c.txt', 'shared.txt'])
  })

  it('reports conflicts and leaves the branch untouched', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'shared.txt', 'remote\n')
    const local = await commit(repo, base, 'shared.txt', 'local\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)
    await run(repo, 'update-ref', 'refs/heads/feature', local)

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'conflicts')
    assert.equal(await tipOf(repo, 'feature'), local)
  })

  it('respects pull.ff=only for diverged branches', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'b.txt', 'remote\n')
    const local = await commit(repo, base, 'c.txt', 'local\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)
    await run(repo, 'update-ref', 'refs/heads/feature', local)
    await run(repo, 'config', 'pull.ff', 'only')

    const r = await updateBranchFromUpstream(repo, 'feature', 'origin/feature')

    assert.equal(r.kind, 'needs-merge')
    assert.equal(await tipOf(repo, 'feature'), local)
  })

  it('refuses a branch that is checked out', async t => {
    const { repo, base } = await setup(t)
    const remote = await commit(repo, base, 'b.txt', 'remote\n')
    await run(repo, 'update-ref', 'refs/remotes/origin/feature', remote)

    const r = await updateBranchFromUpstream(repo, 'master', 'origin/feature')

    assert.equal(r.kind, 'checked-out')
  })
})
