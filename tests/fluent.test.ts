import { describe, expect, test } from "bun:test"
import { Fluent } from "@/support/fluent"

describe("Fluent", () => {
    test("get() reads top-level keys", () => {
        const f = new Fluent({ name: "ioc", version: 1 })
        expect(f.get("name")).toBe("ioc")
        expect(f.get("version")).toBe(1)
    })

    test("get() reads dot-notation paths", () => {
        const f = new Fluent({ db: { host: "localhost", port: 5432 } })
        expect(f.get("db.host")).toBe("localhost")
        expect(f.get("db.port")).toBe(5432)
    })

    test("get() returns defaultValue for missing paths", () => {
        const f = new Fluent({ a: 1 })
        expect(f.get("missing")).toBeNull()
        expect(f.get("missing", "default")).toBe("default")
        expect(f.get("a.b.c")).toBeNull()
    })

    test("set() writes top-level and nested keys", () => {
        const f = new Fluent<Record<string, unknown>>({})
        f.set("name", "ioc")
        f.set("db.host", "localhost")
        expect(f.get("name")).toBe("ioc")
        expect(f.get("db.host")).toBe("localhost")
    })

    test("set() returns this for chaining", () => {
        const f = new Fluent<Record<string, unknown>>({})
        const result = f.set("a", 1).set("b", 2)
        expect(result).toBe(f)
        expect(f.get("a")).toBe(1)
        expect(f.get("b")).toBe(2)
    })

    test("has() returns true for present, false for missing", () => {
        const f = new Fluent({ name: "ioc" })
        expect(f.has("name")).toBe(true)
        expect(f.has("missing")).toBe(false)
        expect(f.has("name.nested")).toBe(false)
    })

    test("toArray() returns a shallow copy", () => {
        const attrs = { a: 1, b: 2 }
        const f = new Fluent(attrs)
        const arr = f.toArray()
        expect(arr).toEqual({ a: 1, b: 2 })
        expect(arr).not.toBe(attrs)
    })

    test("property access is equivalent to get()", () => {
        const f = new Fluent({ name: "ioc", db: { host: "localhost", port: 5432 } })
        expect(f.name).toBe(f.get("name"))
        expect(f.db).toEqual(f.get("db"))
        expect((f.db as Record<string, unknown>).host).toBe(f.get("db.host"))
    })

    test("serializes chained attributes as JSON and strings", () => {
        const f = new Fluent().set("user.name", "Alice").set("active", true)
        const json = '{"user":{"name":"Alice"},"active":true}'

        expect(f.toJson()).toBe(json)
        expect(f.json()).toBe(json)
        expect(f.toString()).toBe(json)
        expect(String(f)).toBe(json)
        expect(JSON.stringify({ profile: f })).toBe(`{"profile":${json}}`)
        expect(f.toJson(true)).toBe(JSON.stringify(f.toArray(), null, 2))
        expect(f.json(true)).toBe(f.toJson(true))
    })

    test("property access returns undefined for missing keys", () => {
        const f = new Fluent({ name: "ioc" })
        expect((f as unknown as Record<string, unknown>).missing).toBeUndefined()
    })

    test("class methods take priority over attribute keys of the same name", () => {
        const f = new Fluent({ get: "overridden", set: "overridden" } as Record<string, unknown>)
        expect(typeof f.get).toBe("function")
        expect(typeof f.set).toBe("function")
    })

    test("constructor copies attributes — mutations don't leak", () => {
        const attrs: Record<string, unknown> = { a: 1 }
        const f = new Fluent(attrs)
        // biome-ignore lint/complexity/useLiteralKeys: "a" is only allowed inside the class.
        attrs["a"] = 999
        expect(f.get("a")).toBe(1)
    })
})
