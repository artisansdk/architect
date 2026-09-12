import { describe, expect, test } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import ConsoleApplication from "@/console/application"
import Command, { ExitCode } from "@/console/command"
import { Buffered as BufferedOutputWriter } from "@/console/output/drivers/buffer"
import Output from "@/console/output/service"
import FakePromptDriver from "@/prompts/fake"

function buildApp(prompts = new FakePromptDriver()) {
    const buffer = new BufferedOutputWriter()
    const app = new ConsoleApplication({ version: "9.9.9", output: new Output(buffer), prompts })
    return { app, buffer }
}

class GreetCommand extends Command {
    readonly signature = "greet {name} {--loud} {--times=1}"
    readonly description = "Greet someone"

    async handle(): Promise<void> {
        const times = Number(this.option("times"))
        const message = `Hello, ${this.argument("name")}`
        for (let i = 0; i < times; i++) {
            this.info(this.option("loud") ? message.toUpperCase() : message)
        }
    }
}

class FailCommand extends Command {
    readonly signature = "boom"
    async handle(): Promise<number> {
        this.error("kaboom")
        return ExitCode.FAILURE
    }
}

describe("ConsoleApplication", () => {
    test("runs a registered command and coerces arguments and options", async () => {
        const { app, buffer } = buildApp()
        app.add(GreetCommand)

        const status = await app.run(["greet", "Taylor", "--loud", "--times", "2"])

        expect(status).toBe(0)
        expect(buffer.stdout).toEqual(["HELLO, TAYLOR", "HELLO, TAYLOR"])
    })

    test("collects repeatable options and resolves short aliases", async () => {
        const { app, buffer } = buildApp()

        class TagCommand extends Command {
            readonly signature = "tag {--tag=*} {--f|force}"
            async handle(): Promise<void> {
                this.line(JSON.stringify({ tag: this.option("tag"), force: this.option("force") }))
            }
        }

        app.add(TagCommand)
        await app.run(["tag", "--tag", "a", "--tag", "b", "-f"])

        expect(buffer.output()).toBe(JSON.stringify({ tag: ["a", "b"], force: true }))
    })

    test("a bare invocation behaves like `list`", async () => {
        const { app, buffer } = buildApp()
        const status = await app.run([])

        expect(status).toBe(0)
        expect(buffer.output()).toContain("Available commands:")
        expect(buffer.output()).toContain("make:console")
    })

    test("a bare namespace lists that namespace's commands", async () => {
        const { app, buffer } = buildApp()

        const status = await app.run(["make"])

        expect(status).toBe(0)
        expect(buffer.output()).toContain('"make" namespace')
        expect(buffer.output()).toContain("make:console")
        expect(buffer.output()).not.toContain("vendor:publish")
    })

    test("an unknown token that is not a namespace still errors", async () => {
        const { app, buffer } = buildApp()

        const status = await app.run(["nope"])

        expect(status).toBe(ExitCode.INVALID)
        expect(buffer.errors()).toContain('"nope" is not defined')
    })

    test("`list <namespace>` filters and reports an empty namespace", async () => {
        const { app, buffer } = buildApp()

        await app.run(["list", "ghost"])

        expect(buffer.errors() + buffer.output()).toContain('no commands in the "ghost" namespace')
    })

    test("`help` describes a command's arguments and options", async () => {
        const { app, buffer } = buildApp()
        app.add(GreetCommand)

        await app.run(["help", "greet"])

        expect(buffer.output()).toContain("greet")
        expect(buffer.output()).toContain("--loud")
        expect(buffer.output()).toContain("Greet someone")
    })

    test("--version prints the configured version", async () => {
        const { app, buffer } = buildApp()
        const status = await app.run(["--version"])

        expect(status).toBe(0)
        expect(buffer.output()).toContain("9.9.9")
    })

    test("an unknown command exits non-zero", async () => {
        const { app, buffer } = buildApp()
        const status = await app.run(["nope"])

        expect(status).toBe(ExitCode.INVALID)
        expect(buffer.errors()).toContain('"nope" is not defined')
    })

    test("a missing required argument exits non-zero without running the command", async () => {
        const { app, buffer } = buildApp()
        app.add(GreetCommand)

        const status = await app.run(["greet"])

        expect(status).toBe(ExitCode.INVALID)
        expect(buffer.errors()).toContain("missing: name")
    })

    test("a command's returned exit code is propagated", async () => {
        const { app } = buildApp()
        app.add(FailCommand)

        expect(await app.run(["boom"])).toBe(ExitCode.FAILURE)
    })

    test("duplicate command names are rejected", () => {
        const { app } = buildApp()
        app.add(GreetCommand)

        expect(() => app.add(GreetCommand)).toThrow(/already registered/)
    })

    test("commands can drive prompts through a fake driver", async () => {
        const prompts = new FakePromptDriver({ "Your name?": "Ada", "Continue?": true })
        const { app, buffer } = buildApp(prompts)

        class AskCommand extends Command {
            readonly signature = "ask"
            async handle(): Promise<void> {
                const name = await this.ask("Your name?")
                if (await this.confirm("Continue?")) {
                    this.info(`Hi ${name}`)
                }
            }
        }

        app.add(AskCommand)
        await app.run(["ask"])

        expect(buffer.output()).toBe("Hi Ada")
        expect(prompts.asked.map((entry) => entry.type)).toEqual(["text", "confirm"])
    })

    test("make:console prompts for a name when the argument is omitted", async () => {
        const dir = join(import.meta.dir, "../.tmp-make-console")
        rmSync(dir, { recursive: true, force: true })

        const prompts = new FakePromptDriver(["SendReport"])
        const { app, buffer } = buildApp(prompts)

        try {
            const status = await app.run(["make:console", "--path", dir])

            expect(status).toBe(0)
            expect(prompts.asked).toEqual([{ type: "text", label: "What should the command be called?" }])
            expect(existsSync(join(dir, "send-report.ts"))).toBe(true)
            expect(buffer.output()).toContain("SendReportCommand")
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    test("an error thrown from handle() is reported and exits non-zero", async () => {
        const { app, buffer } = buildApp()

        class ThrowCommand extends Command {
            readonly signature = "throws"
            async handle(): Promise<void> {
                throw new Error("boom from handle")
            }
        }

        app.add(ThrowCommand)
        const status = await app.run(["throws"])

        expect(status).toBe(ExitCode.FAILURE)
        expect(buffer.errors()).toContain("boom from handle")
    })

    test("resolves commands through the container so constructor deps work", async () => {
        const { app, buffer } = buildApp()
        app.container.instance("greeting", "Bonjour")

        class InjectedCommand extends Command {
            readonly signature = "injected"
            async handle(): Promise<void> {
                this.info(app.container.make<string>("greeting"))
            }
        }

        app.add(InjectedCommand)
        await app.run(["injected"])

        expect(buffer.output()).toBe("Bonjour")
    })
})
