import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { mkdir, readFile, symlink, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { setupEmptyRepository } from '../helpers/repositories'
import { formatIncomingLines } from '../../src/lib/format-incoming'

describe('formatIncomingLines', () => {
  it("fixes only the incoming lines, with the project's Prettier", async t => {
    const repository = await setupEmptyRepository(t)
    const run = (...args: string[]) => exec(args, repository.path)
    const file = join(repository.path, 'render.js')

    // The project's Prettier: this repo's own, linked in.
    await mkdir(join(repository.path, 'node_modules'))
    await symlink(
      resolve(__dirname, '../../../node_modules/prettier'),
      join(repository.path, 'node_modules', 'prettier'),
      'junction'
    )
    await writeFile(
      join(repository.path, '.prettierrc.json'),
      '{ "useTabs": true, "singleQuote": true }\n'
    )
    await writeFile(join(repository.path, '.gitignore'), 'node_modules\n')

    // Old code that Prettier would change too, but must be left alone.
    const old = ['function f(a) {', '\tvar x = "old style"', '\treturn x', '}']
    await writeFile(file, old.join('\n') + '\n')
    await run('add', '.')
    await run('commit', '-m', 'base')
    const before = (await run('rev-parse', 'HEAD')).stdout.trim()

    // Incoming lines with the wrong indentation, as an ignore-space merge
    // brings them.
    const incoming = ['\t\t\tif (a) {', "\t\t\t\tx = 'new';", '\t\t\t}']
    await writeFile(
      file,
      [...old.slice(0, 2), ...incoming, ...old.slice(2)].join('\n') + '\n'
    )
    await run('commit', '-am', 'incoming')

    const changed = await formatIncomingLines(repository, before)

    assert.deepEqual(changed, ['render.js'])
    assert.equal(
      await readFile(file, 'utf8'),
      [
        'function f(a) {',
        '\tvar x = "old style"',
        '\tif (a) {',
        "\t\tx = 'new';",
        '\t}',
        '\treturn x',
        '}',
        '',
      ].join('\n')
    )
  })

  it('does nothing without the project having Prettier', async t => {
    const repository = await setupEmptyRepository(t)
    const run = (...args: string[]) => exec(args, repository.path)
    await writeFile(join(repository.path, 'a.js'), 'a\n')
    await run('add', '.')
    await run('commit', '-m', 'base')
    const before = (await run('rev-parse', 'HEAD')).stdout.trim()
    await writeFile(join(repository.path, 'a.js'), 'a\n\t\t\tb\n')
    await run('commit', '-am', 'incoming')

    assert.deepEqual(await formatIncomingLines(repository, before), [])
  })
})
