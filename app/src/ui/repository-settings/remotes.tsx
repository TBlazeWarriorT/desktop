import * as React from 'react'
import { IRemote } from '../../models/remote'
import { Repository } from '../../models/repository'
import { getRemotes } from '../../lib/git'
import { findDefaultRemote } from '../../lib/stores/helpers/find-default-remote'
import { Dispatcher } from '../dispatcher'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showOpenDialog } from '../main-process-proxy'

interface IRemotesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onPublish: () => void
}

/** The remote being added (`remote` null) or edited. */
interface IRemoteForm {
  readonly remote: IRemote | null
  readonly name: string
  readonly url: string
}

interface IRemotesState {
  readonly remotes: ReadonlyArray<IRemote> | null
  readonly form: IRemoteForm | null
  readonly removing: string | null
  readonly busy: boolean
  readonly error: string | null
}

interface IRemoteRowProps {
  readonly remote: IRemote
  /** What Desktop pushes, pulls and links to GitHub through. */
  readonly isDefault: boolean
  readonly confirmingRemove: boolean
  readonly busy: boolean
  readonly onFetch: (remote: IRemote) => void
  readonly onEdit: (remote: IRemote) => void
  readonly onRemove: (remote: IRemote) => void
  readonly onConfirmRemove: () => void
  readonly onCancelRemove: () => void
}

class RemoteRow extends React.Component<IRemoteRowProps> {
  public render() {
    const { remote, isDefault, busy } = this.props
    if (this.props.confirmingRemove) {
      return (
        <div className="remote-row remote-confirm">
          <div className="remote-confirm-text">
            Remove <strong>{remote.name}</strong>? Its remote branches go away
            and local branches that track it lose their upstream.
            {isDefault &&
              ' Desktop pushes, pulls and links to GitHub through this remote.'}
          </div>
          <Button onClick={this.props.onConfirmRemove} disabled={busy}>
            Remove
          </Button>
          <Button onClick={this.props.onCancelRemove} disabled={busy}>
            Cancel
          </Button>
        </div>
      )
    }

    return (
      <div className="remote-row">
        <div className="remote-header">
          <div className="remote-name">
            {remote.name}
            {isDefault && (
              <TooltippedContent
                tagName="span"
                className="remote-default"
                tooltip="Used for push, pull and GitHub (origin, or else the first remote)"
              >
                default
              </TooltippedContent>
            )}
          </div>
          <Button
            size="small"
            tooltip={`Fetch ${remote.name}`}
            ariaLabel={`Fetch ${remote.name}`}
            onClick={this.onFetch}
            disabled={busy}
          >
            <Octicon symbol={octicons.sync} />
          </Button>
          <Button
            size="small"
            tooltip="Edit name or URL"
            ariaLabel={`Edit ${remote.name}`}
            onClick={this.onEdit}
            disabled={busy}
          >
            <Octicon symbol={octicons.pencil} />
          </Button>
          <Button
            size="small"
            tooltip="Remove"
            ariaLabel={`Remove ${remote.name}`}
            onClick={this.onRemove}
            disabled={busy}
          >
            <Octicon symbol={octicons.trash} />
          </Button>
        </div>
        <TooltippedContent
          className="remote-url"
          tooltip={remote.url}
          onlyWhenOverflowed={true}
        >
          {/* The box is rtl so the start gets cut; the text itself stays ltr. */}
          <span dir="ltr">{remote.url}</span>
        </TooltippedContent>
      </div>
    )
  }

  private onFetch = () => this.props.onFetch(this.props.remote)
  private onEdit = () => this.props.onEdit(this.props.remote)
  private onRemove = () => this.props.onRemove(this.props.remote)
}

/** Every remote of the repository, added, edited and removed on the spot. */
export class Remotes extends React.Component<IRemotesProps, IRemotesState> {
  public constructor(props: IRemotesProps) {
    super(props)
    this.state = {
      remotes: null,
      form: null,
      removing: null,
      busy: false,
      error: null,
    }
  }

  public componentDidMount() {
    this.reload()
  }

  private async reload() {
    const remotes = await getRemotes(this.props.repository)
    this.setState({ remotes })
  }

  public render() {
    const { remotes, form } = this.state
    if (remotes === null) {
      return <DialogContent className="remotes" />
    }
    const defaultRemote = findDefaultRemote(remotes)

    return (
      <DialogContent className="remotes">
        {remotes.length === 0 && form === null ? (
          <p className="remotes-empty">
            No remotes yet. Add one, or{' '}
            <LinkButton onClick={this.props.onPublish}>
              publish this repository to GitHub
            </LinkButton>
            .
          </p>
        ) : (
          <ul className="remotes-list">
            {remotes.map(r =>
              form?.remote?.name === r.name ? (
                <li key={r.name}>{this.renderForm(form)}</li>
              ) : (
                <li key={r.name}>
                  <RemoteRow
                    remote={r}
                    isDefault={r.name === defaultRemote?.name}
                    confirmingRemove={this.state.removing === r.name}
                    busy={this.state.busy}
                    onFetch={this.onFetch}
                    onEdit={this.onEdit}
                    onRemove={this.onRemove}
                    onConfirmRemove={this.onConfirmRemove}
                    onCancelRemove={this.onCancelRemove}
                  />
                </li>
              )
            )}
          </ul>
        )}
        {form !== null && form.remote === null
          ? this.renderForm(form)
          : form === null && (
              <Button
                className="remotes-add"
                onClick={this.onAdd}
                disabled={this.state.busy}
              >
                <Octicon symbol={octicons.plus} />
                Add remote
              </Button>
            )}
        {this.state.error !== null && form === null && (
          <div className="remotes-error">{this.state.error}</div>
        )}
      </DialogContent>
    )
  }

  private renderForm(form: IRemoteForm) {
    const { busy } = this.state
    const canSave =
      !busy &&
      form.name.trim().length > 0 &&
      form.url.trim().length > 0 &&
      (form.remote === null ||
        form.name.trim() !== form.remote.name ||
        form.url.trim() !== form.remote.url)

    return (
      <div className="remote-form">
        <TextBox
          label="Name"
          value={form.name}
          autoFocus={form.remote === null}
          onValueChanged={this.onNameChanged}
          onKeyDown={this.onFormKeyDown}
          disabled={busy}
        />
        <div className="remote-form-url">
          <TextBox
            label="URL or local path"
            value={form.url}
            autoFocus={form.remote !== null}
            onValueChanged={this.onUrlChanged}
            onKeyDown={this.onFormKeyDown}
            disabled={busy}
          />
          <Button onClick={this.onChooseFolder} disabled={busy}>
            Choose folder…
          </Button>
        </div>
        {this.state.error !== null && (
          <div className="remotes-error">{this.state.error}</div>
        )}
        <div className="remote-form-buttons">
          <Button onClick={this.onSave} disabled={!canSave}>
            {form.remote === null ? 'Add and fetch' : 'Save'}
          </Button>
          <Button onClick={this.onCancelForm} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  private onAdd = () => {
    const taken = new Set(this.state.remotes?.map(r => r.name))
    const name = ['origin', 'upstream'].find(n => !taken.has(n)) ?? ''
    this.setState({
      form: { remote: null, name, url: '' },
      removing: null,
      error: null,
    })
  }

  private onEdit = (remote: IRemote) => {
    this.setState({
      form: { remote, name: remote.name, url: remote.url },
      removing: null,
      error: null,
    })
  }

  private onNameChanged = (name: string) => {
    this.setState(s => (s.form ? { form: { ...s.form, name } } : null))
  }

  private onUrlChanged = (url: string) => {
    this.setState(s => (s.form ? { form: { ...s.form, url } } : null))
  }

  /** Enter saves the remote instead of submitting the whole dialog. */
  private onFormKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onSave()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.onCancelForm()
    }
  }

  private onChooseFolder = async () => {
    const path = await showOpenDialog({ properties: ['openDirectory'] })
    if (path !== null) {
      this.onUrlChanged(path)
    }
  }

  private onCancelForm = () => {
    this.setState({ form: null, error: null })
  }

  private onSave = async () => {
    const { form, remotes } = this.state
    if (form === null) {
      return
    }
    const name = form.name.trim()
    const url = form.url.trim()
    if (name.length === 0 || url.length === 0) {
      return
    }
    if (name !== form.remote?.name && remotes?.some(r => r.name === name)) {
      this.setState({ error: `There is already a remote named ${name}.` })
      return
    }
    const ok = await this.run(() =>
      this.props.dispatcher.changeRemote(
        this.props.repository,
        form.remote === null
          ? { kind: 'add', name, url }
          : { kind: 'edit', remote: form.remote, name, url }
      )
    )
    if (ok) {
      this.setState({ form: null })
    }
  }

  private onConfirmRemove = async () => {
    const name = this.state.removing
    if (name !== null) {
      await this.run(() =>
        this.props.dispatcher.changeRemote(this.props.repository, {
          kind: 'remove',
          name,
        })
      )
      this.setState({ removing: null })
    }
  }

  private onCancelRemove = () => {
    this.setState({ removing: null })
  }

  private onFetch = (remote: IRemote) => {
    this.props.dispatcher.fetchRemoteByName(this.props.repository, remote.name)
  }

  private onRemove = (remote: IRemote) => {
    this.setState({ removing: remote.name, form: null, error: null })
  }

  /** Runs a change, shows its git error, and reloads the list either way. */
  private async run(action: () => Promise<void>): Promise<boolean> {
    this.setState({ busy: true, error: null })
    let ok = true
    try {
      await action()
    } catch (e) {
      ok = false
      this.setState({ error: e instanceof Error ? e.message : String(e) })
    }
    await this.reload()
    this.setState({ busy: false })
    return ok
  }
}
