import { afterEach, describe, expect, mock, test } from "bun:test"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import FeatureContract from "@/feature/contract"
import StoreDriver from "@/feature/drivers/store"
import { Features } from "@/feature/features"
import { FeatureProvider } from "@/feature/provider"
import { setContainer } from "@/foundation/container"
import MemoryStoreAdapter from "@/store/adapters/memory"
import type StoreManager from "@/store/manager"
import { StoreProvider } from "@/store/provider"
import Feature from "@/support/facades/feature"

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
        expect(container.make(Features)).toBe(container.make<Features>("feature"))

        Feature.define("new-checkout", true)
        expect(await Feature.active("new-checkout")).toBe(true)
        expect(await Feature.for("user:1").active("missing")).toBe(false)
    })

    test("feature.store picks the store driver", async () => {
        const container = boot({ store: { driver: "memory" }, feature: { store: "indexed" } })
        const store = container.make<StoreManager>("store")
        await Feature.define("x", true).active("x")
        // indexed falls back to the shared memory adapter outside a browser, so the key is visible there.
        expect(await store.driver("indexed").has("feature:x:global")).toBe(true)
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
