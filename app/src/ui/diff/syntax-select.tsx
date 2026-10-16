import * as React from 'react'
import * as Path from 'path'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { getRathenaHighlightContext } from '../../lib/rathena/context'
import {
  getSyntaxLabel,
  getSyntaxOverride,
  onSyntaxOverrideChanged,
  otherSyntaxChoices,
  plainSyntax,
  rathenaSyntaxChoices,
  setSyntaxOverride,
} from '../../lib/syntax-override'

interface ISyntaxSelectProps {
  readonly repositoryPath: string
  /** Repository-relative path of the shown file. */
  readonly path: string
}

/**
 * "Syntax: Auto" next to Diff Options: picks the highlighting by hand for this
 * file, remembered for its path in this repository.
 */
export class SyntaxSelect extends React.Component<ISyntaxSelectProps> {
  private unsubscribe: (() => void) | null = null

  public componentDidMount() {
    this.unsubscribe = onSyntaxOverrideChanged(() => this.forceUpdate())
  }

  public componentWillUnmount() {
    this.unsubscribe?.()
  }

  public render() {
    const current = getSyntaxOverride(
      this.props.repositoryPath,
      this.props.path
    )
    return (
      <Button
        className="syntax-select"
        size="small"
        onClick={this.onClick}
        tooltip="Syntax highlighting for this file, remembered for its path"
      >
        {getSyntaxLabel(current)}
        <Octicon symbol={octicons.triangleDown} />
      </Button>
    )
  }

  private onClick = async () => {
    const { repositoryPath, path } = this.props
    const current = getSyntaxOverride(repositoryPath, path)
    const choice = (id: string | null, label: string): IMenuItem => ({
      label,
      type: 'checkbox',
      checked: (current ?? null) === id,
      action: () => setSyntaxOverride(repositoryPath, path, id),
    })

    const items = new Array<IMenuItem>()
    const source = await this.describeRathenaSource()
    if (source !== null) {
      items.push({ label: source, enabled: false }, { type: 'separator' })
    }
    items.push(
      choice(null, 'Auto'),
      { type: 'separator' },
      ...rathenaSyntaxChoices.map(c => choice(c.id, c.label)),
      { type: 'separator' },
      choice(plainSyntax.id, plainSyntax.label),
      {
        label: 'Other',
        submenu: otherSyntaxChoices.map(c => choice(c.id, c.label)),
      }
    )
    showContextualMenu(items)
  }

  /** "rAthena · Gear-Mechanica-Server · 753 commands", in rAthena repos. */
  private async describeRathenaSource() {
    const context = await getRathenaHighlightContext(this.props.repositoryPath)
    if (context === undefined) {
      return null
    }
    const definitions = context.definitions
    if (definitions === null) {
      return 'rAthena · bundled rathena master commands'
    }
    const count = Object.keys(definitions.commands).length
    return `rAthena · ${Path.basename(definitions.source)} · ${count} commands`
  }
}
