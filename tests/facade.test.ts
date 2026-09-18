import { afterEach, describe, expect, test } from "bun:test"
import CacheManager from "@/cache/manager"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import { getContainer, setContainer } from "@/foundation/container"
import MemoryStoreAdapter from "@/store/adapters/memory"
import StoreManager from "@/store/manager"
import App from "@/support/facades/app"
import Cache from "@/support/facades/cache"
import Config from "@/support/facades/config"
import { createFacade, flushAllMacros } from "@/support/facades/facade"
import Store from "@/support/facades/store"

function resetContainer() {
    const container = getContainer()
    if (container && typeof container.flush === "function") {
        container.flush()
    }
    setContainer(null)
    flushAllMacros()
}

describe("Proxy-based facade (createFacade)", () => {
    afterEach(resetContainer)

    test("getFacadeAccessor returns the configured accessor", () => {
        expect((Config as unknown as { getFacadeAccessor: () => string }).getFacadeAccessor()).toBe("config")
        expect((Cache as unknown as { getFacadeAccessor: () => string }).getFacadeAccessor()).toBe("cache")
        expect((Store as unknown as { getFacadeAccessor: () => string }).getFacadeAccessor()).toBe("store")
    })

    test("Config delegates all methods to ConfigRepository", () => {
        const container = new BuiltinContainer()
        const repository = new ConfigRepository({
            app: {
                name: "IOC",
                retries: 3,
                ratio: 1.5,
                enabled: true,
                tags: ["base"],
            },
        })
        container.bind("config").toConstantValue(repository)
        container.bind(ConfigRepository).toConstantValue(repository)
        setContainer(container)

        expect(Config.has("app.name")).toBe(true)
        expect(Config.get("app.name")).toBe("IOC")
        expect(Config.get("app.retries")).toBe(3)
        expect(Config.get("app.ratio")).toBe(1.5)
        expect(Config.get("app.enabled")).toBe(true)
        expect(Config.get("app.tags")).toEqual(["base"])
        expect(Config.getMany(["app.name"])).toEqual({ "app.name": "IOC" })

        Config.set("app.name", "Changed")
        Config.prepend("app.tags", "first")
        Config.push("app.tags", "last")

        expect(Config.get("app.name")).toBe("Changed")
        expect(Config.get("app.tags")).toEqual(["first", "base", "last"])
        expect(Config.all()).toMatchObject({
            app: { name: "Changed" },
        })
    })

    test("App delegates container methods to the current container", () => {
        const container = new BuiltinContainer()
        container.bind("app").toConstantValue(container)
        container.singleton("thing", () => "resolved")
        setContainer(container)

        expect(App.make("thing")).toBe("resolved")
        expect(App.bound("thing")).toBe(true)
    })

    test("Cache delegates async methods to CacheManager", async () => {
        const manager = new CacheManager({ memory: new MemoryStoreAdapter() }, "memory")
        const container = new BuiltinContainer()
        container.bind("cache").toConstantValue(manager)
        container.bind(CacheManager).toConstantValue(manager)
        setContainer(container)

        await Cache.set("name", "ioc")
        expect(await Cache.get("name")).toBe("ioc")
        expect(await Cache.has("name")).toBe(true)
        expect(await Cache.keys()).toEqual(["name"])
        expect(Cache.store()).toBe(manager.store())
        Cache.use("memory")
        await Cache.delete("name")
        expect(await Cache.get("name")).toBeNull()
        await Cache.set("x", 1)
        await Cache.clear()
        expect(await Cache.keys()).toEqual([])
    })

    test("Store delegates async methods to StoreManager", async () => {
        const container = new BuiltinContainer()
        const manager = new StoreManager({ memory: new MemoryStoreAdapter() }, "memory")
        container.bind("store").toConstantValue(manager)
        setContainer(container)

        await Store.set("name", "ioc")
        expect(await Store.get("name")).toBe("ioc")
        expect(await Store.has("name")).toBe(true)
        expect(await Store.keys()).toEqual(["name"])
        expect(Store.driver()).toBe(manager.driver())
        expect(Store.driver("memory")).toBe(manager.driver("memory"))
        Store.use("memory")
        await Store.delete("name")
        expect(await Store.get("name")).toBeNull()
        await Store.set("x", 1)
        await Store.clear()
        expect(await Store.keys()).toEqual([])
    })

    test("uses() returns the facade for chaining", async () => {
        const manager = new StoreManager({ memory: new MemoryStoreAdapter() }, "memory")
        const container = new BuiltinContainer()
        container.bind("store").toConstantValue(manager)
        setContainer(container)

        await Store.set("x", 1)
        const result = Store.use("memory")
        // Should return the facade proxy (truthy object).
        expect(result).toBeTruthy()
        // Should be able to chain.
        await (Store.use("memory") as typeof Store).set("y", 2)
        expect(await Store.get("y")).toBe(2)
    })

    test("use() returns the facade for chaining even when instance has no use method", () => {
        const Plain = createFacade("plain") as unknown as {
            use: () => unknown
            value: string
        }
        const container = new BuiltinContainer()
        container.bind("plain").toConstantValue({ value: "raw" })
        setContainer(container)

        expect(Plain.use()).toBe(Plain)
        expect(Plain.value).toBe("raw")
        expect("value" in Plain).toBe(true)
    })

    test("facade resolves fresh from the container on every call", () => {
        const container = new BuiltinContainer()
        const repository = new ConfigRepository({ app: { name: "First" } })
        container.bind("config").toConstantValue(repository)
        setContainer(container)

        expect(Config.get("app.name")).toBe("First")

        container.unbind("config")
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "Second" } }))

        // No facade-level cache to go stale - the rebind is reflected immediately.
        expect(Config.get("app.name")).toBe("Second")
    })

    test("callFacadeMethod dispatches through proxy facade", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "test" } }))
        setContainer(container)

        expect(Config.callFacadeMethod<string>("get", "app.name")).toBe("test")
    })

    test("callFacadeMethod throws for non-existent method", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({}))
        setContainer(container)

        expect(() => Config.callFacadeMethod("nonExistent")).toThrow(
            "Method [nonExistent] does not exist on resolved facade instance.",
        )
    })

    test("callFacadeMethod dispatches registered macros", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "macro" } }))
        setContainer(container)

        Config.macro("configuredName", (instance) => instance.get("app.name"))

        expect(Config.callFacadeMethod("configuredName")).toBe("macro")
    })
})

describe("Facade macros", () => {
    afterEach(resetContainer)

    test("register and invoke a macro", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "test" } }))
        setContainer(container)

        Config.macro("appName", (instance) => {
            return instance.get<string>("app.name")
        })

        expect(Config.appName()).toBe("test")
    })

    test("macro receives the resolved instance as first argument", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { retries: 5 } }))
        setContainer(container)

        let receivedInstance: unknown
        Config.macro("capture", (instance) => {
            receivedInstance = instance
            return "ok"
        })

        Config.capture()
        expect(receivedInstance).toBeInstanceOf(ConfigRepository)
    })

    test("macro takes precedence over instance method", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "original" } }))
        setContainer(container)

        // Before macro: calls the real get method.
        expect(Config.get("app.name")).toBe("original")

        Config.macro("get", () => "overridden")

        // After macro: macro wins.
        expect(Config.get("app.name")).toBe("overridden")
    })

    test("hasMacro returns correct value", () => {
        expect(Config.hasMacro("test")).toBe(false)

        Config.macro("test", () => {})

        expect(Config.hasMacro("test")).toBe(true)
    })

    test("flushMacros clears macros for the facade", () => {
        Config.macro("temp", () => "value")
        expect(Config.hasMacro("temp")).toBe(true)

        Config.flushMacros()
        expect(Config.hasMacro("temp")).toBe(false)
    })

    test("macros are scoped per accessor", () => {
        const manager = new CacheManager({ memory: new MemoryStoreAdapter() }, "memory")
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({}))
        container.bind("cache").toConstantValue(manager)
        container.bind(CacheManager).toConstantValue(manager)
        setContainer(container)

        Config.macro("onlyConfig", () => "config-only")
        expect(Config.hasMacro("onlyConfig")).toBe(true)
        expect(Cache.hasMacro("onlyConfig")).toBe(false)
    })

    test("macro with arguments passes them through", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({}))
        setContainer(container)

        Config.macro("required", (instance, ...args) => {
            const key = args[0] as string
            const defaultValue = args[1] as string | undefined
            const value = instance.get<string>(key)
            return value ?? defaultValue ?? "missing"
        })

        const result = Config.required("non.existent", "fallback")
        expect(result).toBe("fallback")
    })

    test("flushAllMacros clears all facade macros", () => {
        Config.macro("configMacro", () => {})
        Cache.macro("cacheMacro", () => {})

        expect(Config.hasMacro("configMacro")).toBe(true)
        expect(Cache.hasMacro("cacheMacro")).toBe(true)

        flushAllMacros()

        expect(Config.hasMacro("configMacro")).toBe(false)
        expect(Cache.hasMacro("cacheMacro")).toBe(false)
    })

    test("has() proxy trap detects facade properties and macros", () => {
        const container = new BuiltinContainer()
        container.bind("config").toConstantValue(new ConfigRepository({ app: { name: "test" } }))
        setContainer(container)

        // Built-in facade methods.
        expect("getFacadeAccessor" in Config).toBe(true)
        expect("macro" in Config).toBe(true)
        expect("hasMacro" in Config).toBe(true)

        // Instance methods.
        expect("get" in Config).toBe(true)
        expect("set" in Config).toBe(true)

        // Macros take precedence.
        Config.macro("fakeMethod", () => "macro")
        expect("fakeMethod" in Config).toBe(true)

        // Non-existent properties.
        expect("nonExistent" in Config).toBe(false)
    })
})
