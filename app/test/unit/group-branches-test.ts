import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupBranches } from '../../src/ui/branches'
import { Branch, BranchType } from '../../src/models/branch'
import { CommitIdentity } from '../../src/models/commit-identity'

describe('Branches grouping', () => {
  const author = new CommitIdentity('Hubot', 'hubot@github.com', new Date())

  const branchTip = {
    sha: '300acef',
    author,
  }

  const currentBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const defaultBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const recentBranches = [
    new Branch('some-recent-branch', null, branchTip, BranchType.Local, ''),
  ]
  const otherBranch = new Branch(
    'other-branch',
    null,
    branchTip,
    BranchType.Local,
    ''
  )

  const allBranches = [currentBranch, ...recentBranches, otherBranch]

  it('should group branches', () => {
    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches
    )
    assert.equal(groups.length, 3)

    assert.equal(groups[0].identifier, 'default')
    let items = groups[0].items
    assert.equal(items[0].branch, defaultBranch)

    assert.equal(groups[1].identifier, 'recent')
    items = groups[1].items
    assert.equal(items[0].branch, recentBranches[0])

    assert.equal(groups[2].identifier, 'other')
    items = groups[2].items
    assert.equal(items[0].branch, otherBranch)
  })

  it('lists remote branches by remote, origin first, collapsed unless expanded', () => {
    const remote = (name: string) =>
      new Branch(
        name,
        null,
        branchTip,
        BranchType.Remote,
        `refs/remotes/${name}`
      )
    const originMaster = remote('origin/master')
    const upstreamDev = remote('upstream/dev')
    const aOld = remote('a-remote/old')

    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      [...allBranches, upstreamDev],
      recentBranches,
      [upstreamDev, originMaster, aOld],
      new Set(['upstream'])
    )

    assert.deepEqual(
      groups.map(g => [g.identifier, g.collapsed]),
      [
        ['default', undefined],
        ['recent', undefined],
        ['other', undefined],
        ['remote:origin', true],
        ['remote:a-remote', true],
        ['remote:upstream', false],
      ]
    )
    // Remote branches leave "Other" for their remote's group.
    assert.deepEqual(
      groups[2].items.map(i => i.branch),
      [otherBranch]
    )
    assert.deepEqual(
      groups[3].items.map(i => i.branch),
      [originMaster]
    )
  })
})
