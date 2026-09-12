/**
 * The shape of a single positional argument declared in a command signature.
 */
export default interface Argument {
    name: string
    description: string
    /** Whether the argument must be supplied. */
    required: boolean
    /** Whether the argument collects a variadic list of values (`{name*}`). */
    array: boolean
    /** Default value used when the argument is omitted. */
    default?: string | string[]
}
