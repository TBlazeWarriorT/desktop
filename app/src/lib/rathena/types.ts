/** Script commands and constants known by one rAthena source tree. */
export interface IRathenaDefinitions {
  /** Where these came from, e.g. "rathena/master@<sha>" or a local path. */
  readonly source: string
  /** Command name to its argument signature ("v*", "i??", ...). */
  readonly commands: { readonly [name: string]: string }
  readonly deprecatedCommands: ReadonlyArray<string>
  readonly constants: ReadonlyArray<string>
  /** Character parameters such as BaseLevel or Zeny (export_parameter). */
  readonly parameters: ReadonlyArray<string>
  readonly deprecatedConstants: ReadonlyArray<string>
}

/** Hand-maintained additions from the `extra` block of `.rathena.json`. */
export interface IRathenaExtra {
  readonly prefixes?: ReadonlyArray<string>
  readonly constants?: ReadonlyArray<string>
  readonly commands?: ReadonlyArray<string>
  readonly keywords?: ReadonlyArray<string>
}

/** What the highlighter worker needs to know about a file's repository. */
export interface IRathenaHighlightContext {
  /** Changes whenever anything below changes, so the worker can cache. */
  readonly key: string
  /** The repository's own source tree; null falls back to the baseline. */
  readonly definitions: IRathenaDefinitions | null
  readonly extra: IRathenaExtra
  /** Names from `function<TAB>script<TAB>Name` anywhere in the repository. */
  readonly globalFunctions: ReadonlyArray<string>
}
