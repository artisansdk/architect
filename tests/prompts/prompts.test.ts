import { afterEach, describe, expect, test } from "bun:test"
import ClackPromptDriver from "@/prompts/clack"
import { NonInteractiveError } from "@/prompts/contract"
import FakePromptDriver from "@/prompts/fake"
import { confirm, fakePrompts, multiselect, select, setPromptDriver, text } from "@/prompts/index"

afterEach(() => setPromptDriver(null))

describe("prompt functions", () => {
    test("delegate to the installed driver", async () => {
        const fake = fakePrompts(["Ada", true])

        expect(await text("Name")).toBe("Ada")
        expect(await confirm("Sure?")).toBe(true)
        expect(fake.asked).toHaveLength(2)
    })

    test("keyed fake answers match by label", async () => {
        fakePrompts({ Role: "admin" })
        expect(await select("Role", { options: { admin: "Administrator", member: "Member" } })).toBe("admin")
    })

    test("fake falls back to the option default when no answer is queued", async () => {
        fakePrompts()
        expect(await text("Name", { default: "Taylor" })).toBe("Taylor")
        expect(await confirm("Continue?", { default: true })).toBe(true)
        expect(await multiselect("Pick", { options: { a: "A" } })).toEqual([])
    })
})

describe("FakePromptDriver", () => {
    test("records the type and label of every prompt", async () => {
        const fake = new FakePromptDriver({ "Q?": "yes" })
        await fake.text("Q?")
        await fake.password("secret?")

        expect(fake.asked).toEqual([
            { type: "text", label: "Q?" },
            { type: "password", label: "secret?" },
        ])
    })
})

describe("ClackPromptDriver non-interactive fallback", () => {
    const driver = new ClackPromptDriver(false)

    test("text returns its default or throws when required with none", async () => {
        expect(await driver.text("Name", { default: "x" })).toBe("x")
        await expect(driver.text("Name")).rejects.toBeInstanceOf(NonInteractiveError)
    })

    test("confirm returns its default", async () => {
        expect(await driver.confirm("Ok?", { default: true })).toBe(true)
        expect(await driver.confirm("Ok?")).toBe(false)
    })

    test("select returns the default or first option", async () => {
        expect(await driver.select("Pick", { options: { a: "A", b: "B" } })).toBe("a")
        expect(await driver.select("Pick", { options: { a: "A", b: "B" }, default: "b" })).toBe("b")
    })

    test("password always throws without a TTY", async () => {
        await expect(driver.password("Token")).rejects.toBeInstanceOf(NonInteractiveError)
    })
})
