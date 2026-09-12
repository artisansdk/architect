import type ArgumentDefinition from "./contracts/argument"
import type OptionDefinition from "./contracts/option"
import type ParsedInput from "./contracts/parsed-input"

/**
 * A resolved view over one invocation's arguments and options. Commands read
 * from this rather than `process.argv`, so they stay testable without a process.
 */
export default class Input {
    protected readonly args: Record<string, string | string[] | undefined>
    protected readonly opts: Record<string, string | string[] | boolean | undefined>
    protected readonly extra: string[] | undefined

    constructor(
        parsed: ParsedInput,
        protected readonly argumentDefinitions: ArgumentDefinition[] = [],
        protected readonly optionDefinitions: OptionDefinition[] = [],
    ) {
        this.args = { ...parsed.arguments }
        this.opts = { ...parsed.options }
        this.extra = parsed.passthrough ? [...parsed.passthrough] : undefined
    }

    /** Every argument keyed by name. */
    arguments(): Record<string, string | string[] | undefined> {
        return { ...this.args }
    }

    /** A single argument by name. Throws for a name the signature never declared. */
    argument(name: string): string | string[] | undefined {
        if (!this.hasArgumentDefinition(name)) {
            throw new Error(`The argument [${name}] does not exist on this command.`)
        }

        return this.args[name]
    }

    /** Every option keyed by name. */
    options(): Record<string, string | string[] | boolean | undefined> {
        return { ...this.opts }
    }

    /** A single option by name. Throws for a name the signature never declared. */
    option(name: string): string | string[] | boolean | undefined {
        if (!this.hasOptionDefinition(name)) {
            throw new Error(`The option [${name}] does not exist on this command.`)
        }

        return this.opts[name]
    }

    /** Whether the option was supplied (or has a truthy default). */
    hasOption(name: string): boolean {
        const value = this.opts[name]
        return value !== undefined && value !== false
    }

    /** Tokens after a standalone `--`, unparsed. Empty when there were none. */
    passthrough(): string[] {
        return [...(this.extra ?? [])]
    }

    /** Whether a standalone `--` appeared, even with nothing after it. */
    hasPassthrough(): boolean {
        return this.extra !== undefined
    }

    protected hasArgumentDefinition(name: string): boolean {
        return this.argumentDefinitions.length === 0 || this.argumentDefinitions.some((arg) => arg.name === name)
    }

    protected hasOptionDefinition(name: string): boolean {
        return this.optionDefinitions.length === 0 || this.optionDefinitions.some((option) => option.name === name)
    }
}
