import type ConsoleApplication from "../application"
import Command from "../command"
import type CommandDefinition from "../contracts/command"

/**
 * `architect list` — the default command; shows every command grouped by
 * namespace. `architect list <namespace>` (and the shorthand `architect
 * <namespace>`) narrows the listing to one namespace.
 */
export default class ListCommand extends Command {
    readonly signature = "list {namespace? : Only show commands in this namespace}"
    readonly description = "List all available commands"

    async handle(): Promise<void> {
        const app = this.container.make<ConsoleApplication>("console")
        const namespace = this.argument("namespace") as string | undefined

        let commands = app.commands().filter((command) => !command.hidden)
        if (namespace) {
            commands = commands.filter((command) => command.name.startsWith(`${namespace}:`))

            if (commands.length === 0) {
                this.warn(`There are no commands in the "${namespace}" namespace.`)
                return
            }

            this.heading(`Commands in the "${namespace}" namespace:`)
        } else {
            this.heading("Available commands:")
        }

        const width = Math.max(...commands.map((command) => command.name.length), 0)

        const render = (command: CommandDefinition) => {
            const padding = " ".repeat(width - command.name.length + 2)
            this.line(`  ${command.name}${padding}${command.description}`)
        }

        // Inside a single namespace the group headers would just repeat it.
        if (namespace) {
            for (const command of commands) render(command)
            return
        }

        const groups = this.group(commands)
        for (const group of Object.keys(groups).sort()) {
            if (group) {
                this.comment(` ${group}`)
            }

            for (const command of groups[group]) render(command)
        }
    }

    protected group(commands: CommandDefinition[]): Record<string, CommandDefinition[]> {
        const groups: Record<string, CommandDefinition[]> = {}

        for (const command of commands) {
            const namespace = command.name.includes(":") ? command.name.split(":")[0] : ""
            ;(groups[namespace] ??= []).push(command)
        }

        return groups
    }
}
