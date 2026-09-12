import type { ParseOptions } from "@bomb.sh/args"
import { parse } from "@bomb.sh/args"
import { ExitCode } from "../command"
import type ArgumentDefinition from "../contracts/argument"
import type CommandDefinition from "../contracts/command"
import type ConsoleDriver from "../contracts/console-driver"
import type OptionDefinition from "../contracts/option"
import type ParsedInput from "../contracts/parsed-input"
import Output from "../output/service"

export interface ArgsConsoleDriverOptions {
    name?: string
    version?: string
    output?: Output
    /** The command run for a bare `architect` invocation. */
    defaultCommand?: string
}

type ParsedArgs = Record<string, unknown> & { _: Array<string | number | boolean> }

/**
 * The only {@link ConsoleDriver} Architect ships. `@bomb.sh/args` tokenises a
 * single command's flags; command routing, help, version and exit codes are all
 * Architect's own. Nothing outside this file imports `@bomb.sh/args`.
 */
export default class ArgsConsoleDriver implements ConsoleDriver {
    protected readonly commands = new Map<string, CommandDefinition>()
    protected readonly name: string
    protected readonly version: string
    protected readonly output: Output
    protected readonly defaultCommand: string

    constructor(options: ArgsConsoleDriverOptions = {}) {
        this.name = options.name ?? "architect"
        this.version = options.version ?? "0.0.0"
        this.output = options.output ?? new Output()
        this.defaultCommand = options.defaultCommand ?? "list"
    }

    register(command: CommandDefinition): void {
        this.commands.set(command.name, command)
    }

    async run(argv: string[]): Promise<number> {
        const [head, ...rest] = argv

        // No command token (empty, or a leading flag): handle `--version`,
        // otherwise fall through to the default command (which also covers `--help`).
        if (!head || head.startsWith("-")) {
            const globals = parse(argv, { alias: { h: "help", v: "version" }, boolean: ["help", "version"] })
            if (globals.version === true) {
                this.output.line(`${this.name} ${this.version}`)
                return ExitCode.SUCCESS
            }

            return this.dispatchByName(this.defaultCommand, [])
        }

        const definition = this.commands.get(head)
        if (!definition) {
            // A bare namespace (`architect vendor`) lists that namespace's commands.
            if (rest.length === 0 && this.isNamespace(head)) {
                return this.dispatchByName(this.defaultCommand, [head])
            }

            this.output.error(`Command "${head}" is not defined.`)
            return ExitCode.INVALID
        }

        // Everything after a standalone `--` is passed through unparsed.
        const cut = rest.indexOf("--")
        const flags = cut === -1 ? rest : rest.slice(0, cut)
        const passthrough = cut === -1 ? undefined : rest.slice(cut + 1)

        const parsed = parse(flags, this.parseOptions(definition)) as ParsedArgs

        if (parsed.help === true) {
            return this.dispatchByName("help", [definition.name])
        }

        return this.dispatch(definition, parsed, passthrough)
    }

    /** Whether `prefix` is the namespace of at least one registered `prefix:*` command. */
    protected isNamespace(prefix: string): boolean {
        for (const name of this.commands.keys()) {
            if (name.startsWith(`${prefix}:`)) {
                return true
            }
        }

        return false
    }

    protected parseOptions(definition: CommandDefinition): ParseOptions {
        const boolean = ["help"]
        const string: string[] = []
        const array: string[] = []
        const alias: Record<string, string> = { h: "help" }

        for (const option of definition.options) {
            if (option.array) {
                array.push(option.name)
            } else if (option.acceptsValue) {
                string.push(option.name)
            } else {
                boolean.push(option.name)
            }

            if (option.shortcut) {
                alias[option.shortcut] = option.name
            }
        }

        return { boolean, string, array, alias }
    }

    protected dispatch(definition: CommandDefinition, parsed: ParsedArgs, passthrough?: string[]): Promise<number> {
        const input = this.buildInput(definition, parsed, passthrough)
        const missing = definition.arguments
            .filter((argument) => argument.required && input.arguments[argument.name] === undefined)
            .map((argument) => argument.name)

        if (missing.length > 0) {
            this.output.error(`Not enough arguments (missing: ${missing.join(", ")}).`)
            return Promise.resolve(ExitCode.INVALID)
        }

        return definition.handle(input)
    }

    protected async dispatchByName(name: string, argv: string[]): Promise<number> {
        if (!this.commands.has(name)) {
            this.output.error(`Command "${name}" is not defined.`)
            return ExitCode.INVALID
        }

        return this.run([name, ...argv])
    }

    protected buildInput(definition: CommandDefinition, parsed: ParsedArgs, passthrough?: string[]): ParsedInput {
        const positionals = (parsed._ ?? []).map(String)
        const args: ParsedInput["arguments"] = {}

        definition.arguments.forEach((argument, index) => {
            args[argument.name] = this.coerceArgument(argument, positionals[index], positionals.slice(index))
        })

        const options: ParsedInput["options"] = {}
        for (const option of definition.options) {
            options[option.name] = this.coerceOption(option, parsed)
        }

        return { arguments: args, options, passthrough }
    }

    protected coerceArgument(
        argument: ArgumentDefinition,
        value: string | undefined,
        rest: string[],
    ): string | string[] | undefined {
        if (argument.array) {
            return rest.length > 0 ? rest : (argument.default as string[] | undefined)
        }

        return value ?? (argument.default as string | undefined)
    }

    protected coerceOption(
        option: OptionDefinition,
        raw: Record<string, unknown>,
    ): string | string[] | boolean | undefined {
        const value = raw[option.name]

        if (option.array) {
            if (value === undefined) return (option.default as string[] | undefined) ?? []
            return (Array.isArray(value) ? value : [value]).map(String)
        }

        if (option.acceptsValue) {
            if (value === undefined) return option.default as string | undefined
            return Array.isArray(value) ? String(value[value.length - 1]) : String(value)
        }

        return value === undefined ? Boolean(option.default) : Boolean(value)
    }
}
