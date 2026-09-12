import { pathToFileURL } from "node:url"
import BuiltinContainer from "../container/adapters/builtin"
import type { Container } from "../container/contract"
import ClackPromptDriver from "../prompts/clack"
import type { PromptDriver } from "../prompts/contract"
import Command, { type CommandContext, ExitCode } from "./command"
import CompleteCommand from "./commands/complete"
import HelpCommand from "./commands/help"
import ListCommand from "./commands/list"
import MakeConsoleCommand from "./commands/make-console"
import PackageDiscoverCommand from "./commands/package-discover"
import VendorPublishCommand from "./commands/vendor-publish"
import type CommandDefinition from "./contracts/command"
import type ConsoleDriver from "./contracts/console-driver"
import type ParsedInput from "./contracts/parsed-input"
import { readManifest } from "./discovery"
import ArgsConsoleDriver from "./drivers/args"
import Input from "./input"
import Output from "./output/service"
import CommandRegistry, { type CommandSource } from "./registry"
import SignatureParser from "./signature-parser"

export interface ConsoleApplicationOptions {
    name?: string
    version?: string
    container?: Container
    driver?: ConsoleDriver
    output?: Output
    prompts?: PromptDriver
    /** Register the built-in commands (`list`, `help`, …). Defaults to `true`. */
    builtins?: boolean
}

const BUILTIN_COMMANDS: CommandSource[] = [
    ListCommand,
    HelpCommand,
    PackageDiscoverCommand,
    VendorPublishCommand,
    MakeConsoleCommand,
    CompleteCommand,
]

/**
 * The Node/Bun-safe orchestrator for a CLI. Mirrors the browser {@link
 * import("../foundation/application").Application} in spirit — resolve
 * everything through the container, run, return — but never touches `window`.
 *
 * ```ts
 * const status = await ConsoleApplication.create({ version: "1.0.0" })
 *     .withCommands([MakeQueryCommand])
 *     .run(process.argv.slice(2))
 * process.exit(status)
 * ```
 */
export default class ConsoleApplication {
    /** The binary name, e.g. `architect`. Used for help text and shell completions. */
    readonly name: string
    /** The CLI version string, surfaced by `--version`. */
    readonly version: string
    readonly container: Container
    readonly registry: CommandRegistry
    readonly output: Output
    readonly prompts: PromptDriver

    protected readonly parser = new SignatureParser()
    protected readonly driver: ConsoleDriver
    protected readonly definitions = new Map<string, CommandDefinition>()

    constructor(options: ConsoleApplicationOptions = {}) {
        this.name = options.name ?? "architect"
        this.version = options.version ?? "0.0.0"
        this.container = options.container ?? new BuiltinContainer()
        this.registry = new CommandRegistry()
        this.output = options.output ?? new Output()
        this.prompts = options.prompts ?? new ClackPromptDriver()
        this.driver =
            options.driver ?? new ArgsConsoleDriver({ name: this.name, version: this.version, output: this.output })

        this.container.instance("console", this)
        this.container.instance(ConsoleApplication, this)
        this.container.instance("console.registry", this.registry)
        this.container.instance(CommandRegistry, this.registry)
        this.container.instance("console.output", this.output)
        this.container.instance(Output, this.output)
        this.container.instance("prompts", this.prompts)

        if (options.builtins ?? true) {
            this.withCommands(BUILTIN_COMMANDS)
        }
    }

    static create(options?: ConsoleApplicationOptions): ConsoleApplication {
        return new ConsoleApplication(options)
    }

    /** Register a command class or instance, keyed by its signature name. */
    add(source: CommandSource, provider = "architect"): this {
        const probe = this.instantiate(source)
        const { name, arguments: args, options } = this.parser.parse(probe.signature)

        const definition: CommandDefinition = {
            name,
            description: probe.description ?? "",
            arguments: args,
            options,
            hidden: Boolean(probe.hidden),
            handle: (parsed: ParsedInput) => this.dispatch(source, args, options, parsed),
        }

        this.registry.register(name, source, provider)
        this.definitions.set(name, definition)
        this.driver.register(definition)

        return this
    }

    /** Every registered command's driver-agnostic definition, sorted by name. */
    commands(): CommandDefinition[] {
        return [...this.definitions.values()].sort((a, b) => a.name.localeCompare(b.name))
    }

    /** One command's definition by name. */
    command(name: string): CommandDefinition | undefined {
        return this.definitions.get(name)
    }

    /** The provider that registered a command (for `architect list`). */
    providerOf(name: string): string | undefined {
        return this.registry.providerOf(name)
    }

    withCommands(sources: CommandSource[], provider = "architect"): this {
        for (const source of sources) {
            this.add(source, provider)
        }

        return this
    }

    /**
     * Register every command listed in the cached package manifest (written by
     * `architect package:discover`). Duplicate command names are reported and
     * skipped rather than throwing, so one bad package can't break the CLI.
     */
    async discover(cwd: string = process.cwd()): Promise<this> {
        const manifest = readManifest(cwd)
        if (!manifest) {
            return this
        }

        for (const pkg of manifest.packages) {
            for (const modulePath of pkg.commands) {
                try {
                    const module = (await import(pathToFileURL(modulePath).href)) as { default?: CommandSource }
                    if (module.default) {
                        this.add(module.default, pkg.name)
                    }
                } catch (error) {
                    this.output.warn(
                        `Skipped command from [${pkg.name}] (${modulePath}): ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    )
                }
            }
        }

        return this
    }

    /** Parse `argv` (already stripped of `node`/script), run, resolve to an exit code. */
    run(argv: string[]): Promise<number> {
        return this.driver.run(argv)
    }

    protected instantiate(source: CommandSource): Command {
        return typeof source === "function" ? this.container.make<Command>(source) : source
    }

    protected async dispatch(
        source: CommandSource,
        args: CommandDefinition["arguments"],
        options: CommandDefinition["options"],
        parsed: ParsedInput,
    ): Promise<number> {
        const command = this.instantiate(source)
        const context: CommandContext = {
            input: new Input(parsed, args, options),
            output: this.output,
            prompts: this.prompts,
            container: this.container,
        }

        try {
            const result = await command.setContext(context).handle()
            return typeof result === "number" ? result : 0
        } catch (error) {
            this.output.error(error instanceof Error ? error.message : String(error))
            return ExitCode.FAILURE
        }
    }
}
