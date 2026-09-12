import { describe, expect, test } from "bun:test"
import SignatureParser from "@/console/signature-parser"

const parser = new SignatureParser()

describe("SignatureParser", () => {
    test("extracts the command name including its namespace", () => {
        expect(parser.parse("make:query {name}").name).toBe("make:query")
        expect(parser.parse("list").name).toBe("list")
    })

    test("throws when the signature has no name", () => {
        expect(() => parser.parse("{name}")).toThrow(/missing a command name/)
    })

    test("parses required, optional, default and variadic arguments", () => {
        const { arguments: args } = parser.parse("make:x {name} {title?} {locale=en} {files*}")

        expect(args[0]).toMatchObject({ name: "name", required: true, array: false })
        expect(args[1]).toMatchObject({ name: "title", required: false, array: false })
        expect(args[2]).toMatchObject({ name: "locale", required: false, default: "en" })
        expect(args[3]).toMatchObject({ name: "files", array: true, default: [] })
    })

    test("parses boolean, value, default-value and repeatable options", () => {
        const { options } = parser.parse("make:x {--force} {--package=} {--queue=sync} {--tag=*}")

        expect(options[0]).toMatchObject({ name: "force", acceptsValue: false, default: false })
        expect(options[1]).toMatchObject({ name: "package", acceptsValue: true, array: false })
        expect(options[2]).toMatchObject({ name: "queue", acceptsValue: true, default: "sync" })
        expect(options[3]).toMatchObject({ name: "tag", acceptsValue: true, array: true, default: [] })
    })

    test("parses option aliases", () => {
        const { options } = parser.parse("make:x {--f|force} {--h|help}")

        expect(options[0]).toMatchObject({ name: "force", shortcut: "f" })
        expect(options[1]).toMatchObject({ name: "help", shortcut: "h" })
    })

    test("captures trailing descriptions on arguments and options", () => {
        const { arguments: args, options } = parser.parse(
            "make:x {name : The resource name} {--force : Overwrite existing files}",
        )

        expect(args[0].description).toBe("The resource name")
        expect(options[0].description).toBe("Overwrite existing files")
    })
})
