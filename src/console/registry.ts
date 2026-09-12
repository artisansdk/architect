import type Command from "./command"

/** A command entry: either an eager instance or a lazy loader for a discovered module. */
export type CommandSource = Command | (new (...args: any[]) => Command)

/**
 * The set of commands an application knows about, keyed by their signature name.
 * Registering a name that already exists throws — this is how duplicate command
 * names across discovered packages are surfaced rather than silently shadowed.
 */
export default class CommandRegistry {
    protected readonly entries = new Map<string, { source: CommandSource; provider: string }>()

    /**
     * @param name    the command name (the part before the first `{` in a signature)
     * @param source  a Command instance or class
     * @param provider a label for error messages, e.g. the owning package name
     */
    register(name: string, source: CommandSource, provider = "architect"): this {
        const existing = this.entries.get(name)
        if (existing) {
            throw new Error(
                `The command [${name}] is already registered by [${existing.provider}] and cannot be redefined by [${provider}].`,
            )
        }

        this.entries.set(name, { source, provider })
        return this
    }

    has(name: string): boolean {
        return this.entries.has(name)
    }

    get(name: string): CommandSource | undefined {
        return this.entries.get(name)?.source
    }

    /** Which provider registered a command. */
    providerOf(name: string): string | undefined {
        return this.entries.get(name)?.provider
    }

    /** Every registered command name, sorted. */
    names(): string[] {
        return [...this.entries.keys()].sort()
    }

    /** Every `[name, source]` pair, sorted by name. */
    all(): Array<[string, CommandSource]> {
        return [...this.entries.entries()]
            .map(([name, entry]): [string, CommandSource] => [name, entry.source])
            .sort(([a], [b]) => a.localeCompare(b))
    }
}
