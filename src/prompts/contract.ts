/** A validation callback: return an error string to reject, `undefined` to accept. */
export type Validator<T> = (value: T) => string | undefined

export interface TextOptions {
    placeholder?: string
    default?: string
    required?: boolean
    validate?: Validator<string>
}

export interface PasswordOptions {
    required?: boolean
    validate?: Validator<string>
}

export interface ConfirmOptions {
    default?: boolean
}

/**
 * `options` accepts either a `{ value: label }` record (the resolved answer is
 * the key) or an explicit list of `{ value, label, hint }` entries (the answer
 * is `value`).
 */
export interface SelectOptions<T> {
    options: Record<string, string> | Array<{ value: T; label: string; hint?: string }>
    default?: T
    required?: boolean
}

/**
 * Keeps the terminal rendering library (`@clack/prompts`) an implementation
 * detail, exactly as {@link import("../console/contract").ConsoleDriver} does
 * for `@bomb.sh/args`. Package authors depend on the `text()`/`select()`/… functions,
 * never on the driver or the library behind it.
 */
export interface PromptDriver {
    text(label: string, options?: TextOptions): Promise<string>
    password(label: string, options?: PasswordOptions): Promise<string>
    confirm(label: string, options?: ConfirmOptions): Promise<boolean>
    select<T>(label: string, options: SelectOptions<T>): Promise<T>
    multiselect<T>(label: string, options: SelectOptions<T>): Promise<T[]>
}

/** Thrown when the user cancels a prompt (Ctrl+C / Esc). */
export class PromptCancelledError extends Error {
    constructor() {
        super("Prompt cancelled.")
        this.name = "PromptCancelledError"
    }
}

/** Thrown in non-interactive contexts when a required prompt has no default to fall back on. */
export class NonInteractiveError extends Error {
    constructor(label: string) {
        super(`Cannot prompt for [${label}] in a non-interactive context and no default was provided.`)
        this.name = "NonInteractiveError"
    }
}

/** Normalise a `SelectOptions.options` value to the list form. */
export function normalizeSelectOptions<T>(
    options: SelectOptions<T>["options"],
): Array<{ value: T; label: string; hint?: string }> {
    if (Array.isArray(options)) {
        return options
    }

    return Object.entries(options).map(([value, label]) => ({ value: value as T, label }))
}
