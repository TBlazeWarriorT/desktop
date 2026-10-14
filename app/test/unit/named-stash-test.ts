import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec, GitError as DugiteError } from 'dugite'
import { GitError } from '../../src/lib/git/core'
import { setupEmptyRepository } from '../helpers/repositories'
import { Repository } from '../../src/models/repository'
import { getStatus } from '../../src/lib/git/status'
import { getConflictMarkerCount } from '../../src/lib/conflict-markers'
import {
  createDesktopStashEntry,
  getStashes,
  popStashEntry,
} from '../../src/lib/git/stash'
import {
  applyStashEntry,
  mergeStashWithLocalChanges,
  renameStashEntry,
} from '../../src/lib/git/stash-extras'

async function run(repo: Repository, ...args: string[]) {
  const r = await exec(args, repo.path)
  assert.equal(r.exitCode, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

const write = (repo: Repository, file: string, content: string) =>
  writeFile(join(repo.path, file), content)
const read = (repo: Repository, file: string) =>
  readFile(join(repo.path, file), 'utf8')

async function setup(t: TestContext) {
  const repo = await setupEmptyRepository(t)
  await run(repo, 'config', 'core.autocrlf', 'false')
  await run(repo, 'checkout', '-q', '-b', 'main')
  await write(repo, 'a.txt', 'a\n')
  await write(repo, 'b.txt', 'b\n')
  await run(repo, 'add', '.')
  await run(repo, 'commit', '-m', 'init')
  return repo
}

describe('named stashes', () => {
  it('keeps every stash of a branch, with names', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'first\n')
    await createDesktopStashEntry(repo, 'main', [], { title: 'First try' })
    await write(repo, 'a.txt', 'second\n')
    await createDesktopStashEntry(repo, 'main', [])

    const { allEntries, desktopEntries } = await getStashes(repo)
    assert.deepStrictEqual(
      allEntries.map(e => [e.title, e.branchName, e.isDesktopEntry]),
      [
        ['', 'main', true],
        ['First try', 'main', true],
      ]
    )
    // The official Desktop's marker still matches named stashes.
    assert.equal(desktopEntries.length, 2)
  })

  it('lists stashes made outside Desktop and pops them', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'cli\n')
    await run(repo, 'stash', 'push', '-m', 'from the terminal')

    const [cli] = (await getStashes(repo)).allEntries
    assert.equal(cli.title, 'from the terminal')
    assert.equal(cli.branchName, 'main')
    assert.equal(cli.isDesktopEntry, false)

    await popStashEntry(repo, cli.stashSha)
    assert.equal(await read(repo, 'a.txt'), 'cli\n')
    assert.equal((await getStashes(repo)).allEntries.length, 0)
  })

  it('stashes only the given paths, untracked included', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'changed a\n')
    await write(repo, 'b.txt', 'changed b\n')
    await write(repo, 'new.txt', 'new\n')
    await run(repo, 'add', 'new.txt')
    await createDesktopStashEntry(repo, 'main', [], {
      title: 'Only a',
      paths: ['a.txt', 'new.txt'],
    })

    assert.equal(await read(repo, 'a.txt'), 'a\n')
    assert.equal(await read(repo, 'b.txt'), 'changed b\n')
    assert.equal(await run(repo, 'status', '--porcelain'), 'M b.txt')
  })

  it('applies a stash and keeps it', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'kept\n')
    await createDesktopStashEntry(repo, 'main', [], { title: 'Keep me' })
    const [stash] = (await getStashes(repo)).allEntries

    await applyStashEntry(repo, stash.stashSha)
    assert.equal(await read(repo, 'a.txt'), 'kept\n')
    assert.equal((await getStashes(repo)).allEntries.length, 1)
  })

  it('fails like pop when local changes are in the way', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'Test\n')
    await createDesktopStashEntry(repo, 'main', [], { title: 'Test' })
    await write(repo, 'a.txt', 'Also a test\n')
    const [stash] = (await getStashes(repo)).allEntries

    await assert.rejects(applyStashEntry(repo, stash.stashSha), e => {
      assert.ok(e instanceof GitError)
      assert.equal(e.result.gitError, DugiteError.MergeWithLocalChanges)
      return true
    })
    assert.equal(await read(repo, 'a.txt'), 'Also a test\n')
    assert.equal((await getStashes(repo)).allEntries.length, 1)
  })

  it('merges a stash with conflicting local changes', async t => {
    for (const keep of [false, true]) {
      const repo = await setup(t)
      await write(repo, 'a.txt', 'Test\n')
      await createDesktopStashEntry(repo, 'main', [], { title: 'Test' })
      await write(repo, 'a.txt', 'Also a test\n')
      await write(repo, 'b.txt', 'mine only\n')
      await write(repo, 'new.txt', 'untracked\n')
      const [stash] = (await getStashes(repo)).allEntries

      await mergeStashWithLocalChanges(repo, stash, keep)

      assert.equal(
        await read(repo, 'a.txt'),
        '<<<<<<< Your changes\nAlso a test\n=======\nTest\n>>>>>>> Stash "Test"\n'
      )
      // Shows up with the leftover-markers alert and the conflict view.
      const status = await getStatus(repo)
      const a = status!.workingDirectory.files.find(f => f.path === 'a.txt')!
      assert.equal(getConflictMarkerCount(a.status), 3)
      assert.equal(await read(repo, 'b.txt'), 'mine only\n')
      assert.equal(await read(repo, 'new.txt'), 'untracked\n')
      const left = (await getStashes(repo)).allEntries.map(e => e.title)
      assert.deepStrictEqual(left, keep ? ['Test'] : [])
    }
  })

  it('renames a stash keeping its content, date and branch', async t => {
    const repo = await setup(t)
    await write(repo, 'a.txt', 'one\n')
    await createDesktopStashEntry(repo, 'main', [], { title: 'Old' })
    await write(repo, 'b.txt', 'two\n')
    await run(repo, 'stash', 'push', '-m', 'cli')

    const before = (await getStashes(repo)).allEntries
    const old = before.find(e => e.title === 'Old')!
    const newSha = await renameStashEntry(repo, old, 'New name')

    const after = (await getStashes(repo)).allEntries
    assert.equal(after.length, 2)
    const renamed = after.find(e => e.stashSha === newSha)!
    assert.equal(renamed.title, 'New name')
    assert.equal(renamed.branchName, 'main')
    assert.equal(renamed.isDesktopEntry, true)
    assert.equal(renamed.tree, old.tree)
    assert.equal(renamed.createdAt?.getTime(), old.createdAt?.getTime())
    // Time zone included, not just the instant.
    const rawDate = (sha: string) =>
      run(repo, 'show', '-s', '--format=%ad', '--date=raw', sha)
    assert.equal(await rawDate(newSha), await rawDate(old.stashSha))
    assert.ok(after.some(e => e.title === 'cli'))
  })
})
