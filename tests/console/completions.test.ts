import { afterEach, describe, expect, spyOn, test } from "bun:test"
import ConsoleApplication from "@/console/application"
import Command from "@/console/command"
import { Buffered as BufferedOutputWriter } from "@/console/output/drivers/buffer"
import Output from "@/console/output/service"
import FakePromptDriver from "@/prompts/fake"

class GreetCommand extends Command {
    readonly signature = "greet {name} {--loud} {--f|force}"
    readonly description = "Greet someone"
    async handle(): Promise<void> {}
}

function buildApp() {
    const buffer = new BufferedOutputWriter()
    const app = new ConsoleApplication({
        version: "9.9.9",
        output: new Output(buffer),
        prompts: new FakePromptDriver(),
    })
    app.add(GreetCommand)
    return { app, buffer }
}

let logSpy: ReturnType<typeof spyOn>

afterEach(() => logSpy?.mockRestore())

function captureStdout(): void {
    logSpy = spyOn(console, "log").mockImplementation(() => {})
}

function printed(): string {
    return (logSpy.mock.calls.flat() as string[]).join("\n")
}

describe("architect complete", () => {
    test("without a shell it prints install guidance to Output", async () => {
        const { app, buffer } = buildApp()
        const status = await app.run(["complete"])

        expect(status).toBe(0)
        expect(buffer.output()).toContain("complete <shell>")
        expect(buffer.output()).toContain("zsh")
    })

    test("rejects an unsupported shell", async () => {
        const { app, buffer } = buildApp()
        const status = await app.run(["complete", "tcsh"])

        expect(status).toBe(2)
        expect(buffer.errors()).toContain('Unsupported shell "tcsh"')
    })

    test("generates a shell script for a supported shell", async () => {
        const { app } = buildApp()
        captureStdout()

        await app.run(["complete", "zsh"])

        expect(printed()).toContain("#compdef architect")
        expect(printed()).toContain("architect complete -- ")
    })

    test("resolves command completions from the live registry via passthrough", async () => {
        const { app } = buildApp()
        captureStdout()

        await app.run(["complete", "--", "gre"])

        expect(printed()).toContain("greet")
        expect(printed()).toContain("Greet someone")
    })

    test("resolves option completions for a matched command", async () => {
        const { app } = buildApp()
        captureStdout()

        await app.run(["complete", "--", "greet", "--"])

        expect(printed()).toContain("--loud")
        expect(printed()).toContain("--force")
    })

    test("`complete` is excluded from its own completion output", async () => {
        const { app } = buildApp()
        captureStdout()

        await app.run(["complete", "--", ""])

        expect(printed()).not.toMatch(/^complete\t/m)
        expect(printed()).toMatch(/^greet\t/m)
    })
})

describe("passthrough tokens", () => {
    test("a standalone -- routes the rest to Input.passthrough()", async () => {
        const buffer = new BufferedOutputWriter()
        const app = new ConsoleApplication({ output: new Output(buffer), prompts: new FakePromptDriver() })

        class EchoCommand extends Command {
            readonly signature = "echo {name}"
            async handle(): Promise<void> {
                this.line(JSON.stringify(this.passthrough()))
            }
        }

        app.add(EchoCommand)
        await app.run(["echo", "here", "--", "--not-a-flag", "x"])

        expect(buffer.output()).toBe(JSON.stringify(["--not-a-flag", "x"]))
    })
})
