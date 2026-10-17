import * as Path from 'path'
import * as Os from 'os'
import { mkdtemp, rm } from 'fs/promises'
import { git } from './core'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'

const EmptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** The commit's patch as `git am` takes it, and git's name for its file. */
export async function formatCommitPatch(repository: Repository, sha: string) {
  const { stdout: patch } = await git(
    ['format-patch', '-1', '--binary', '--stdout', sha],
    repository.path,
    'formatCommitPatch'
  )
  const { stdout: name } = await git(
    ['log', '-1', '--format=%f', sha],
    repository.path,
    'formatCommitPatch'
  )
  return { patch, fileName: `${name.trim().substring(0, 64)}.patch` }
}

/** One numbered file per commit (oldest first) in the folder; their paths. */
export async function writeCommitPatches(
  repository: Repository,
  commits: ReadonlyArray<Commit>,
  folder: string
) {
  const paths = new Array<string>()
  for (const [i, commit] of commits.entries()) {
    const args = ['format-patch', '-1', '--binary', commit.sha]
    args.push('--start-number', `${i + 1}`, '-o', folder)
    const { stdout } = await git(args, repository.path, 'writeCommitPatches')
    paths.push(stdout.trim())
  }
  return paths
}

/**
 * The commits (oldest first, not necessarily adjacent) squashed into one plain
 * diff for `git apply`, built in a throwaway index; the list of commits leads.
 */
export async function formatSquashedPatch(
  repository: Repository,
  commits: ReadonlyArray<Commit>
) {
  const dir = await mkdtemp(Path.join(Os.tmpdir(), 'desktop-patch-'))
  const env = { GIT_INDEX_FILE: Path.join(dir, 'index') }
  const run = (args: string[], stdin?: string) =>
    git(args, repository.path, 'formatSquashedPatch', { env, stdin })
  const parentOf = (commit: Commit) => commit.parentSHAs[0] ?? EmptyTree

  try {
    const base = parentOf(commits[0])
    await run(['read-tree', base])
    for (const commit of commits) {
      const diff = await run(['diff', '--binary', parentOf(commit), commit.sha])
      if (diff.stdout !== '') {
        await run(['apply', '--cached', '--binary'], diff.stdout)
      }
    }
    const { stdout } = await run(['diff', '--cached', '--binary', base])
    const list = commits.map(c => `  ${c.shortSha} ${c.summary}`).join('\n')
    return `Squashed from ${commits.length} commits:\n${list}\n\n${stdout}`
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
