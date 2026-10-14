import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isMarkdownFile, resolveImagePath } from '../../src/lib/markdown-files'

describe('markdown preview', () => {
  it('recognizes markdown files', () => {
    assert.ok(isMarkdownFile('README.md'))
    assert.ok(isMarkdownFile('docs/Guide.MARKDOWN'))
    assert.ok(!isMarkdownFile('notes.mdx'))
    assert.ok(!isMarkdownFile('md/file.txt'))
  })

  it('resolves image paths relative to the markdown file', () => {
    assert.equal(resolveImagePath('img/a.png', 'docs/x.md'), 'docs/img/a.png')
    assert.equal(resolveImagePath('../a.png', 'docs/x.md'), 'a.png')
    assert.equal(resolveImagePath('./a b.png', 'x.md'), 'a b.png')
    assert.equal(resolveImagePath('a%20b.png?raw=1', 'x.md'), 'a b.png')
  })

  it('treats a leading slash as the repository root', () => {
    assert.equal(resolveImagePath('/assets/a.png', 'docs/x.md'), 'assets/a.png')
  })

  it('ignores URLs and paths outside the repository', () => {
    assert.equal(resolveImagePath('https://x.io/a.png', 'x.md'), null)
    assert.equal(resolveImagePath('data:image/png;base64,AA', 'x.md'), null)
    assert.equal(resolveImagePath('//cdn.io/a.png', 'x.md'), null)
    assert.equal(resolveImagePath('#anchor', 'x.md'), null)
    assert.equal(resolveImagePath('../../a.png', 'docs/x.md'), null)
    assert.equal(resolveImagePath('%E0%A4%A.png', 'x.md'), null)
  })
})
