import * as React from 'react'
import { ICommandDoc, getCommandDocs } from '../../lib/rathena/command-docs'

const ShowDelayMs = 450

interface IRathenaCommandTooltipProps {
  readonly repositoryPath: string
}

interface IShown {
  readonly name: string
  readonly doc: ICommandDoc
  readonly anchor: DOMRect
}

interface IRathenaCommandTooltipState {
  readonly shown: IShown | null
}

/**
 * Hovering a highlighted rAthena command anywhere in the repository's views
 * (diff, whole file, editor) shows its entry from script_commands.txt.
 */
export class RathenaCommandTooltip extends React.Component<
  IRathenaCommandTooltipProps,
  IRathenaCommandTooltipState
> {
  private target: Element | null = null
  private timer: number | null = null
  private tooltip: HTMLDivElement | null = null

  public constructor(props: IRathenaCommandTooltipProps) {
    super(props)
    this.state = { shown: null }
  }

  public componentDidMount() {
    document.addEventListener('mouseover', this.onMouseOver)
    document.addEventListener('scroll', this.hide, true)
    document.addEventListener('keydown', this.hide)
  }

  public componentWillUnmount() {
    document.removeEventListener('mouseover', this.onMouseOver)
    document.removeEventListener('scroll', this.hide, true)
    document.removeEventListener('keydown', this.hide)
    this.cancel()
  }

  private cancel() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private hide = (event?: Event) => {
    // Scrolling the tooltip itself keeps it open.
    if (
      event?.type === 'scroll' &&
      this.tooltip?.contains(event.target as Node)
    ) {
      return
    }
    this.cancel()
    this.target = null
    if (this.state.shown !== null) {
      this.setState({ shown: null })
    }
  }

  private onMouseOver = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null
    if (element !== null && this.tooltip?.contains(element)) {
      return
    }
    // Script commands only; the reference's own `*command` lines are skipped.
    const target = element?.closest(
      '.cm-m-rathena.cm-rathena-command:not(.cm-rathena-doc-command)'
    )
    if (target === this.target) {
      return
    }
    this.hide()
    if (target === null || target === undefined) {
      return
    }
    this.target = target
    this.timer = window.setTimeout(() => this.show(target), ShowDelayMs)
  }

  private async show(target: Element) {
    const name = target.textContent?.trim() ?? ''
    const docs = await getCommandDocs(this.props.repositoryPath)
    const doc = docs?.get(name) ?? docs?.get(name.toLowerCase())
    if (doc !== undefined && this.target === target) {
      this.setState({
        shown: { name, doc, anchor: target.getBoundingClientRect() },
      })
    }
  }

  private onTooltipRef = (tooltip: HTMLDivElement | null) => {
    this.tooltip = tooltip
  }

  private onTooltipMouseLeave = () => {
    this.hide()
  }

  public render() {
    const { shown } = this.state
    if (shown === null) {
      return null
    }
    const { doc, anchor } = shown
    // The whole entry, never cut: long ones (if, menu) scroll inside.
    const body = doc.body
    // Below the command, or above it near the bottom of the window.
    const below = anchor.bottom + 280 < window.innerHeight
    const style: React.CSSProperties = {
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - 560)),
      ...(below
        ? { top: anchor.bottom + 1 }
        : { bottom: window.innerHeight - anchor.top + 1 }),
    }

    return (
      <div
        className="rathena-command-tooltip"
        style={style}
        ref={this.onTooltipRef}
        onMouseLeave={this.onTooltipMouseLeave}
        role="tooltip"
      >
        {doc.signatures.map((signature, i) => (
          <div key={i} className="rathena-command-signature">
            {signature}
          </div>
        ))}
        {body !== '' && <div className="rathena-command-body">{body}</div>}
      </div>
    )
  }
}
