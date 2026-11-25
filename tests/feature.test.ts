import { afterEach, describe, expect, mock, test } from "bun:test"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import FeatureContract from "@/feature/contract"
import StoreDriver from "@/feature/drivers/store"
import { Feature as Features } from "@/feature/feature"
import FeatureManager from "@/feature/manager"
import { FeatureProvider } from "@/feature/provider"
import { setContainer } from "@/foundation/container"
import type HttpFactory from "@/http/factory"
import { HttpProvider } from "@/http/provider"
import Lottery from "@/lottery/lottery"
import MemoryStoreAdapter from "@/store/adapters/memory"
import type StoreManager from "@/store/manager"
import { StoreProvider } from "@/store/provider"
import Feature from "@/support/facades/feature"
import LotteryFacade from "@/support/facades/lottery"

describe("Features", () => {
    test("instance() retrieves named implementations without evaluating or storing them", async () => {
        const store = new MemoryStoreAdapter()
        const resolver = mock(async (scope: string) => `variant:${scope}`)
        const features = new Features(new StoreDriver(store))
            .define("variant", resolver)
            .define("off", false)
            .define("zero", 0)

        expect(features.instance("variant")).toBe(resolver)
        expect(features.for("user:1").instance("variant")).toBe(resolver)
        expect(resolver).not.toHaveBeenCalled()
        expect(await features.instance("variant")("user:1")).toBe("variant:user:1")
        expect(features.instance("off")("global")).toBe(false)
        expect(features.instance("zero")("global")).toBe(0)
        expect(features.instance("missing")("global")).toBe("missing")
        expect(await store.keys()).toEqual([])
    })

    test("resolves once and persists the value", async () => {
        const store = new MemoryStoreAdapter()
        const resolver = mock(() => "b")
        const features = new Features(new StoreDriver(store)).define("variant", resolver)

        expect(await features.value("variant")).toBe("b")
        expect(await features.value("variant")).toBe("b")
        expect(resolver).toHaveBeenCalledTimes(1)
        expect(await store.get("feature:variant:global")).toBe("b")

        // A fresh instance over the same store (e.g. after a reload) keeps the assignment.
        const reloaded = new Features(new StoreDriver(store)).define("variant", () => "a")
        expect(await reloaded.value("variant")).toBe("b")
    })

    test("concurrent first reads share one resolution", async () => {
        let n = 0
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("ab", async () => ++n)
        const values = await Promise.all([features.value("ab"), features.value("ab"), features.value("ab")])
        expect(values).toEqual([1, 1, 1])
    })

    test("unknown features are false and not stored", async () => {
        const store = new MemoryStoreAdapter()
        const features = new Features(new StoreDriver(store))
        expect(await features.active("missing")).toBe(false)
        expect(await store.keys()).toEqual([])

        features.define("missing")
        expect(await features.active("missing")).toBe(true)
    })

    test("static values and nullish resolutions", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter()))
            .define("on", true)
            .define("off", () => undefined)
        expect(await features.active("on")).toBe(true)
        expect(await features.inactive("off")).toBe(true)
    })

    test("scopes are isolated and passed to the resolver", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("beta", (scope) =>
            scope.startsWith("staff:"),
        )
        expect(await features.for("staff:1").active("beta")).toBe(true)
        expect(await features.for("user:2").active("beta")).toBe(false)
        expect(await features.active("beta")).toBe(false)
    })

    test("activate, deactivate, forget and purge", async () => {
        const store = new MemoryStoreAdapter()
        const features = new Features(new StoreDriver(store)).define("x", false)

        expect(await features.active("x")).toBe(false)
        await features.activate("x", "variant-a")
        expect(await features.value("x")).toBe("variant-a")
        await features.deactivate("x")
        expect(await features.active("x")).toBe(false)
        await features.activate("x")
        await features.forget("x")
        expect(await features.active("x")).toBe(false)

        await features.for("u:1").activate("x")
        await features.for("u:2").activate("x")
        await features.activate("other")
        await features.purge("x")
        expect(await store.keys()).toEqual(["feature:other:global"])
        expect(await features.for("u:1").active("x")).toBe(false)

        await features.purge()
        expect(await store.keys()).toEqual([])
    })

    test("when() branches on the value", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("on", "v1").define("off", false)
        expect(
            await features.when(
                "on",
                (v) => `yes:${v}`,
                () => "no",
            ),
        ).toBe("yes:v1")
        expect(
            await features.when(
                "off",
                (v) => `yes:${v}`,
                () => "no",
            ),
        ).toBe("no")
        expect(await features.when("off", () => "yes")).toBeUndefined()
    })

    test("a rejected resolution is not memoized", async () => {
        let fail = true
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("x", () => {
            if (fail) throw new Error("boom")
            return true
        })
        await expect(features.value("x")).rejects.toThrow("boom")
        fail = false
        expect(await features.active("x")).toBe(true)
    })

    test("unless() only invokes the matching branch and passes the active value", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("off", false)
        const onInactive = mock(async (_features: Features) => "legacy")
        const onActive = mock(async (value: unknown, _features: Features) => `active:${value}`)

        expect(await features.unless("off", onInactive, onActive)).toBe("legacy")
        expect(onInactive).toHaveBeenCalledTimes(1)
        expect(onInactive).toHaveBeenCalledWith(features)
        expect(onActive).not.toHaveBeenCalled()

        for (const value of ["v1", 0, "", true]) {
            await features.activate("on", value)
            expect(await features.unless("on", onInactive, onActive)).toBe(`active:${value}`)
            expect(onActive).toHaveBeenLastCalledWith(value, features)
            expect(await features.unless("on", onInactive)).toBeUndefined()
        }
        expect(onInactive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(4)
        expect(await features.unless("missing", onInactive)).toBe("legacy")
    })

    test("unless() uses the selected scope", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define(
            "beta",
            (scope) => scope === "staff:1",
        )
        expect(
            await features.for("staff:1").unless(
                "beta",
                () => "legacy",
                () => "beta",
            ),
        ).toBe("beta")
        expect(
            await features.for("user:2").unless(
                "beta",
                () => "legacy",
                () => "beta",
            ),
        ).toBe("legacy")
    })

    test("conditional callbacks receive the scoped feature interaction", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter()))
            .define("on", "v1")
            .define("off", false)
            .define("scope", (scope) => scope)
            .for("user:42")

        for (const method of ["when", "unless"] as const) {
            const active = mock((value: unknown, scoped: Features) => {
                expect(value).toBe("v1")
                expect(scoped).toBe(features)
                return scoped.value("scope")
            })
            const inactive = mock((scoped: Features) => {
                expect(scoped).toBe(features)
                return scoped.value("scope")
            })

            for (const name of ["on", "off"]) {
                const result =
                    method === "when"
                        ? await features.when(name, active, inactive)
                        : await features.unless(name, inactive, active)
                expect(result).toBe("user:42")
            }
            expect(active).toHaveBeenCalledTimes(1)
            expect(inactive).toHaveBeenCalledTimes(1)
        }
    })
})

describe("multiple scopes", () => {
    test("for([...]) checks and updates every scope", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("beta", false)
        const both = features.for(["user:1", "user:2"])

        expect(await both.inactive("beta")).toBe(true)

        await features.for("user:1").activate("beta")
        expect(await both.active("beta")).toBe(false)
        expect(await both.inactive("beta")).toBe(false)

        await both.activate("beta", "v")
        expect(await both.active("beta")).toBe(true)
        expect(await features.for("user:2").value("beta")).toBe("v")
        await expect(both.value("beta")).rejects.toThrow("multiple scopes")

        await both.forget("beta")
        expect(await both.inactive("beta")).toBe(true)
    })

    test("for([]) is the null scope, not the default scope", async () => {
        const store = new MemoryStoreAdapter()
        const features = new Features(new StoreDriver(store)).define("who", (scope: unknown = null) => scope ?? "none")
        features.resolveScopeUsing(() => "user:1")

        expect(await features.for([]).value("who")).toBe("none")
        expect(await features.value("who")).toBe("user:1")
        expect(await store.keys()).toContain("feature:who:__architect_null")
    })
})

describe("FeatureProvider + Feature facade", () => {
    afterEach(() => setContainer(null))

    function boot(config: Record<string, unknown> = {}) {
        const container = new BuiltinContainer()
        container.instance("config", new ConfigRepository(config))
        new StoreProvider().register(container)
        new FeatureProvider().register(container)
        setContainer(container)
        return container
    }

    test('facade resolves through the "feature" binding', async () => {
        const container = boot()
        const manager = container.make<FeatureManager>("feature")
        expect(manager).toBeInstanceOf(FeatureManager)
        expect(container.make(FeatureManager)).toBe(manager)
        expect(container.make(Features)).toBe(manager.store())

        Feature.define("new-checkout", true)
        expect(await Feature.active("new-checkout")).toBe(true)
        expect(await Feature.for("user:1").active("missing")).toBe(false)
    })

    test("Feature.variant() picks through the Lottery facade and persists the pick", async () => {
        const container = boot()
        expect(LotteryFacade.pick(["a", "b"])).toBeInstanceOf(Lottery)

        Feature.variant("checkout", { a: 1, b: 1, c: 1 })
        const first = await Feature.value("checkout")
        expect(["a", "b", "c"]).toContain(first)
        expect(await container.make<StoreManager>("store").driver().get("feature:checkout:global")).toBe(first)
        for (let i = 0; i < 20; i++) expect(await Feature.value("checkout")).toBe(first)
        expect(await Feature.for(null).value("checkout")).toBe(false)
    })

    test("feature.store picks the store driver", async () => {
        const container = boot({ store: { driver: "memory" }, feature: { store: "indexed" } })
        const store = container.make<StoreManager>("store")
        await Feature.define("x", true).active("x")
        // indexed falls back to the shared memory adapter outside a browser, so the key is visible there.
        expect(await store.driver("indexed").has("feature:x:global")).toBe(true)
    })

    test("store() switches drivers, with definitions kept per store", async () => {
        const container = boot({ store: { driver: "memory" } })
        const store = container.make<StoreManager>("store")
        const local = Feature.store("local")
        expect(Feature.store("local")).toBe(local)

        local.define("x", true)
        expect(await local.active("x")).toBe(true)
        expect(local.defined()).toEqual(["x"])
        expect(Feature.defined()).toEqual([])
        expect(await store.driver("local").has("feature:x:global")).toBe(true)

        expect(() => Feature.store("missing")).toThrow("[missing]")
    })

    test("extend() registers a custom feature driver", async () => {
        boot()
        const driver = new StoreDriver(new MemoryStoreAdapter())
        const factory = mock(() => driver)
        Feature.extend("custom", factory)

        const custom = Feature.store("custom")
        expect(Feature.store("custom")).toBe(custom)
        expect(factory).toHaveBeenCalledTimes(1)
        expect(custom.getDriver()).toBe(driver)

        const names: string[] = []
        Feature.resolveScopeUsing((name) => names.push(name) && "user:1")
        await custom.active("x")
        expect(names).toEqual(["custom"])
    })

    test("flushCache() clears every store", async () => {
        boot()
        Feature.extend("other", () => new StoreDriver(new MemoryStoreAdapter()))
        const other = Feature.store("other")
        let n = 0
        Feature.define("n", () => ++n)
        other.define("n", () => ++n)
        expect(await Feature.value("n")).toBe(1)
        expect(await other.value("n")).toBe(2)

        // Drop stored values behind the cache's back; only a flush makes them re-resolve.
        await Feature.getDriver().purge(null)
        await other.getDriver().purge(null)
        expect(await Feature.value("n")).toBe(1)

        Feature.flushCache()
        expect(await Feature.value("n")).toBe(3)
        expect(await other.value("n")).toBe(4)
    })

    test("the default store is named after its store driver", async () => {
        const container = boot({ store: { driver: "local" } })
        const names: string[] = []
        Feature.resolveScopeUsing((driver) => {
            names.push(driver)
            return "user:1"
        })
        await Feature.active("x")
        expect(names).toEqual(["local"])
        expect(Feature.store("local")).toBe(container.make(Features))

        setContainer(null)
        boot({ store: { driver: "memory" }, feature: { store: "indexed" } })
        expect(Feature.store("indexed")).toBe(Feature.store("indexed"))
        expect(Feature.store("indexed").getDriver()).toBe(Feature.getDriver())
    })

    test("resolveScopeUsing() sets the default scope for every store", async () => {
        boot()
        let user: string | null = "user:1"
        const scoped = mock((driver: string) => {
            expect(typeof driver).toBe("string")
            return user
        })
        Feature.resolveScopeUsing(scoped)
        Feature.define("beta", (scope: string) => scope === "user:1")
        Feature.store("local").define("beta", (scope: string) => scope === "user:1")

        expect(await Feature.active("beta")).toBe(true)
        expect(await Feature.store("local").active("beta")).toBe(true)
        expect(await Feature.for("user:2").active("beta")).toBe(false)
        expect(scoped).toHaveBeenCalledWith("local")

        user = null // signed out
        expect(await Feature.active("beta")).toBe(false)
    })

    test("instance() returns the container-resolved feature without evaluating it", () => {
        const container = boot()
        class NewApi extends FeatureContract {
            resolve = mock((scope: string) => scope === "staff:1")
        }

        const features = container.make(Features)
        const instance = features.instance(NewApi)
        expect(instance).toBeInstanceOf(NewApi)
        expect(instance.resolve).not.toHaveBeenCalled()

        container.instance("api-version", "v2")
        class VersionedApi {
            constructor(public version: string) {}
            resolve = mock(() => this.version)
        }
        container.singleton(VersionedApi, (c) => new VersionedApi(c.make<string>("api-version")))

        const bound = Feature.instance(VersionedApi)
        expect(bound).toBe(container.make(VersionedApi))
        expect(bound.version).toBe("v2")
        expect(bound.resolve).not.toHaveBeenCalled()
    })

    test("unless() is available through the facade", async () => {
        boot()
        Feature.define("new-api", false)
        expect(
            await Feature.unless(
                "new-api",
                () => "legacy",
                () => "new",
            ),
        ).toBe("legacy")
    })
})

describe("Lottery", () => {
    const ids = Array.from({ length: 10_000 }, (_, i) => `user:${i + 1}`)

    test("draw(seed) is deterministic per seed, and splits evenly and independently across seeds", () => {
        const lottery = Lottery.odds(1, 2)
        expect(lottery.draw("new-ui:user:42")).toBe(Lottery.odds(1, 2).draw("new-ui:user:42"))

        const newUi = ids.map((id) => lottery.draw(`new-ui:${id}`) === true)
        const checkout = ids.map((id) => lottery.draw(`checkout:${id}`) === true)
        const share = newUi.filter(Boolean).length / ids.length
        const overlap = newUi.filter((won, i) => won && checkout[i]).length / ids.length
        expect(Math.abs(share - 0.5)).toBeLessThan(0.02)
        expect(Math.abs(overlap - 0.25)).toBeLessThan(0.03)
        expect(Lottery.odds(1, 4).draw("x")).toBe(Lottery.pick({ true: 1, false: 3 }).draw("x") === "true")
        expect(Lottery.odds(0, 2).draw("x")).toBe(false)
        expect(Lottery.odds(2, 2).draw("x")).toBe(true)
    })

    test("pick() draws equally from a list and by weight from a map", () => {
        const share = (values: unknown[], value: string) => values.filter((v) => v === value).length / ids.length

        const equal = Lottery.pick(["a", "b", "c"])
        const picks = ids.map((id) => equal.draw(id))
        for (const v of ["a", "b", "c"]) expect(Math.abs(share(picks, v) - 1 / 3)).toBeLessThan(0.02)
        expect(equal.draw("user:42")).toBe(picks[41])

        const weighted = Lottery.pick({ a: 2, b: 1, c: 1, never: 0 })
        const values = ids.map((id) => weighted.draw(id))
        expect(Math.abs(share(values, "a") - 0.5)).toBeLessThan(0.02)
        expect(Math.abs(share(values, "b") - 0.25)).toBeLessThan(0.02)
        expect(Math.abs(share(values, "c") - 0.25)).toBeLessThan(0.02)
        expect(values).not.toContain("never")
    })

    test("pick() rejects empty, negative, non-finite, and all-zero weights", () => {
        expect(() => Lottery.pick([])).toThrow()
        expect(() => Lottery.pick({ a: -1, b: 2 })).toThrow()
        expect(() => Lottery.pick({ a: Number.NaN })).toThrow()
        expect(() => Lottery.pick({ a: 0, b: 0 })).toThrow()
    })

    test("as a definition: random and persisted for global, seeded by name and scope otherwise, false for null", async () => {
        const store = new MemoryStoreAdapter()
        const lottery = Lottery.odds(1, 2)
        const features = new Features(new StoreDriver(store)).define("new-ui", lottery)
        const first = await features.value("new-ui")
        expect(await store.get("feature:new-ui:global")).toBe(first)
        expect(await features.for(null).value("new-ui")).toBe(false)

        for (const id of ids.slice(0, 50)) {
            expect(await features.for(id).value("new-ui")).toBe(lottery.draw(`new-ui:${id}`))
        }
        expect(features.instance("new-ui")("user:7")).toBe(lottery.draw("new-ui:user:7"))
    })

    test("function resolvers receive the feature name", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define(
            "named",
            (scope: string, feature: string) => `${feature}@${scope}`,
        )
        expect(await features.for("user:1").value("named")).toBe("named@user:1")
    })
})

describe("sync()", () => {
    test("a list of active names overwrites local values and revokes names the server drops", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("lottery", () => "local")
        const user = features.for("user:1")
        expect(await user.value("lottery")).toBe("local")
        await user.activate("simulator", "stale")

        await user.sync(["simulator", "scanner"])
        expect(await user.value("simulator")).toBe(true)
        expect(await user.value("scanner")).toBe(true)

        await user.sync(["simulator"])
        expect(await user.active("scanner")).toBe(false)
        expect(await user.value("lottery")).toBe("local")

        await user.sync(["lottery"])
        expect(await user.value("lottery")).toBe(true)
    })

    test("changes() is shared by every view and bumped by writes and flushes", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("beta", false)
        const seen: number[] = []
        features.changes().subscribe((revision) => seen.push(revision))
        await features.for("user:1").sync(["reporting"])
        await features.activate("beta")
        features.flushCache()
        expect(seen.length).toBeGreaterThanOrEqual(3)
        expect(features.for("user:2").changes()).toBe(features.changes())

        const writes = seen.length
        await features.value("beta")
        await features.for("user:1").value("reporting")
        expect(seen.length).toBe(writes) // reads never bump
    })

    test("a map writes values as sent and only touches the view's scope", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter()))
        await features.for("user:2").sync(["scanner"])
        await features.for("user:1").sync({ checkout: "b", scanner: false })
        expect(await features.for("user:1").value("checkout")).toBe("b")
        expect(await features.for("user:1").active("scanner")).toBe(false)
        expect(await features.for("user:2").active("scanner")).toBe(true)
    })
})

describe("syncResponse()", () => {
    const userBody = (features: unknown, type = "users") => ({
        data: { type, id: "9", attributes: { name: "Ada", features } },
    })

    function manager() {
        const container = new BuiltinContainer()
        container.instance("config", new ConfigRepository({}))
        new StoreProvider().register(container)
        new FeatureProvider().register(container)
        return container.make<FeatureManager>("feature")
    }

    test("syncs a JSON:API users resource and ignores other bodies", async () => {
        const features = manager()
        await features.syncResponse(userBody(["simulator"]))
        expect(await features.active("simulator")).toBe(true)

        await features.syncResponse(userBody([], "plans"))
        await features.syncResponse({ data: [] })
        await features.syncResponse(null)
        await features.syncResponse("text")
        expect(await features.active("simulator")).toBe(true)

        await features.syncResponse(userBody([]))
        expect(await features.active("simulator")).toBe(false)
    })

    test("a custom extractor maps its own shape and scope", async () => {
        const features = manager().extractFeaturesUsing({
            features: (body) => (body as { flags?: Record<string, unknown> }).flags,
            scope: (body) => `user:${(body as { id: string }).id}`,
        })
        await features.syncResponse({ id: "9", flags: { checkout: "b" } })
        expect(await features.for("user:9").value("checkout")).toBe("b")
        expect(await features.value("checkout")).toBe(false)
    })
})

describe("FeatureProvider HTTP sync", () => {
    function boot(config: Record<string, unknown> = { feature: { sync: true } }) {
        const container = new BuiltinContainer()
        container.instance("config", new ConfigRepository(config))
        new StoreProvider().register(container)
        new HttpProvider().register(container)
        new FeatureProvider().register(container)
        new FeatureProvider().boot(container)
        return { http: container.make<HttpFactory>("http"), features: container.make<FeatureManager>("feature") }
    }

    test("any JSON response carrying features updates them before it is returned", async () => {
        const { http, features } = boot()
        http.fake({
            "*/user": { data: { type: "users", id: "1", attributes: { features: ["simulator", "scanner"] } } },
            "*/ping": "pong",
        })
        await http.get("https://api.test/user")
        expect(await features.active("scanner")).toBe(true)
        expect((await http.get("https://api.test/ping")).body()).toBe("pong")
    })

    test("a failed sync does not fail the request", async () => {
        const { http, features } = boot()
        features.extractFeaturesUsing({
            features: () => {
                throw new Error("boom")
            },
        })
        http.fake({ "*/user": { data: { type: "users" } } })
        expect((await http.get("https://api.test/user")).status()).toBe(200)
    })

    test("response syncing is off unless feature.sync is true", async () => {
        const { http, features } = boot({})
        http.fake({ "*/user": { data: { type: "users", id: "1", attributes: { features: ["scanner"] } } } })
        await http.get("https://api.test/user")
        expect(await features.active("scanner")).toBe(false)
    })
})
