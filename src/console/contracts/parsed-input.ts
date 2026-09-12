/**
 * The raw, coerced values a {@link import("./console-driver").default ConsoleDriver}
 * hands back after parsing an argv, before Architect wraps them in an
 * {@link import("../input").default Input}.
 */
export default interface ParsedInput {
    arguments: Record<string, string | string[] | undefined>
    options: Record<string, string | string[] | boolean | undefined>
    /**
     * Tokens after a standalone `--`, passed through untouched (no flag parsing).
     * `undefined` when no `--` appeared; `[]` when it did but nothing followed.
     */
    passthrough?: string[]
}
