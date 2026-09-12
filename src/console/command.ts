import type { Container } from "../container/contract"
import type { PromptDriver } from "../prompts/contract"
import type Input from "./input"
import type Output from "./output/service"

/** Conventional process exit codes, mirrored from `sysexits.h` where useful. */
export const ExitCode = {
    SUCCESS: 0,
    FAILURE: 1,
    INVALID: 2,
} as const

/**
 * The context the {@link ConsoleApplication} injects before calling `handle()`.
 * Kept off the constructor so container-resolved commands keep normal DI.
 */
export interface CommandContext {
    input: Input
    output: Output
    prompts: PromptDriver
    container: Container
}

/**
 * The public base every package command extends. Package authors only ever see
 * this and the abstractions it exposes — never `@bomb.sh/args`, `@clack/prompts`,
 * `process.argv`, or `process.stdout`.
 *
 * ```ts
 * export default class MakeQueryCommand extends Command {
 *     readonly signature = "make:query {name} {--force}"
 *     readonly description = "Create a new query"
 *
 *     async handle(): Promise<void> {
 *         this.info(`Created query [${this.argument("name")}].`)
 *     }
 * }
 * ```
 */
export default abstract class Command {
    abstract readonly signature: string
    readonly description: string = ""
    /** Hidden commands still run but don't appear in `architect list`. */
    readonly hidden: boolean = false

    protected context?: CommandContext
    protected exitCode: number = ExitCode.SUCCESS

    /** Wire the per-invocation context. Called by the {@link ConsoleApplication}. */
    setContext(context: CommandContext): this {
        this.context = context
        return this
    }

    /** The command body. Return nothing (exit 0) or an explicit exit code. */
    abstract handle(): Promise<number | void>

    protected get input(): Input {
        return this.requireContext().input
    }

    protected get output(): Output {
        return this.requireContext().output
    }

    protected get prompts(): PromptDriver {
        return this.requireContext().prompts
    }

    protected get container(): Container {
        return this.requireContext().container
    }

    /** Resolve and run another registered command by name, returning its exit code. */
    protected call(name: string, argv: string[] = []): Promise<number> {
        return this.container.make<{ run(argv: string[]): Promise<number> }>("console").run([name, ...argv])
    }

    protected requireContext(): CommandContext {
        if (!this.context) {
            throw new Error("Command context is not available. The command was invoked outside a ConsoleApplication.")
        }

        return this.context
    }

    // --- Arguments & options -------------------------------------------------

    protected argument(name: string): string | string[] | undefined {
        return this.input.argument(name)
    }

    protected arguments(): Record<string, string | string[] | undefined> {
        return this.input.arguments()
    }

    protected option(name: string): string | string[] | boolean | undefined {
        return this.input.option(name)
    }

    protected options(): Record<string, string | string[] | boolean | undefined> {
        return this.input.options()
    }

    /** Tokens after a standalone `--`, unparsed. */
    protected passthrough(): string[] {
        return this.input.passthrough()
    }

    // --- Output ------------------------------------------------------------

    protected line(message = ""): void {
        this.output.line(message)
    }

    protected info(message: string): void {
        this.output.info(message)
    }

    protected heading(message: string): void {
        this.output.heading(message)
    }

    protected warn(message: string): void {
        this.output.warn(message)
    }

    protected error(message: string): void {
        this.output.error(message)
    }

    protected comment(message: string): void {
        this.output.comment(message)
    }

    // --- Prompts ---------------------------------------------------------

    protected ask(label: string, options?: Parameters<PromptDriver["text"]>[1]): Promise<string> {
        return this.prompts.text(label, options)
    }

    protected secret(label: string, options?: Parameters<PromptDriver["password"]>[1]): Promise<string> {
        return this.prompts.password(label, options)
    }

    protected confirm(label: string, options?: Parameters<PromptDriver["confirm"]>[1]): Promise<boolean> {
        return this.prompts.confirm(label, options)
    }

    protected choice<T>(label: string, options: Parameters<PromptDriver["select"]>[1]): Promise<T> {
        return this.prompts.select(label, options) as Promise<T>
    }
}
