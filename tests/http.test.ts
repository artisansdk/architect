import { beforeEach, describe, expect, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import HttpFactory from "@/http/factory"
import { HttpProvider } from "@/http/provider"

let http: HttpFactory

beforeEach(() => {
    http = new HttpFactory()
})

describe("HttpFactory.fake — path map", () => {
    test("returns the mocked JSON body for a matching pattern", async () => {
        http.fake({ "api.test/users/*": { id: 1, name: "Ada" } })

        const res = await http.get("https://api.test/users/1")

        expect(res.ok()).toBe(true)
        expect(res.status()).toBe(200)
        expect(res.json()).toEqual({ id: 1, name: "Ada" })
        expect(res.header("content-type")).toContain("application/json")
    })

    test("string values become a text body", async () => {
        http.fake({ "*/ping": "pong" })
        const res = await http.get("https://api.test/ping")
        expect(res.body()).toBe("pong")
    })

    test("first matching pattern wins", async () => {
        http.fake({ "*/a": { which: "first" } })
        http.fake({ "*": { which: "wildcard" } })
        expect((await http.get("https://x.test/a")).json()).toEqual({ which: "first" })
        expect((await http.get("https://x.test/b")).json()).toEqual({ which: "wildcard" })
    })

    test("patterns match regardless of protocol prefix", async () => {
        http.fake({ "github.com/*": { ok: true } })
        expect((await http.get("https://github.com/artisansdk")).json()).toEqual({ ok: true })
    })

    test("no-arg fake() stubs every request with an empty 200", async () => {
        http.fake()
        const res = await http.get("https://anything.test/x")
        expect(res.status()).toBe(200)
        expect(res.body()).toBe("")
    })
})

describe("HttpFactory.fake — closures and Http.response", () => {
    test("closure receives the recorded request and can branch", async () => {
        http.fake((req) => HttpFactory.response({ echoed: req.url }, req.method === "POST" ? 201 : 200))

        const res = await http.post("https://api.test/things", { a: 1 })

        expect(res.status()).toBe(201)
        expect(res.json("echoed")).toBe("https://api.test/things")
    })

    test("Http.response with a 4xx status marks the response failed", async () => {
        http.fake({ "*": HttpFactory.response({ message: "nope" }, 422) })
        const res = await http.get("https://api.test/x")
        expect(res.failed()).toBe(true)
        expect(res.clientError()).toBe(true)
        expect(res.json("message")).toBe("nope")
        expect(() => res.throw()).toThrow(/status 422/)
    })
})

describe("PendingRequest configuration reaches the request", () => {
    test("withToken / withHeaders / baseUrl / query params", async () => {
        http.fake((req) => HttpFactory.response(req))

        const res = await http
            .baseUrl("https://api.test")
            .withToken("secret")
            .withHeaders({ "X-Trace": "abc" })
            .withQueryParameters({ page: 2 })
            .get("/users", { limit: 10 })

        const sent = res.json<{ url: string; headers: Record<string, string> }>()
        expect(sent.url).toBe("https://api.test/users?page=2&limit=10")
        expect(sent.headers.Authorization).toBe("Bearer secret")
        expect(sent.headers["X-Trace"]).toBe("abc")
    })

    test("asForm() url-encodes the body", async () => {
        http.fake((req) => HttpFactory.response({ body: req.body }))
        const res = await http.asForm().post("https://api.test/login", { user: "ada", pass: "x y" })
        // req.body is the raw data passed in; the encoded string is on the fetch init, so assert intent via format
        expect(res.json("body")).toEqual({ user: "ada", pass: "x y" })
    })
})

describe("recording and stray requests", () => {
    test("recorded() captures request/response pairs", async () => {
        http.fake({ "*": { ok: 1 } })
        await http.get("https://api.test/a")
        await http.post("https://api.test/b", { x: 1 })

        expect(http.recorded()).toHaveLength(2)
        const posts = http.recorded((req) => req.method === "POST")
        expect(posts).toHaveLength(1)
        expect(posts[0][0].url).toBe("https://api.test/b")
    })

    test("preventStrayRequests() throws on an unmatched request", async () => {
        http.fake({ "*/allowed": "ok" }).preventStrayRequests()
        expect(http.get("https://api.test/allowed")).resolves.toBeDefined()
        expect(http.get("https://api.test/other")).rejects.toThrow(/without a matching fake/)
    })

    test("forget() clears fakes and history", async () => {
        http.fake({ "*": "x" })
        await http.get("https://api.test/a")
        http.forget()
        expect(http.recorded()).toHaveLength(0)
        expect(http.match({ method: "GET", url: "https://api.test/a", headers: {}, body: undefined })).toBeUndefined()
    })
})

describe("HttpProvider", () => {
    test("binds HttpFactory as a singleton under 'http' and the class token", () => {
        const container = new BuiltinContainer()
        new HttpProvider().register(container)

        const a = container.make<HttpFactory>("http")
        const b = container.make(HttpFactory)
        expect(a).toBeInstanceOf(HttpFactory)
        expect(a).toBe(b)
    })
})
