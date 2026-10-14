import * as React from 'react'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../dispatcher'
import { FancyTextBox } from '../lib/fancy-text-box'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  CommitMatch,
  CommitSearch,
  ICommitSearchOptions,
} from '../../lib/git/search-commits'

const PageSize = 100
const DebounceMs = 400
/** Load more when the list is scrolled within this many rows of the end. */
const CloseToBottomThreshold = 10

const matchLabels: Record<CommitMatch, string | undefined> = {
  sha: undefined,
  title: undefined,
  description: 'in description',
  author: 'by author',
  code: 'in code',
}

interface IHistorySearchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /** Opens the upstream "compare to branch" picker. */
  readonly onCompareClicked: () => void
  /** Renders the results with the History tab's own commit list. */
  readonly renderResults: (
    commitSHAs: ReadonlyArray<string>,
    onScroll: (start: number, end: number) => void,
    emptyListMessage: string,
    searchMatches: ReadonlyMap<string, string>
  ) => JSX.Element
  /** The normal history, shown while there is no query. */
  readonly children: React.ReactNode
}

interface IHistorySearchState {
  readonly query: string
  readonly inCode: boolean
  readonly allBranches: boolean
  readonly optionsOpen: boolean
  readonly commits: ReadonlyArray<Commit>
  readonly searchingText: boolean
  readonly searchingCode: boolean
  readonly done: boolean
}

/**
 * Search box above the History list: commit message, author and SHA, plus
 * optionally code changes and every branch. Results load page by page.
 */
export class HistorySearch extends React.Component<
  IHistorySearchProps,
  IHistorySearchState
> {
  private textSearch: CommitSearch | null = null
  private codeSearch: CommitSearch | null = null
  private matches = new Map<string, string>()
  private debounceId: number | null = null
  private textbox: TextBox | null = null

  public constructor(props: IHistorySearchProps) {
    super(props)
    this.state = {
      query: '',
      inCode: false,
      allBranches: false,
      optionsOpen: false,
      commits: [],
      searchingText: false,
      searchingCode: false,
      done: false,
    }
  }

  public componentDidUpdate(prevProps: IHistorySearchProps) {
    if (prevProps.repository.id !== this.props.repository.id) {
      this.onQueryChanged('')
    }
  }

  public componentWillUnmount() {
    this.cancel()
  }

  public render() {
    const active = this.state.query.trim() !== ''
    return (
      <>
        {this.renderBar()}
        {this.state.optionsOpen && this.renderOptions()}
        {active ? this.renderResults() : this.props.children}
      </>
    )
  }

  private renderBar() {
    const { inCode, allBranches, optionsOpen } = this.state
    return (
      <div className="compare-form history-search-bar">
        <FancyTextBox
          ariaLabel="Search commits"
          symbol={octicons.search}
          displayClearButton={true}
          placeholder="Search commits…"
          value={this.state.query}
          onRef={this.onTextBoxRef}
          onValueChanged={this.onQueryChanged}
          onSearchCleared={this.onSearchCleared}
          onKeyDown={this.onKeyDown}
        />
        <Button
          className={classNames('history-search-options-button', {
            active: inCode || allBranches,
          })}
          ariaPressed={optionsOpen}
          ariaLabel="Search options"
          tooltip={
            inCode || allBranches
              ? 'Search options (some are on)'
              : 'Search options'
          }
          onClick={this.onToggleOptions}
        >
          <Octicon symbol={octicons.sliders} />
        </Button>
        <Button
          ariaLabel="Compare to branch"
          tooltip="Compare to branch"
          onClick={this.props.onCompareClicked}
        >
          <Octicon symbol={octicons.gitCompare} />
        </Button>
      </div>
    )
  }

  private renderOptions() {
    const value = (on: boolean) => (on ? CheckboxValue.On : CheckboxValue.Off)
    return (
      <div className="history-search-options">
        <Checkbox
          label="Search code changes (slower)"
          value={value(this.state.inCode)}
          onChange={this.onInCodeChanged}
        />
        <Checkbox
          label="All branches"
          value={value(this.state.allBranches)}
          onChange={this.onAllBranchesChanged}
        />
      </div>
    )
  }

  private renderResults() {
    const { commits, searchingText, searchingCode, done } = this.state
    const searching = searchingText || searchingCode
    const count = `${commits.length}${done ? '' : '+'} ${
      commits.length === 1 ? 'commit' : 'commits'
    }`
    const status = searchingCode
      ? 'searching code…'
      : searching
      ? 'searching…'
      : done
      ? null
      : 'scroll for more'

    return (
      <>
        <div className="history-search-status">
          {count}
          {status && ` · ${status}`}
        </div>
        <div className="compare-commit-list">
          {this.props.renderResults(
            commits.map(c => c.sha),
            this.onScroll,
            searching ? 'Searching…' : 'No commits match',
            this.matches
          )}
        </div>
      </>
    )
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onQueryChanged = (query: string) => {
    this.setState({ query })
    this.scheduleSearch()
  }

  private onSearchCleared = () => {
    this.onQueryChanged('')
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && this.state.query !== '') {
      event.preventDefault()
      this.onQueryChanged('')
    }
  }

  private onToggleOptions = () => {
    this.setState({ optionsOpen: !this.state.optionsOpen })
    this.textbox?.focus()
  }

  private onInCodeChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ inCode: event.currentTarget.checked })
    this.scheduleSearch(0)
  }

  private onAllBranchesChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ allBranches: event.currentTarget.checked })
    this.scheduleSearch(0)
  }

  private scheduleSearch(delay = DebounceMs) {
    if (this.debounceId !== null) {
      window.clearTimeout(this.debounceId)
    }
    this.debounceId = window.setTimeout(this.startSearch, delay)
  }

  private cancel() {
    if (this.debounceId !== null) {
      window.clearTimeout(this.debounceId)
      this.debounceId = null
    }
    // Running git processes finish on their own; their results are ignored.
    this.textSearch = this.codeSearch = null
  }

  private startSearch = () => {
    this.cancel()
    this.matches = new Map()
    const query = this.state.query.trim()
    if (query === '') {
      this.setState({
        commits: [],
        done: false,
        searchingText: false,
        searchingCode: false,
      })
      return
    }

    const options: ICommitSearchOptions = {
      query,
      inCode: this.state.inCode,
      allBranches: this.state.allBranches,
    }
    const { repository } = this.props
    this.textSearch = new CommitSearch(repository, options, ['text'])
    this.codeSearch = options.inCode
      ? new CommitSearch(repository, options, ['code'])
      : null
    // Any older search still running is ignored, so its flags reset too.
    this.setState(
      { commits: [], done: false, searchingText: false, searchingCode: false },
      this.loadMore
    )
  }

  private loadMore = () => {
    this.load(this.textSearch, 'searchingText')
    this.load(this.codeSearch, 'searchingCode')
  }

  /** Fetches the next page of one search and merges it in by date. */
  private async load(
    search: CommitSearch | null,
    flag: 'searchingText' | 'searchingCode'
  ) {
    if (search === null || search.isDone || this.state[flag]) {
      return
    }
    const setFlag = (state: IHistorySearchState, on: boolean) => ({
      searchingText: flag === 'searchingText' ? on : state.searchingText,
      searchingCode: flag === 'searchingCode' ? on : state.searchingCode,
    })
    this.setState(state => setFlag(state, true))

    const page = await search.next(PageSize).catch(e => {
      log.error('History search failed', e)
      return []
    })
    if (search !== this.textSearch && search !== this.codeSearch) {
      return
    }

    this.props.dispatcher.addCommitsToLookup(this.props.repository, page)
    for (const commit of page) {
      const label = matchLabels[search.matchOf(commit)]
      if (label !== undefined) {
        this.matches.set(commit.sha, label)
      }
    }
    // Functional update: the text and code searches finish independently.
    this.setState(state => {
      const known = new Set(state.commits.map(c => c.sha))
      const commits = [
        ...state.commits,
        ...page.filter(c => !known.has(c.sha)),
      ].sort((x, y) => +y.committer.date - +x.committer.date)
      return {
        ...setFlag(state, false),
        commits,
        done:
          (this.textSearch?.isDone ?? true) &&
          (this.codeSearch?.isDone ?? true),
      }
    })
  }

  private onScroll = (_start: number, end: number) => {
    if (this.state.commits.length - end <= CloseToBottomThreshold) {
      this.loadMore()
    }
  }
}
