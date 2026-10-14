import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { checkWhitespaceConflicts } from '../../../src/lib/git/whitespace-conflicts'
import {
  abortCherryPick,
  cherryPick,
  CherryPickResult,
} from '../../../src/lib/git/cherry-pick'

const indented = (tabs: number, lines: ReadonlyArray<string>) =>
  lines.map(l => (l === '' ? '' : '\t'.repeat(tabs) + l)).join('\n') + '\n'

const body = [
  '// No body',
  'if (a) {',
  '\tx = 1;',
  '}',
  '',
  '// Swap',
  'if (b) {',
  '\ty = 2;',
  '}',
]
const block = ['// Warp', 'if (c) {', '\tz = 3;', '}', '']

describe('cherryPick ignoring whitespace', () => {
  it('lands a commit on code that was reindented since', async t => {
    const repository = await setupEmptyRepository(t)
    const run = (...args: string[]) => exec(args, repository.path)
    const file = join(repository.path, 'render.js')
    const commitFile = async (content: string, message: string) => {
      await writeFile(file, content)
      await run('add', '.')
      await run('commit', '-m', message)
    }

    await commitFile(indented(3, body), 'base')
    await run('branch', 'target')
    await commitFile(
      indented(3, [...body.slice(0, 5), ...block, ...body.slice(5)]),
      'add warp'
    )
    const sha = (await run('rev-parse', 'HEAD')).stdout.trim()
    await run('checkout', 'target')
    await commitFile(indented(2, body), 'reindent')

    const commits = [{ sha, summary: 'add warp' }]
    const plain = await cherryPick(repository, commits)
    assert.equal(plain, CherryPickResult.ConflictsEncountered)
    // The conflicts dialog's hint: only whitespace stands in the way.
    assert.deepEqual(await checkWhitespaceConflicts(repository), {
      conflicted: 1,
      ignoringWhitespace: 0,
    })
    await abortCherryPick(repository)
    assert.equal(await checkWhitespaceConflicts(repository), null)

    const result = await cherryPick(repository, commits, undefined, [
      'ignore-space-change',
    ])
    assert.equal(result, CherryPickResult.CompletedWithoutError)
    const content = await readFile(file, 'utf8')
    assert.ok(content.includes('// Warp'))
    assert.ok(content.indexOf('// Warp') < content.indexOf('// Swap'))
  })
})
