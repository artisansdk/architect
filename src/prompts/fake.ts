import {
    type ConfirmOptions,
    normalizeSelectOptions,
    type PromptDriver,
    type SelectOptions,
    type TextOptions,
} from "./contract"

/** A queued or keyed answer for the {@link FakePromptDriver}. */
export type FakeAnswers = Record<string, unknown> | unknown[]

/**
 * A {@link PromptDriver} for tests. Answers are matched by prompt label; an
 * array of answers is consumed in call order. Unmatched prompts fall back to
 * the supplied default (or a type-appropriate empty value) so a test never hangs.
 * Every call is recorded on {@link asked} for assertions.
 */
export default class FakePromptDriver implements PromptDriver {
    readonly asked: Array<{ type: string; label: string }> = []
    protected queue: unknown[]
    protected keyed: Record<string, unknown>

    constructor(answers: FakeAnswers = {}) {
        this.queue = Array.isArray(answers) ? [...answers] : []
        this.keyed = Array.isArray(answers) ? {} : { ...answers }
    }

    protected resolve<T>(type: string, label: string, fallback: T): T {
        this.asked.push({ type, label })

        if (label in this.keyed) {
            return this.keyed[label] as T
        }

        if (this.queue.length > 0) {
            return this.queue.shift() as T
        }

        return fallback
    }

    async text(label: string, options: TextOptions = {}): Promise<string> {
        return this.resolve("text", label, options.default ?? "")
    }

    async password(label: string): Promise<string> {
        return this.resolve("password", label, "")
    }

    async confirm(label: string, options: ConfirmOptions = {}): Promise<boolean> {
        return this.resolve("confirm", label, options.default ?? false)
    }

    async select<T>(label: string, options: SelectOptions<T>): Promise<T> {
        const list = normalizeSelectOptions(options.options)
        return this.resolve("select", label, options.default ?? list[0]?.value)
    }

    async multiselect<T>(label: string, options: SelectOptions<T>): Promise<T[]> {
        return this.resolve("multiselect", label, (options.default as T[]) ?? [])
    }
}
