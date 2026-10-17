import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import { mkdtemp } from 'fs/promises'
import * as Os from 'os'
import { getCommits } from '../../../src/lib/git'
import {
  formatCommitPatch,
  formatSquashedPatch,
  writeCommitPatches,
} from '../../../src/lib/git/patch'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

describe('git/patch', () => {
  const setup = async (t: TestContext) => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    await makeCommit(repository, {
      commitMessage: 'Add a',
      entries: [{ path: 'a.txt', contents: 'one\n' }],
    })
    await makeCommit(repository, {
      commitMessage: 'Add b',
      entries: [{ path: 'b.txt', contents: 'bee\n' }],
    })
    await makeCommit(repository, {
      commitMessage: 'Grow a',
      entries: [{ path: 'a.txt', contents: 'one\ntwo\n' }],
    })
    const commits = [...(await getCommits(repository, 'HEAD', 5))].reverse()
    return { repository, commits }
  }

  it('squashes commits that are not adjacent, the root included', async t => {
    const { repository, commits } = await setup(t)
    const patch = await formatSquashedPatch(repository, [
      commits[0],
      commits[2],
    ])
    assert(patch.startsWith('Squashed from 2 commits:'))
    assert(patch.includes('+++ b/a.txt'))
    assert(patch.includes('+one\n+two\n'))
    assert(!patch.includes('b.txt'))
  })

  it("names a commit's patch after its summary", async t => {
    const { repository, commits } = await setup(t)
    const { patch, fileName } = await formatCommitPatch(
      repository,
      commits[2].sha
    )
    assert.equal(fileName, 'Grow-a.patch')
    assert(patch.includes('Subject: [PATCH] Grow a'))
  })

  it('writes one numbered file per commit', async t => {
    const { repository, commits } = await setup(t)
    const folder = await mkdtemp(Path.join(Os.tmpdir(), 'patch-test-'))
    const paths = await writeCommitPatches(repository, commits, folder)
    assert.deepEqual(
      paths.map(p => Path.basename(p)),
      ['0001-Add-a.patch', '0002-Add-b.patch', '0003-Grow-a.patch']
    )
  })
})
