import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../helpers/repositories'
import { Repository } from '../../src/models/repository'
import { CommitSearch } from '../../src/lib/git/search-commits'

async function run(
  repo: Repository,
  args: string[],
  env: Record<string, string> = {}
) {
  const r = await exec(args, repo.path, { env })
  assert.equal(r.exitCode, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

let clock = 1_700_000_000
async function commit(
  repo: Repository,
  message: string,
  content: string,
  author = 'Someone <someone@example.com>'
) {
  await writeFile(join(repo.path, 'f.txt'), content)
  await run(repo, ['add', '.'])
  const date = `@${clock++} +0000`
  await run(repo, ['commit', '-q', '-m', message, `--author=${author}`], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  })
  return run(repo, ['rev-parse', 'HEAD'])
}

async function setup(t: TestContext) {
  const repo = await setupEmptyRepository(t)
  await run(repo, ['config', 'core.autocrlf', 'false'])
  await commit(repo, 'Initial', 'a\n')
  await commit(repo, 'Fix the healer', 'b\n')
  await commit(repo, 'Tweak\n\nThe healer was too cheap.', 'c\n')
  await commit(repo, 'Unrelated', 'd\n', 'Healer Fan <fan@example.com>')
  await commit(repo, 'Add a script', 'getitem Red_Potion\n')
  await commit(repo, 'Other', 'nothing\n')
  return repo
}

const titles = (commits: ReadonlyArray<{ summary: string }>) =>
  commits.map(c => c.summary)

describe('CommitSearch', () => {
  it('finds title, description and author matches, newest first', async t => {
    const repo = await setup(t)
    const search = new CommitSearch(
      repo,
      { query: 'HEALER', inCode: false, allBranches: false },
      ['text']
    )
    const commits = await search.next(10)
    assert.deepStrictEqual(titles(commits), [
      'Unrelated',
      'Tweak',
      'Fix the healer',
    ])
    assert.deepStrictEqual(
      commits.map(c => search.matchOf(c)),
      ['author', 'description', 'title']
    )
    assert.ok(search.isDone)
  })

  it('pages without repeating', async t => {
    const repo = await setup(t)
    const search = new CommitSearch(
      repo,
      { query: 'e', inCode: false, allBranches: false },
      ['text']
    )
    const first = await search.next(2)
    const rest = await search.next(10)
    assert.equal(first.length, 2)
    const all = [...first, ...rest].map(c => c.sha)
    assert.equal(new Set(all).size, all.length)
    assert.ok(search.isDone)
  })

  it('finds code changes, which also covers removals', async t => {
    const repo = await setup(t)
    const search = new CommitSearch(
      repo,
      { query: 'GETITEM', inCode: true, allBranches: false },
      ['code']
    )
    const commits = await search.next(10)
    assert.deepStrictEqual(titles(commits), ['Other', 'Add a script'])
    assert.equal(search.matchOf(commits[0]), 'code')
  })

  it("lists a file's commits, across renames, with or without a query", async t => {
    const repo = await setup(t)
    await writeFile(join(repo.path, 'other.txt'), 'x\n')
    await run(repo, ['add', '.'])
    await run(repo, ['commit', '-q', '-m', 'Touch another file'])
    await run(repo, ['mv', 'f.txt', 'renamed.txt'])
    await run(repo, ['commit', '-q', '-m', 'Rename f'])

    const history = new CommitSearch(
      repo,
      { query: '', inCode: false, allBranches: false, path: 'renamed.txt' },
      ['text']
    )
    const all = await history.next(100)
    assert.equal(all[0].summary, 'Rename f')
    assert.ok(all.some(c => c.summary === 'Initial'))
    assert.ok(!all.some(c => c.summary === 'Touch another file'))
    assert.equal(history.matchOf(all[0]), 'path')

    const healer = new CommitSearch(
      repo,
      {
        query: 'healer',
        inCode: false,
        allBranches: false,
        path: 'renamed.txt',
      },
      ['text']
    )
    assert.deepStrictEqual(titles(await healer.next(100)), [
      'Unrelated',
      'Tweak',
      'Fix the healer',
    ])
  })

  it("lists a folder's commits", async t => {
    const repo = await setup(t)
    await mkdir(join(repo.path, 'npc'))
    await writeFile(join(repo.path, 'npc', 'a.txt'), 'a\n')
    await run(repo, ['add', '.'])
    await run(repo, ['commit', '-q', '-m', 'Add npc/a'])
    await writeFile(join(repo.path, 'npc', 'b.txt'), 'b\n')
    await run(repo, ['add', '.'])
    await run(repo, ['commit', '-q', '-m', 'Add npc/b'])

    const folder = new CommitSearch(
      repo,
      { query: '', inCode: false, allBranches: false, path: 'npc/' },
      ['text']
    )
    assert.deepStrictEqual(titles(await folder.next(100)), [
      'Add npc/b',
      'Add npc/a',
    ])
  })

  it('jumps to a commit by SHA prefix, even on another branch', async t => {
    const repo = await setup(t)
    await run(repo, ['checkout', '-q', '-b', 'side'])
    const side = await commit(repo, 'Side work', 'side\n')
    await run(repo, ['checkout', '-q', '-'])

    const bySha = new CommitSearch(
      repo,
      { query: side.slice(0, 8), inCode: false, allBranches: false },
      ['text']
    )
    const [found] = await bySha.next(10)
    assert.equal(found.sha, side)
    assert.equal(bySha.matchOf(found), 'sha')

    const here = new CommitSearch(
      repo,
      { query: 'side work', inCode: false, allBranches: false },
      ['text']
    )
    assert.deepStrictEqual(titles(await here.next(10)), [])
    const everywhere = new CommitSearch(
      repo,
      { query: 'side work', inCode: false, allBranches: true },
      ['text']
    )
    assert.deepStrictEqual(titles(await everywhere.next(10)), ['Side work'])
  })
})
