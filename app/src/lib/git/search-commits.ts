import { git } from './core'
import { getCommits } from './log'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'

export type CommitMatch =
  | 'sha'
  | 'title'
  | 'description'
  | 'author'
  | 'code'
  /** No query: every commit that touched the file. */
  | 'path'

export interface ICommitSearchOptions {
  readonly query: string
  /** Also find commits whose added or removed lines contain the query. */
  readonly inCode: boolean
  readonly allBranches: boolean
  /** Only commits touching this file, following renames. */
  readonly path?: string | null
}

interface IStream {
  readonly args: ReadonlyArray<string>
  readonly batchSize: number
  skip: number
  buffer: Array<Commit>
  done: boolean
}

/**
 * Pages through the commits matching a query, newest first. Each kind of
 * match is its own `git log` (git ANDs --grep with --author), merged by date.
 * Create one per query; `next` must not be called concurrently.
 */
export class CommitSearch {
  private readonly streams: ReadonlyArray<IStream>
  private readonly seen = new Set<string>()
  /** Every name the file has had, resolved on the first fetch. */
  private paths: Promise<ReadonlyArray<string>> | null = null
  private shaChecked = false

  public constructor(
    private readonly repository: Repository,
    private readonly options: ICommitSearchOptions,
    /** Which kinds of match this search covers. */
    kinds: ReadonlyArray<'text' | 'code'>
  ) {
    const q = options.query
    const stream = (args: string[], batchSize: number): IStream => ({
      args,
      batchSize,
      skip: 0,
      buffer: [],
      done: false,
    })
    const streams = new Array<IStream>()
    if (q === '') {
      // Just a file's history: one plain log.
      streams.push(stream([], 100))
    } else if (kinds.includes('text')) {
      streams.push(stream(['-i', '-F', `--grep=${q}`], 100))
      streams.push(stream(['-i', '-F', `--author=${q}`], 100))
    }
    if (kinds.includes('code')) {
      // Pickaxe is slow on long histories: small batches show results sooner.
      streams.push(stream(['-i', `-S${q}`], 25))
    }
    this.streams = streams
    this.shaChecked = !kinds.includes('text') || !!options.path
  }

  public get isDone() {
    return (
      this.shaChecked && this.streams.every(s => s.done && !s.buffer.length)
    )
  }

  /** Up to `count` more matches, newest first, never repeating one. */
  public async next(count: number): Promise<ReadonlyArray<Commit>> {
    const results = new Array<Commit>()

    if (!this.shaChecked) {
      this.shaChecked = true
      const commit = await this.findBySha()
      if (commit !== null) {
        this.seen.add(commit.sha)
        results.push(commit)
      }
    }

    while (results.length < count) {
      await Promise.all(
        this.streams.filter(s => !s.done && !s.buffer.length).map(this.fill)
      )
      const newest = this.streams
        .filter(s => s.buffer.length > 0)
        .reduce<IStream | null>(
          (a, s) =>
            a === null ||
            s.buffer[0].committer.date > a.buffer[0].committer.date
              ? s
              : a,
          null
        )
      if (newest === null) {
        break
      }
      const commit = newest.buffer.shift()!
      if (!this.seen.has(commit.sha)) {
        this.seen.add(commit.sha)
        results.push(commit)
      }
    }
    return results
  }

  /** Where the query appears in the commit, for a hint next to it. */
  public matchOf(commit: Commit): CommitMatch {
    const q = this.options.query.toLowerCase()
    const has = (text: string) => text.toLowerCase().includes(q)
    if (q === '') {
      return 'path'
    } else if (commit.sha.startsWith(q)) {
      return 'sha'
    } else if (has(commit.summary)) {
      return 'title'
    } else if (has(commit.body)) {
      return 'description'
    } else if (has(`${commit.author.name} <${commit.author.email}>`)) {
      return 'author'
    }
    return 'code'
  }

  private fill = async (stream: IStream) => {
    const { allBranches } = this.options
    const commits = await getCommits(
      this.repository,
      allBranches ? undefined : 'HEAD',
      stream.batchSize,
      stream.skip,
      [...(allBranches ? ['--branches', '--remotes'] : []), ...stream.args],
      await this.getPaths()
    )
    stream.skip += commits.length
    stream.buffer.push(...commits)
    stream.done = commits.length < stream.batchSize
  }

  /**
   * --follow loses a rename once --grep/--author/-S filter out the commit
   * that made it, so look up the old names first and search all of them.
   */
  private getPaths() {
    const { path, allBranches } = this.options
    if (!path) {
      return Promise.resolve([])
    }
    this.paths ??= git(
      [
        'log',
        '--follow',
        '--name-only',
        '--format=',
        ...(allBranches ? ['--branches', '--remotes'] : ['HEAD']),
        '--',
        path,
      ],
      this.repository.path,
      'getFileNames'
    ).then(r => [
      ...new Set([path, ...r.stdout.split('\n').filter(l => l !== '')]),
    ])
    return this.paths
  }

  private async findBySha(): Promise<Commit | null> {
    const q = this.options.query.trim()
    if (!/^[0-9a-f]{4,40}$/i.test(q)) {
      return null
    }
    const r = await git(
      ['rev-parse', '--verify', '-q', `${q}^{commit}`],
      this.repository.path,
      'findCommitBySha',
      { successExitCodes: new Set([0, 1, 128]) }
    )
    if (r.exitCode !== 0) {
      return null
    }
    const [commit] = await getCommits(this.repository, r.stdout.trim(), 1)
    return commit ?? null
  }
}
