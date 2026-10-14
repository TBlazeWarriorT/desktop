import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Local and remote branches that contain the commit, locals first. Symbolic
 * refs (`origin/HEAD`) are left out.
 */
export async function getBranchesContaining(
  repository: Repository,
  sha: string
): Promise<ReadonlyArray<string>> {
  const { stdout } = await git(
    [
      'for-each-ref',
      '--contains',
      sha,
      '--format=%(refname)%00%(refname:short)%00%(symref)',
      'refs/heads',
      'refs/remotes',
    ],
    repository.path,
    'getBranchesContaining'
  )
  const local = new Array<string>()
  const remote = new Array<string>()
  for (const line of stdout.split('\n')) {
    const [ref, name, symref] = line.split('\0')
    if (!ref || symref) {
      continue
    }
    ;(ref.startsWith('refs/heads/') ? local : remote).push(name)
  }
  return [...local, ...remote]
}
