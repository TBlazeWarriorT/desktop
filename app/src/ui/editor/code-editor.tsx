import * as React from 'react'
import { onSyntaxOverrideChanged } from '../../lib/syntax-override'
import {
  EditorState,
  Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Text,
} from '@codemirror/state'
import {
  Decoration,
  DecorationSet,
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  selectAll,
} from '@codemirror/commands'
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  setSearchQuery,
} from '@codemirror/search'
import { DiffSearchInput } from '../diff/diff-search-input'
import { Repository } from '../../models/repository'
import { IToken, ITokens } from '../../lib/highlighter/types'
import { highlightWholeFile } from '../diff/whole-file-lines'

const HighlightDelayMs = 300

/** Highlighter tokens as decorations, kept in place while typing. */
const setTokens = StateEffect.define<DecorationSet>()
const tokensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(tokens, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTokens)) {
        return effect.value
      }
    }
    return tokens.map(tr.changes)
  },
  provide: field => EditorView.decorations.from(field),
})

function tokenDecorations(doc: Text, tokens: ITokens): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const lineTokens = tokens[i - 1]
    if (lineTokens === undefined) {
      continue
    }
    // Integer keys come out in ascending order, as the builder needs.
    const entries = Object.entries(lineTokens) as Array<[string, IToken]>
    for (const [offset, { length, token }] of entries) {
      const from = line.from + Number(offset)
      const to = Math.min(from + length, line.to)
      if (from < to) {
        const classes = token.split(' ').map(t => `cm-${t}`)
        builder.add(from, to, Decoration.mark({ class: classes.join(' ') }))
      }
    }
  }
  return builder.finish()
}

/** Colors from the app's CSS variables, so both themes work. */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-color)',
    backgroundColor: 'var(--background-color)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-family-monospace)',
    lineHeight: '20px',
  },
  '.cm-gutters': {
    color: 'var(--diff-line-number-color)',
    backgroundColor: 'var(--background-color)',
    border: 'none',
  },
  '.cm-cursor': { borderLeftColor: 'var(--text-color)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--text-field-focus-shadow-color)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-panels': {
    color: 'var(--text-color)',
    backgroundColor: 'var(--box-alt-background-color)',
  },
})

interface ICodeEditorProps {
  readonly repository: Repository
  /** Picks the syntax highlighting, rAthena included. */
  readonly path: string
  /** The initial text; replacing it resets the editor (and its undo). */
  readonly text: string
  /** Extra behavior, e.g. conflict decorations. */
  readonly extensions?: Extension
  readonly onChange: (text: string) => void
  /** Ctrl+S. */
  readonly onSave: () => void
  readonly onViewReady?: (view: EditorView | null) => void
  /** 0-based line to show at the top when opened, e.g. where the viewer was. */
  readonly initialTopLine?: number
}

interface ICodeEditorState {
  readonly searching: boolean
  /** The selected hit and the total, after a search. */
  readonly hits: { readonly current: number; readonly total: number } | null
}

/**
 * CodeMirror only highlights matches while its search panel is open, so it
 * gets an empty one; the visible box is the same as the viewers'.
 */
const hiddenSearchPanel = () => {
  const dom = document.createElement('div')
  dom.style.display = 'none'
  return { dom, top: true }
}

/** An editable file with the app's syntax highlighting (CodeMirror 6). */
export class CodeEditor extends React.Component<
  ICodeEditorProps,
  ICodeEditorState
> {
  private view: EditorView | null = null
  private highlightTimer: number | null = null
  private unsubscribeSyntax: (() => void) | null = null

  public constructor(props: ICodeEditorProps) {
    super(props)
    this.state = { searching: false, hits: null }
  }

  /** 0-based line at the top of the editor, to keep the place elsewhere. */
  public getTopLine(): number | null {
    const view = this.view
    if (view === null) {
      return null
    }
    const top = view.scrollDOM.getBoundingClientRect().top
    const block = view.lineBlockAtHeight(top - view.documentTop)
    return view.state.doc.lineAt(block.from).number - 1
  }

  public componentDidUpdate(prevProps: ICodeEditorProps) {
    const { view } = this
    if (view !== null && prevProps.text !== this.props.text) {
      if (view.state.doc.toString() !== this.props.text) {
        view.setState(this.createState())
        this.scheduleHighlight(0)
      }
    }
  }

  public componentDidMount() {
    this.unsubscribeSyntax = onSyntaxOverrideChanged(() =>
      this.scheduleHighlight(0)
    )
  }

  public componentWillUnmount() {
    this.unsubscribeSyntax?.()
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer)
    }
    this.view?.destroy()
    this.view = null
    this.props.onViewReady?.(null)
  }

  public render() {
    const { searching, hits } = this.state
    return (
      <div className="code-editor cm-s-default">
        <div className="code-editor-view" ref={this.onRef} />
        {searching && (
          <DiffSearchInput
            onSearch={this.onSearch}
            onClose={this.onSearchClose}
          />
        )}
        {hits !== null && (
          <div className="whole-file-search-count">
            {hits.total === 0
              ? 'No results'
              : `${hits.current} of ${hits.total}`}
          </div>
        )}
      </div>
    )
  }

  private onRef = (parent: HTMLDivElement | null) => {
    if (parent === null || this.view !== null) {
      return
    }
    this.view = new EditorView({ state: this.createState(), parent })
    // Edit > Find and Edit > Select all reach the focused element this way
    // (app.tsx), since the menu takes Ctrl+F and Ctrl+A first.
    this.view.dom.addEventListener('find-text', this.onFindText)
    this.view.dom.addEventListener('select-all', this.onSelectAll)
    this.props.onViewReady?.(this.view)
    this.scheduleHighlight(0)

    const line = this.props.initialTopLine ?? 0
    if (line > 0 && line < this.view.state.doc.lines) {
      const pos = this.view.state.doc.line(line + 1).from
      this.view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'start' }),
      })
    }
  }

  private createState() {
    return EditorState.create({
      doc: this.props.text,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true, createPanel: hiddenSearchPanel }),
        keymap.of([
          { key: 'Mod-s', run: this.save, preventDefault: true },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        tokensField,
        theme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            this.props.onChange(update.state.doc.toString())
            this.scheduleHighlight(HighlightDelayMs)
          }
        }),
        this.props.extensions ?? [],
      ],
    })
  }

  private save = () => {
    this.props.onSave()
    return true
  }

  private onFindText = (event: Event) => {
    event.preventDefault()
    this.setState({ searching: true })
  }

  /** Enter: next hit (Shift: previous); a new query starts from the cursor. */
  private onSearch = (query: string, direction: 'next' | 'previous') => {
    const view = this.view
    if (view === null) {
      return
    }
    if (query.trim() === '') {
      closeSearchPanel(view)
      this.setState({ hits: null })
      return
    }
    const searchQuery = new SearchQuery({ search: query })
    view.dispatch({ effects: setSearchQuery.of(searchQuery) })
    openSearchPanel(view)
    if (direction === 'next') {
      findNext(view)
    } else {
      findPrevious(view)
    }

    let total = 0
    let current = 0
    const selected = view.state.selection.main.from
    const cursor = searchQuery.getCursor(view.state)
    for (let hit = cursor.next(); !hit.done; hit = cursor.next()) {
      total++
      if (hit.value.from === selected) {
        current = total
      }
    }
    this.setState({ hits: { current, total } })
  }

  private onSearchClose = () => {
    if (this.view !== null) {
      closeSearchPanel(this.view)
      this.view.focus()
    }
    this.setState({ searching: false, hits: null })
  }

  private onSelectAll = (event: Event) => {
    event.preventDefault()
    if (this.view !== null) {
      selectAll(this.view)
    }
  }

  private scheduleHighlight(delay: number) {
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer)
    }
    this.highlightTimer = window.setTimeout(() => this.highlight(), delay)
  }

  private async highlight() {
    this.highlightTimer = null
    const view = this.view
    if (view === null) {
      return
    }
    const doc = view.state.doc
    const lines = doc.toJSON()
    const tokens = await highlightWholeFile(
      this.props.repository,
      this.props.path,
      lines
    )
    // Text typed meanwhile gets its own pass; these offsets are stale.
    if (this.view === view && view.state.doc === doc) {
      view.dispatch({ effects: setTokens.of(tokenDecorations(doc, tokens)) })
    }
  }
}
