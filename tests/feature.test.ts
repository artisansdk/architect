import { afterEach, describe, expect, mock, test } from "bun:test"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import { Features } from "@/feature/features"
import { FeatureProvider } from "@/feature/provider"
import { setContainer } from "@/foundation/container"
import MemoryStoreAdapter from "@/store/adapters/memory"
import type StoreManager from "@/store/manager"
import { StoreProvider } from "@/store/provider"
import Feature from "@/support/facades/feature"

describe("Features", () => {
    test("resolves once and persists the value", async () => {
        const store = new MemoryStoreAdapter()
        const resolver = mock(() => "b")
        const features = new Features(store).define("variant", resolver)

        expect(await features.value("variant")).toBe("b")
        expect(await features.value("variant")).toBe("b")
        expect(resolver).toHaveBeenCalledTimes(1)
        expect(await store.get("feature:variant:global")).toBe("b")

        // A fresh instance over the same store (e.g. after a reload) keeps the assignment.
        const reloaded = new Features(store).define("variant", () => "a")
        expect(await reloaded.value("variant")).toBe("b")
    })

    test("concurrent first reads share one resolution", async () => {
        let n = 0
        const features = new Features(new MemoryStoreAdapter()).define("ab", async () => ++n)
        const values = await Promise.all([features.value("ab"), features.value("ab"), features.value("ab")])
        expect(values).toEqual([1, 1, 1])
    })

    test("unknown features are false and not stored", async () => {
        const store = new MemoryStoreAdapter()
        const features = new Features(store)
        expect(await features.active("missing")).toBe(false)
        expect(await store.keys()).toEqual([])

        features.define("missing")
        expect(await features.active("missing")).toBe(true)
    })

    test("static values and nullish resolutions", async () => {
        const features = new Features(new MemoryStoreAdapter()).define("on", true).define("off", () => undefined)
        expect(await features.active("on")).toBe(true)
        expect(await features.inactive("off")).toBe(true)
    })

    test("scopes are isolated and passed to the resolver", async () => {
        const features = new Features(new MemoryStoreAdapter()).define("beta", (scope) => scope.startsWith("staff:"))
        expect(await features.for("staff:1").active("beta")).toBe(true)
        expect(await features.for("user:2").active("beta")).toBe(false)
        expect(await features.active("beta")).toBe(false)
    })

    test("activate, deactivate, forget and purge", async () => {
        const store = new MemoryStoreAdapter()
        const features = new Features(store).define("x", false)

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
        const features = new Features(new MemoryStoreAdapter()).define("on", "v1").define("off", false)
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
        const features = new Features(new MemoryStoreAdapter()).define("x", () => {
            if (fail) throw new Error("boom")
            return true
        })
        await expect(features.value("x")).rejects.toThrow("boom")
        fail = false
        expect(await features.active("x")).toBe(true)
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
})
