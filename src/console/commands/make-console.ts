import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { Str } from "../../support/str"
import Command, { ExitCode } from "../command"

/**
 * `architect make:console SendReport` — scaffolds a new Console command class.
 * This is the one generator Architect owns; package-specific generators
 * (`make:query`, `make:command`) stay in their packages.
 */
export default class MakeConsoleCommand extends Command {
    readonly signature =
        "make:console {name? : The command class name} {--path= : Directory to write into} {--force : Overwrite an existing file}"

    readonly description = "Create a new Console command class"

    async handle(): Promise<number | void> {
        const raw = (this.argument("name") as string | undefined) ?? (await this.promptForName())
        if (!raw) {
            this.error("A command name is required.")
            return ExitCode.INVALID
        }

        const className = Str.studly(raw).endsWith("Command") ? Str.studly(raw) : `${Str.studly(raw)}Command`
        const fileBase = Str.kebab(className.replace(/Command$/, ""))
        const signature = `app:${fileBase}`

        const directory = (this.option("path") as string | undefined) || join("src", "console", "commands")
        const target = resolve(process.cwd(), directory, `${fileBase}.ts`)

        if (existsSync(target) && this.option("force") !== true) {
            this.error(`${target} already exists. Use --force to overwrite.`)
            return ExitCode.FAILURE
        }

        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, this.stub(className, signature))

        this.info(`Created command [${target}].`)
        this.comment(`Register it with .withCommands([${className}]) or expose it via package.json#architect.commands.`)
    }

    protected promptForName(): Promise<string> {
        return this.ask("What should the command be called?", {
            placeholder: "SendReport",
            required: true,
        })
    }

    protected stub(className: string, signature: string): string {
        return `import { Command } from "@artisansdk/architect/console"

export default class ${className} extends Command {
    readonly signature = "${signature}"

    readonly description = "Command description"

    async handle(): Promise<void> {
        this.info("${className} ran.")
    }
}
`
    }
}
