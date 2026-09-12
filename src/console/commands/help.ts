import type ConsoleApplication from "../application"
import Command, { ExitCode } from "../command"
import type ArgumentDefinition from "../contracts/argument"
import type OptionDefinition from "../contracts/option"

/** `architect help <command>` — prints a command's signature, arguments and options. */
export default class HelpCommand extends Command {
    readonly signature = "help {command=list : The command to describe}"
    readonly description = "Display help for a command"

    async handle(): Promise<number | void> {
        const app = this.container.make<ConsoleApplication>("console")
        const name = String(this.argument("command"))
        const definition = app.command(name)

        if (!definition) {
            this.error(`Command "${name}" is not defined.`)
            return ExitCode.INVALID
        }

        if (definition.description) {
            this.line(definition.description)
            this.line()
        }

        this.comment("Usage:")
        this.line(`  ${this.usage(name, definition.arguments, definition.options)}`)

        if (definition.arguments.length > 0) {
            this.line()
            this.comment("Arguments:")
            for (const argument of definition.arguments) {
                this.line(`  ${argument.name.padEnd(20)}${argument.description}`)
            }
        }

        if (definition.options.length > 0) {
            this.line()
            this.comment("Options:")
            for (const option of definition.options) {
                const flag = `${option.shortcut ? `-${option.shortcut}, ` : ""}--${option.name}`
                this.line(`  ${flag.padEnd(20)}${option.description}`)
            }
        }
    }

    protected usage(name: string, args: ArgumentDefinition[], options: OptionDefinition[]): string {
        const parts = [name]

        if (options.length > 0) {
            parts.push("[options]")
        }

        for (const argument of args) {
            const token = argument.array ? `${argument.name}...` : argument.name
            parts.push(argument.required ? `<${token}>` : `[${token}]`)
        }

        return parts.join(" ")
    }
}
