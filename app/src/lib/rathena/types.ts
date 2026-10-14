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
