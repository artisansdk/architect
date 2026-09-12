import ClackPromptDriver from "./clack"
import type { ConfirmOptions, PasswordOptions, PromptDriver, SelectOptions, TextOptions } from "./contract"
import FakePromptDriver, { type FakeAnswers } from "./fake"

export { default as ClackPromptDriver } from "./clack"
export type {
    ConfirmOptions,
    PasswordOptions,
    PromptDriver,
    SelectOptions,
    TextOptions,
    Validator,
} from "./contract"
export { NonInteractiveError, PromptCancelledError } from "./contract"
export { default as FakePromptDriver } from "./fake"

let driver: PromptDriver | null = null

/** The active driver, lazily defaulting to {@link ClackPromptDriver}. */
export function promptDriver(): PromptDriver {
    if (!driver) {
        driver = new ClackPromptDriver()
    }

    return driver
}

/** Swap the driver backing the `text()`/`select()`/… functions. */
export function setPromptDriver(next: PromptDriver | null): void {
    driver = next
}

/** Install a {@link FakePromptDriver} and return it, for tests. */
export function fakePrompts(answers?: FakeAnswers): FakePromptDriver {
    const fake = new FakePromptDriver(answers)
    driver = fake
    return fake
}

export function text(label: string, options?: TextOptions): Promise<string> {
    return promptDriver().text(label, options)
}

export function password(label: string, options?: PasswordOptions): Promise<string> {
    return promptDriver().password(label, options)
}

export function confirm(label: string, options?: ConfirmOptions): Promise<boolean> {
    return promptDriver().confirm(label, options)
}

export function select<T = string>(label: string, options: SelectOptions<T>): Promise<T> {
    return promptDriver().select<T>(label, options)
}

export function multiselect<T = string>(label: string, options: SelectOptions<T>): Promise<T[]> {
    return promptDriver().multiselect<T>(label, options)
}
