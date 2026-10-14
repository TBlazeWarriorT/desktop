import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Local and remote branches that contain the commit: the current branch first,
 * then locals, then remotes. Symbolic refs (`origin/HEAD`) are left out.
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
      '--format=%(refname)%00%(refname:short)%00%(symref)%00%(HEAD)',
      'refs/heads',
      'refs/remotes',
    ],
    repository.path,
    'getBranchesContaining'
  )
  const current = new Array<string>()
  const local = new Array<string>()
  const remote = new Array<string>()
  for (const line of stdout.split('\n')) {
    const [ref, name, symref, head] = line.split('\0')
    if (!ref || symref) {
      continue
    }
    const list =
      head === '*' ? current : ref.startsWith('refs/heads/') ? local : remote
    list.push(name)
  }
  return [...current, ...local, ...remote]
}
