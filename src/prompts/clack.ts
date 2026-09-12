import {
    confirm as clackConfirm,
    multiselect as clackMultiselect,
    password as clackPassword,
    select as clackSelect,
    text as clackText,
    isCancel,
} from "@clack/prompts"
import {
    type ConfirmOptions,
    NonInteractiveError,
    normalizeSelectOptions,
    type PasswordOptions,
    PromptCancelledError,
    type PromptDriver,
    type SelectOptions,
    type TextOptions,
    type Validator,
} from "./contract"

function toClackValidate(
    validate: Validator<string> | undefined,
    required: boolean | undefined,
): ((value: string | undefined) => string | undefined) | undefined {
    if (!validate && !required) {
        return undefined
    }

    return (value: string | undefined) => {
        if (required && (value === undefined || value === "")) {
            return "This field is required."
        }

        return validate?.(value ?? "")
    }
}

/**
 * The default {@link PromptDriver}, backed by `@clack/prompts`. When stdin is
 * not a TTY (CI, piped input, tests that forgot to fake) every prompt falls
 * back to its default, or throws {@link NonInteractiveError} if none exists.
 */
export default class ClackPromptDriver implements PromptDriver {
    constructor(protected readonly interactive: boolean = Boolean(process.stdin?.isTTY)) {}

    protected unwrap<T>(value: T | symbol): T {
        if (isCancel(value)) {
            throw new PromptCancelledError()
        }

        return value as T
    }

    async text(label: string, options: TextOptions = {}): Promise<string> {
        if (!this.interactive) {
            if (options.default !== undefined) return options.default
            throw new NonInteractiveError(label)
        }

        return this.unwrap(
            await clackText({
                message: label,
                placeholder: options.placeholder,
                defaultValue: options.default,
                initialValue: options.default,
                validate: toClackValidate(options.validate, options.required),
            }),
        )
    }

    async password(label: string, options: PasswordOptions = {}): Promise<string> {
        if (!this.interactive) {
            throw new NonInteractiveError(label)
        }

        return this.unwrap(
            await clackPassword({
                message: label,
                validate: toClackValidate(options.validate, options.required),
            }),
        )
    }

    async confirm(label: string, options: ConfirmOptions = {}): Promise<boolean> {
        if (!this.interactive) {
            return options.default ?? false
        }

        return this.unwrap(await clackConfirm({ message: label, initialValue: options.default ?? false }))
    }

    async select<T>(label: string, options: SelectOptions<T>): Promise<T> {
        const list = normalizeSelectOptions(options.options)

        if (!this.interactive) {
            if (options.default !== undefined) return options.default
            if (list.length > 0) return list[0].value
            throw new NonInteractiveError(label)
        }

        return this.unwrap(
            await clackSelect({
                message: label,
                options: list.map((entry) => ({ value: entry.value, label: entry.label, hint: entry.hint })) as never,
                initialValue: options.default,
            }),
        ) as T
    }

    async multiselect<T>(label: string, options: SelectOptions<T>): Promise<T[]> {
        const list = normalizeSelectOptions(options.options)

        if (!this.interactive) {
            if (Array.isArray(options.default)) return options.default
            return []
        }

        return this.unwrap(
            await clackMultiselect({
                message: label,
                options: list.map((entry) => ({ value: entry.value, label: entry.label, hint: entry.hint })) as never,
                required: options.required ?? false,
            }),
        ) as T[]
    }
}
