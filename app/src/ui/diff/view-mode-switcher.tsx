import * as React from 'react'
import classNames from 'classnames'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'

export interface IViewMode<T extends string> {
  readonly id: T
  readonly label: string
  readonly icon: OcticonSymbol
  readonly tooltip: string
}

interface IViewModeButtonProps<T extends string> {
  readonly mode: IViewMode<T>
  readonly selected: boolean
  readonly onChange: (mode: T) => void
}

class ViewModeButton<T extends string> extends React.Component<
  IViewModeButtonProps<T>
> {
  public render() {
    const { mode, selected } = this.props
    return (
      <Button
        className={classNames('view-mode', { selected })}
        size="small"
        ariaPressed={selected}
        tooltip={mode.tooltip}
        onClick={this.onClick}
      >
        <Octicon symbol={mode.icon} />
        {mode.label}
      </Button>
    )
  }

  private onClick = () => {
    if (!this.props.selected) {
      this.props.onChange(this.props.mode.id)
    }
  }
}

interface IViewModeSwitcherProps<T extends string> {
  readonly modes: ReadonlyArray<IViewMode<T>>
  readonly selected: T
  readonly onChange: (mode: T) => void
}

/** Segmented buttons for the ways a file can be shown; the current is pressed. */
export class ViewModeSwitcher<T extends string> extends React.Component<
  IViewModeSwitcherProps<T>
> {
  public render() {
    const { modes, selected } = this.props
    return (
      <div className="view-mode-switcher" role="group" aria-label="View">
        {modes.map(mode => (
          <ViewModeButton
            key={mode.id}
            mode={mode}
            selected={mode.id === selected}
            onChange={this.props.onChange}
          />
        ))}
      </div>
    )
  }
}
