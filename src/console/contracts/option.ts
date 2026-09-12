/**
 * The shape of a single `--option` declared in a command signature.
 */
export default interface Option {
    name: string
    description: string
    /** Optional single-character alias, e.g. the `f` in `{--f|force}`. */
    shortcut?: string
    /** Whether the option accepts a value (`{--name=}`) rather than being a boolean flag. */
    acceptsValue: boolean
    /** Whether the option may be repeated to collect a list (`{--tag=*}`). */
    array: boolean
    /** Default value used when the option is absent (booleans default to `false`). */
    default?: string | string[] | boolean
}
