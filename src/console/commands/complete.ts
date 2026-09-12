import { RootCommand } from "@bomb.sh/tab"
import type ConsoleApplication from "../application"
import Command, { ExitCode } from "../command"

const SHELLS = ["zsh", "bash", "fish", "powershell"] as const
type Shell = (typeof SHELLS)[number]

/**
 * `architect complete <shell>` — shell tab-completion, backed by `@bomb.sh/tab`.
 *
 * ```
 * architect complete zsh >> ~/.zshrc      # install the completion script
 * ```
 *
 * The generated script calls `architect complete -- <words>` on every <TAB>;
 * that request arrives here as {@link passthrough} tokens and is answered from
 * the live command registry, so completions never go stale.
 */
export default class CompleteCommand extends Command {
    readonly signature = "complete {shell? : Shell to generate a completion script for (zsh, bash, fish, powershell)}"

    readonly description = "Generate or resolve shell completions"

    async handle(): Promise<number | void> {
        const app = this.container.make<ConsoleApplication>("console")
        const root = this.buildRegistry(app)

        // A live completion request from the installed shell script.
        if (this.input.hasPassthrough()) {
            root.parse(this.passthrough())
            return
        }

        const shell = this.argument("shell") as string | undefined
        if (!shell) {
            this.line(`Usage: ${app.name} complete <shell>`)
            this.line()
            this.line(`Supported shells: ${SHELLS.join(", ")}`)
            this.comment(`  ${app.name} complete zsh >> ~/.zshrc`)
            return
        }

        if (!SHELLS.includes(shell as Shell)) {
            this.error(`Unsupported shell "${shell}". Choose one of: ${SHELLS.join(", ")}.`)
            return ExitCode.INVALID
        }

        root.setup(app.name, app.name, shell)
    }

    protected buildRegistry(app: ConsoleApplication): RootCommand {
        const root = new RootCommand()

        for (const definition of app.commands()) {
            if (definition.name === "complete") {
                continue
            }

            const command = root.command(definition.name, definition.description)

            for (const argument of definition.arguments) {
                command.argument(argument.name, undefined, argument.array)
            }

            for (const option of definition.options) {
                command.option(option.name, option.description, option.shortcut)
            }
        }

        return root
    }
}
