import { describe, expect, test } from "bun:test"
import "reflect-metadata"
import BuiltinContainer, { inject } from "@/container/adapters/builtin"

class Logger {
    logs: string[] = []
}

class ServiceWithCtorInjection {
    constructor(public readonly logger: Logger) {}
}

class ServiceWithTokenInjection {
    constructor(public readonly config: { name: string }) {}
}

class CircularA {
    constructor(public readonly b: CircularB) {}
}

class CircularB {
    constructor(public readonly a: CircularA) {}
}

describe("BuiltinContainer adapter", () => {
    Reflect.defineMetadata("design:paramtypes", [Logger], ServiceWithCtorInjection)
    Reflect.defineMetadata("design:paramtypes", [Object], ServiceWithTokenInjection)
    inject("config")(ServiceWithTokenInjection, undefined, 0)

    test("inject decorator sets metadata correctly", () => {
        class TestTarget {
            constructor(public readonly value: unknown) {}
        }

        inject("test.token")(TestTarget, undefined, 0)

        const metadata = (
            Reflect as typeof Reflect & {
                getMetadata?: (key: string, target: object) => Record<number, unknown> | undefined
            }
        ).getMetadata?.("ioc:inject.tokens", TestTarget)

        expect(metadata).toBeTruthy()
        expect(metadata?.[0]).toBe("test.token")
    })

    test("supports bind/get compatibility", () => {
        const container = new BuiltinContainer()
        container.bind("name").toConstantValue("ioc")

        expect(container.get<string>("name")).toBe("ioc")
        expect(container.make<string>("name")).toBe("ioc")
    })

    test("bind throws when identifier is already bound", () => {
        const container = new BuiltinContainer()
        container.instance("value", 1)

        expect(() => container.bind("value")).toThrow("Cannot bind [value] because it is already bound.")
    })

    test("resolves constructor dependencies from metadata", () => {
        const container = new BuiltinContainer()
        container.singleton(Logger, Logger)
        container.bind(ServiceWithCtorInjection, ServiceWithCtorInjection)

        const service = container.make(ServiceWithCtorInjection)
        expect(service.logger).toBe(container.make(Logger))
    })

    test("resolves token overrides from inject decorator", () => {
        const container = new BuiltinContainer()
        container.instance("config", { name: "app" })
        container.bind(ServiceWithTokenInjection, ServiceWithTokenInjection)

        const service = container.make(ServiceWithTokenInjection)
        expect(service.config).toEqual({ name: "app" })
    })

    test("stores token metadata when inject decorator is applied", () => {
        class ManualInjectTarget {
            constructor(public readonly value: unknown) {}
        }

        inject("manual.token")(ManualInjectTarget, undefined, 0)
        const metadata = (
            Reflect as typeof Reflect & {
                getMetadata?: (key: string, target: object) => Record<number, unknown> | undefined
            }
        ).getMetadata?.("ioc:inject.tokens", ManualInjectTarget)

        expect(metadata).toBeTruthy()
        expect(metadata?.[0]).toBe("manual.token")
    })

    test("supports singleton and transient scope registration", () => {
        class Counter {
            static next = 0
            id = ++Counter.next
        }

        const container = new BuiltinContainer()
        container.singleton("singleton.counter", Counter)
        container.bind("transient.counter", Counter)

        expect(container.make<Counter>("singleton.counter")).toBe(container.make("singleton.counter"))
        expect(container.make<Counter>("transient.counter")).not.toBe(container.make("transient.counter"))
    })

    test("bind(string, Class) aliases to the class singleton when Class is already registered", () => {
        class Service {}
        const container = new BuiltinContainer()
        container.singleton(Service, () => new Service())
        container.bind("storage", Service)

        const a = container.make<Service>("storage")
        const b = container.make<Service>("storage")
        expect(a).toBeInstanceOf(Service)
        expect(a).toBe(b)
        expect(a).toBe(container.make(Service))
    })

    test("alias() resolves to the target binding", () => {
        class Languages {}
        const container = new BuiltinContainer()
        container.singleton(Languages, Languages)
        container.alias("bible.languages", Languages)

        expect(container.make("bible.languages")).toBe(container.make(Languages))
    })

    test("bind(string, Class) still creates new instances when Class is not registered", () => {
        class Transient {}
        const container = new BuiltinContainer()
        container.bind("t", Transient)

        expect(container.make<Transient>("t")).not.toBe(container.make("t"))
    })

    test("supports singleton/transient with non-function concrete values", () => {
        const container = new BuiltinContainer()
        container.singleton("singleton.value", 7)
        container.bind("transient.value", 9)

        expect(container.make<number>("singleton.value")).toBe(7)
        expect(container.make<number>("transient.value")).toBe(9)
    })

    test("supports factory registrations", () => {
        const container = new BuiltinContainer()
        container.instance("seed", 5)
        container.singleton("answer", (ioc) => ioc.make<number>("seed") + 37)

        expect(container.make<number>("answer")).toBe(42)
    })

    test("supports fluent class, factory, and value registrations", () => {
        const container = new BuiltinContainer()

        class Demo {}

        container.bind("demo").to(Demo).inTransientScope()
        container.bind("demo.singleton").to(Demo).inSingletonScope()
        container
            .bind("value")
            .to((ioc) => ioc.make("demo"))
            .inTransientScope()
        container
            .bind("value.singleton")
            .to((ioc) => ioc.make("demo.singleton"))
            .inSingletonScope()
        container.bind("raw").to(42)

        expect(container.make("value")).not.toBe(container.make("value"))
        expect(container.make("value.singleton")).toBe(container.make("value.singleton"))
        expect(container.make<number>("raw")).toBe(42)
    })

    test("ignores scope changes after fluent binding is replaced with constant", () => {
        const container = new BuiltinContainer()

        class Demo {}

        const classBinding = container.bind("class.binding")
        const classScopes = classBinding.to(Demo)
        classBinding.toConstantValue("class.constant")
        classScopes.inTransientScope()
        classScopes.inSingletonScope()

        const dynamicBinding = container.bind("dynamic.binding")
        const dynamicScopes = dynamicBinding.to(() => new Demo())
        dynamicBinding.toConstantValue("dynamic.constant")
        dynamicScopes.inTransientScope()
        dynamicScopes.inSingletonScope()

        expect(container.make<string>("class.binding")).toBe("class.constant")
        expect(container.make<string>("dynamic.binding")).toBe("dynamic.constant")
    })

    test("detects circular dependencies", () => {
        Reflect.defineMetadata("design:paramtypes", [CircularB], CircularA)
        Reflect.defineMetadata("design:paramtypes", [CircularA], CircularB)

        const container = new BuiltinContainer()
        expect(() => container.make(CircularA)).toThrow("Circular dependency detected while resolving [CircularA].")
    })

    test("throws when constructor parameter cannot be resolved", () => {
        class MissingTokenDependency {
            constructor(public readonly value: unknown) {}
        }

        Reflect.defineMetadata("design:paramtypes", [undefined], MissingTokenDependency)

        const container = new BuiltinContainer()
        expect(() => container.make(MissingTokenDependency)).toThrow(
            "Cannot resolve parameter #0 for [MissingTokenDependency].",
        )
    })

    test("inject decorator is safe when reflect metadata apis are unavailable", () => {
        const target = class {
            constructor(public readonly value: unknown) {}
        }

        const reflectWithMetadata = Reflect as typeof Reflect & {
            getMetadata?: (key: string, target: object) => unknown
            defineMetadata?: (key: string, value: unknown, target: object) => void
        }
        const originalGetMetadata = reflectWithMetadata.getMetadata
        const originalDefineMetadata = reflectWithMetadata.defineMetadata

        ;(reflectWithMetadata as Record<string, unknown>).getMetadata = undefined
        ;(reflectWithMetadata as Record<string, unknown>).defineMetadata = undefined

        try {
            expect(() => inject("safe.token")(target, undefined, 0)).not.toThrow()
        } finally {
            ;(reflectWithMetadata as Record<string, unknown>).getMetadata = originalGetMetadata
            ;(reflectWithMetadata as Record<string, unknown>).defineMetadata = originalDefineMetadata
        }
    })

    test("supports bound, has, unbind, unbindAll, and flush", () => {
        const container = new BuiltinContainer()
        container.instance("a", 1)
        container.instance("b", 2)

        expect(container.bound("a")).toBe(true)
        expect(container.has("b")).toBe(true)

        container.unbind("a")
        expect(container.bound("a")).toBe(false)

        container.unbindAll()
        expect(container.bound("b")).toBe(false)

        container.instance("c", 3)
        container.flush()
        expect(container.bound("c")).toBe(false)
    })

    test("throws for unknown string identifiers", () => {
        const container = new BuiltinContainer()
        expect(() => container.make("missing")).toThrow("Container binding [missing] is not registered.")
    })

    test("exposes raw container object", () => {
        const container = new BuiltinContainer()
        expect(container.getRawContainer()).toBeTruthy()
    })

    test("tags a single identifier and reports it via tagged()", () => {
        const container = new BuiltinContainer()
        container.instance("service", { name: "svc" })
        container.tag("service", "stuff")

        expect(container.tagged("service")).toEqual(["stuff"])
        expect(container.tagged("missing")).toEqual([])
    })

    test("tags multiple identifiers in one call, before or after binding", () => {
        const container = new BuiltinContainer()
        container.tag(["cpu", "memory"], "reports")
        container.instance("cpu", "cpu-report")
        container.instance("memory", "memory-report")

        expect(container.tagged("cpu")).toEqual(["reports"])
        expect(container.tagged("memory")).toEqual(["reports"])
    })

    test("applies an extendTag transform once and caches it for singleton/constant bindings", () => {
        const container = new BuiltinContainer()
        let calls = 0
        container.extendTag("wrap", (value: { name: string }) => {
            calls++
            return { wrapped: value }
        })

        container.instance("constant", { name: "const" })
        container.tag("constant", "wrap")

        class Singleton {
            name = "singleton"
        }
        container.singleton(Singleton, Singleton)
        container.tag(Singleton, "wrap")

        const first = container.make<{ wrapped: { name: string } }>("constant")
        const second = container.make<{ wrapped: { name: string } }>("constant")
        expect(first).toBe(second)
        expect(first.wrapped.name).toBe("const")

        const singletonFirst = container.make<{ wrapped: Singleton }>(Singleton)
        const singletonSecond = container.make<{ wrapped: Singleton }>(Singleton)
        expect(singletonFirst).toBe(singletonSecond)

        expect(calls).toBe(2)
    })

    test("re-applies an extendTag transform on every resolution for transient bindings", () => {
        const container = new BuiltinContainer()
        container.extendTag("wrap", (value: object) => ({ wrapped: value }))

        class Transient {}
        container.bind(Transient, Transient)
        container.tag(Transient, "wrap")

        const first = container.make<{ wrapped: Transient }>(Transient)
        const second = container.make<{ wrapped: Transient }>(Transient)
        expect(first).not.toBe(second)
        expect(first.wrapped).not.toBe(second.wrapped)
    })

    test("reactive() registers a singleton tagged 'reactive'", () => {
        const container = new BuiltinContainer()

        class Menu {
            open = false
        }
        container.reactive(Menu, Menu)

        expect(container.tagged(Menu)).toEqual(["reactive"])
        expect(container.make(Menu)).toBe(container.make(Menu))
    })

    test("reactive() guarantees the resolved value is a Valtio proxy", async () => {
        const { subscribe } = await import("valtio/vanilla")
        const container = new BuiltinContainer()

        class Menu {
            open = false
        }
        container.reactive(Menu, Menu)

        const menu = container.make<Menu>(Menu)
        const seen: boolean[] = []
        subscribe(menu, () => seen.push(menu.open), true)
        menu.open = true

        expect(seen).toEqual([true])
    })

    test("reactive() reuses a value that is already a Valtio proxy instead of double-wrapping", async () => {
        const { proxy } = await import("valtio/vanilla")
        const container = new BuiltinContainer()
        const already = proxy({ count: 0 })

        container.reactive("state", already)

        expect(container.make("state")).toBe(already)
    })

    test("reactive() works with factory and plain-value concretes too", () => {
        const container = new BuiltinContainer()
        container.reactive("state", { count: 0 })

        expect(container.make("state")).toEqual({ count: 0 })
        expect(container.make("state")).toBe(container.make("state"))
    })

    test("tags with no registered transform pass values through unchanged", () => {
        const container = new BuiltinContainer()
        container.instance("service", { name: "svc" })
        container.tag("service", "stuff")

        expect(container.make("service")).toEqual({ name: "svc" })
    })

    test("get() resolves a tag group keyed by identifier", () => {
        const container = new BuiltinContainer()
        container.instance("service", "service-value")
        container.instance("other", "other-value")
        container.tag(["service", "other"], "stuff")

        expect(container.get("stuff")).toEqual({ service: "service-value", other: "other-value" })
    })

    test("get() prefers a bound identifier over a same-named tag", () => {
        const container = new BuiltinContainer()
        container.instance("member", "member-value")
        container.instance("stuff", "direct-value")
        container.tag("member", "stuff")

        expect(container.get("stuff")).toBe("direct-value")
    })

    test("get() throws for a string that is neither a binding nor a tag", () => {
        const container = new BuiltinContainer()
        expect(() => container.get("unknown")).toThrow("Container binding [unknown] is not registered.")
    })

    test("unbind() removes an identifier from both tag indexes", () => {
        const container = new BuiltinContainer()
        container.instance("service", "value")
        container.instance("other", "other-value")
        container.tag(["service", "other"], "stuff")

        container.unbind("service")

        expect(container.tagged("service")).toEqual([])
        expect(container.get("stuff")).toEqual({ other: "other-value" })
    })
})
