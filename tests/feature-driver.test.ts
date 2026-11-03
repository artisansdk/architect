import { describe, expect, mock, test } from "bun:test"
import type { Driver } from "@/feature/contracts/driver"
import type { FeatureScopeSerializeable } from "@/feature/contracts/feature-scope-serializeable"
import type { FeatureScopeable } from "@/feature/contracts/feature-scopeable"
import StoreDriver from "@/feature/drivers/store"
import { Features } from "@/feature/features"
import MemoryStoreAdapter from "@/store/adapters/memory"

/** A custom driver that deliberately implements none of the optional capabilities. */
function basicDriver(store = new MemoryStoreAdapter()): Driver {
    const driver = new StoreDriver(store)
    return {
        define: driver.define.bind(driver),
        defined: driver.defined.bind(driver),
        getAll: driver.getAll.bind(driver),
        get: driver.get.bind(driver),
        set: driver.set.bind(driver),
        setForAllScopes: driver.setForAllScopes.bind(driver),
        delete: driver.delete.bind(driver),
        purge: driver.purge.bind(driver),
    }
}

describe("Pennant feature driver contracts", () => {
    test("defined and stored features are distinct, and other store entries are untouched", async () => {
        const store = new MemoryStoreAdapter()
        await store.set("session", "keep")
        const features = new Features(new StoreDriver(store)).define("beta", false).define("unused", true)
        expect(features.defined()).toEqual(["beta", "unused"])
        expect(await features.stored()).toEqual([])
        await features.for("user:1").value("beta")
        await features.for("user:2").value("beta")
        await features.activate("override-only")
        expect(await features.stored()).toEqual(["beta", "override-only"])
        await features.purge()
        expect(await store.keys()).toEqual(["session"])
        expect(features.defined()).toEqual(["beta", "unused"])
    })

    test("bulk writes invalidate the correct scopes and retain input order", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("beta", false)
        const first = features.for("user:1")
        const second = features.for("user:2")
        expect(await first.active("beta")).toBe(false)
        expect(await second.active("beta")).toBe(false)
        await features.setAll([
            { feature: "beta", scope: "user:1", value: "a" },
            { feature: "beta", scope: "user:2", value: true },
            { feature: "beta", scope: "user:1", value: "b" },
        ])
        expect(await first.value("beta")).toBe("b")
        expect(await second.active("beta")).toBe(true)
        await first.deactivate(["beta", "other"])
        expect(await first.values(["beta", "other"])).toEqual({ beta: false, other: false })
        expect(await second.active("beta")).toBe(true)
    })

    test("optional bulk writes fall back to set, and unsupported listing throws", async () => {
        const driver = basicDriver()
        const set = mock(driver.set)
        driver.set = set
        const features = new Features(driver)
        await features.setAll([{ feature: "beta", scope: "user:1", value: true }])
        expect(set).toHaveBeenCalledWith("beta", "user:1", true)
        expect(await features.for("user:1").active("beta")).toBe(true)
        await expect(features.stored()).rejects.toThrow("does not support listing stored features")
    })

    test("bulk capability is used when present", async () => {
        const driver = new StoreDriver(new MemoryStoreAdapter())
        const setAll = mock(driver.setAll.bind(driver))
        driver.setAll = setAll
        const features = new Features(driver)
        await features.activate(["beta", "search"])
        expect(setAll).toHaveBeenCalledTimes(1)
        expect(await features.values(["beta", "search"])).toEqual({ beta: true, search: true })
    })

    test("scope conversion receives the driver name and passes its result to the resolver", async () => {
        const identify = mock((driver: string) => `${driver}:user:42`)
        const scope: FeatureScopeable = { toFeatureIdentifier: identify }
        const resolver = mock((value: string) => value)
        const features = new Features(
            new StoreDriver(new MemoryStoreAdapter()),
            "global",
            undefined,
            undefined,
            "local",
        ).define("beta", resolver)
        expect(await features.for(scope).value("beta")).toBe("local:user:42")
        expect(identify).toHaveBeenCalledWith("local")
        expect(resolver).toHaveBeenCalledWith("local:user:42")
        await features.setAll([{ feature: "beta", scope, value: false }])
        expect(await features.for(scope).active("beta")).toBe(false)
    })

    test("serializable objects keep their resolver identity and share persisted scope values", async () => {
        class User implements FeatureScopeSerializeable {
            constructor(public id: number) {}
            featureScopeSerialize(): string {
                return `user:${this.id}`
            }
        }
        const resolver = mock((user: User) => user.id)
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("variant", resolver)
        const user = new User(42)
        expect(await features.for(user).value("variant")).toBe(42)
        expect(await features.for(new User(42)).value("variant")).toBe(42)
        expect(resolver).toHaveBeenCalledTimes(1)
        expect(resolver).toHaveBeenCalledWith(user)
        await expect(features.for({ id: 42 }).value("variant")).rejects.toThrow("FeatureScopeSerializeable")
    })

    test("null and numeric scopes are supported", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("scope", (scope: unknown) =>
            String(scope),
        )
        expect(await features.for(null).value("scope")).toBe("null")
        expect(await features.for(42).value("scope")).toBe("42")
    })

    test("externally defined features are selected for the converted scope", async () => {
        const list = mock(async (scope: unknown) => (scope === "staff:1" ? ["remote-beta"] : []))
        const driver = Object.assign(basicDriver(), {
            definedFeaturesForScope: list,
            get: mock(async () => "remote-value"),
        })
        const features = new Features(driver)
        expect(await features.for({ toFeatureIdentifier: () => "staff:1" }).all()).toEqual({
            "remote-beta": "remote-value",
        })
        expect(list).toHaveBeenCalledWith("staff:1")
        expect(await features.for("user:2").all()).toEqual({})
    })

    test("bulk reads use the driver and populate caches shared by scoped views", async () => {
        const driver = new StoreDriver(new MemoryStoreAdapter())
        const getAll = mock(driver.getAll.bind(driver))
        driver.getAll = getAll
        const resolver = mock((scope: string) => scope)
        const features = new Features(driver).define("variant", resolver)
        expect(await features.getAll({ variant: ["user:1", "user:2"] })).toEqual({ variant: ["user:1", "user:2"] })
        expect(getAll).toHaveBeenCalledTimes(1)
        expect(await features.for("user:1").value("variant")).toBe("user:1")
        expect(resolver).toHaveBeenCalledTimes(2)
    })

    test("cache flushing delegates to the driver and preserves persisted assignments", async () => {
        const store = new MemoryStoreAdapter()
        const driver = Object.assign(basicDriver(store), { flushCache: mock(() => {}) })
        const features = new Features(driver).define("beta", false)
        const scoped = features.for("user:1")
        expect(await scoped.active("beta")).toBe(false)
        await store.set("feature:beta:user:1", true)
        expect(await scoped.active("beta")).toBe(false)
        features.flushCache()
        expect(driver.flushCache).toHaveBeenCalledTimes(1)
        expect(await scoped.active("beta")).toBe(true)
        expect(await store.has("feature:beta:user:1")).toBe(true)
    })

    test("everyone overrides update existing scopes without changing future resolutions", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("beta", false)
        const first = features.for("user:1")
        const second = features.for("user:2")
        await first.value("beta")
        await second.value("beta")
        await features.activateForEveryone("beta", "variant")
        expect(await first.value("beta")).toBe("variant")
        expect(await second.value("beta")).toBe("variant")
        expect(await features.for("user:3").active("beta")).toBe(false)
        await features.deactivateForEveryone("beta")
        expect(await first.active("beta")).toBe(false)
        await features.purge(["beta"])
        expect(await features.stored()).toEqual([])
    })

    test("feature names containing separators do not collide or purge each other", async () => {
        const features = new Features(new StoreDriver(new MemoryStoreAdapter()))
        await features.for("b:c").activate("a", "first")
        await features.for("c").activate("a:b", "second")
        expect(await features.stored()).toEqual(["a", "a:b"])
        expect(await features.for("b:c").value("a")).toBe("first")
        expect(await features.for("c").value("a:b")).toBe("second")
        await features.purge("a")
        expect(await features.for("c").value("a:b")).toBe("second")
        expect(await features.stored()).toEqual(["a:b"])
    })

    test("an override waits for an in-flight assignment so the resolver cannot overwrite it", async () => {
        let finish!: (value: string) => void
        let started!: () => void
        const startedPromise = new Promise<void>((resolve) => {
            started = resolve
        })
        const result = new Promise<string>((resolve) => {
            finish = resolve
        })
        const features = new Features(new StoreDriver(new MemoryStoreAdapter())).define("variant", () => {
            started()
            return result
        })
        const initial = features.value("variant")
        await startedPromise
        const override = features.activate("variant", "override")
        finish("initial")
        await initial
        await override
        expect(await features.value("variant")).toBe("override")
    })
})
