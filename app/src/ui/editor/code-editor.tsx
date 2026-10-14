import * as React from 'react'
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
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from '@codemirror/search'
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
}

/** An editable file with the app's syntax highlighting (CodeMirror 6). */
export class CodeEditor extends React.Component<ICodeEditorProps> {
  private view: EditorView | null = null
  private highlightTimer: number | null = null

  public componentDidUpdate(prevProps: ICodeEditorProps) {
    const { view } = this
    if (view !== null && prevProps.text !== this.props.text) {
      if (view.state.doc.toString() !== this.props.text) {
        view.setState(this.createState())
        this.scheduleHighlight(0)
      }
    }
  }

  public componentWillUnmount() {
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer)
    }
    this.view?.destroy()
    this.view = null
    this.props.onViewReady?.(null)
  }

  public render() {
    return <div className="code-editor cm-s-default" ref={this.onRef} />
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
        search({ top: true }),
        keymap.of([
          { key: 'Mod-s', run: this.save, preventDefault: true },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
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
    if (this.view !== null) {
      openSearchPanel(this.view)
    }
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
