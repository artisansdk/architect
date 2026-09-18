import { afterEach, describe, expect, mock, test } from "bun:test"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import { Application } from "@/foundation/application"
import { make, setContainer } from "@/foundation/container"
import { mergeConfigureOptions } from "@/foundation/options"
import { defaultProviders } from "@/index"
import ServiceProvider from "@/support/service-provider"

const reactContextValues = new Map<object, unknown>()
function normalizeChildren(children: unknown[]): unknown {
    if (children.length === 0) {
        return undefined
    }

    return children.length === 1 ? children[0] : children
}

class MockReactComponent {
    props: Record<string, unknown>
    state: unknown
    context: unknown

    constructor(props: Record<string, unknown>) {
        this.props = props
    }

    setState(next: object) {
        this.state = { ...(this.state as object), ...next }
    }
}

const reactModule = {
    Component: MockReactComponent,
    createContext<T>(defaultValue: T) {
        const context = {
            _default: defaultValue,
            Provider: ({ value, children }: { value: unknown; children?: unknown }) => {
                reactContextValues.set(context, value)
                return children ?? null
            },
        }
        return context
    },
    useContext<T>(context: { _default: T }) {
        if (reactContextValues.has(context as object)) {
            return reactContextValues.get(context as object) as T
        }
        return context._default
    },
    createElement(type: unknown, props?: Record<string, unknown>, ...children: unknown[]) {
        if (typeof type === "function") {
            const fullProps = {
                ...(props ?? {}),
                children: normalizeChildren(children),
            }
            if ((type as { prototype?: { render?: unknown } }).prototype?.render) {
                const instance = new (
                    type as new (
                        props: Record<string, unknown>,
                    ) => {
                        render(): unknown
                    }
                )(fullProps)
                return instance.render()
            }
            return (type as (props: Record<string, unknown>) => unknown)(fullProps)
        }
        return { type, props: { ...(props ?? {}), children } }
    },
    useEffect: () => undefined,
    useLayoutEffect: (callback: () => void | (() => void)) => callback(),
    useCallback: <T>(callback: T) => callback,
    useDebugValue: () => undefined,
    useMemo: <T>(factory: () => T) => factory(),
    useRef: <T>(value: T) => ({ current: value }),
    useState: <T>(value: T) => [value, () => undefined] as const,
    useSyncExternalStore: <T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T) => {
        subscribe(() => undefined)
        return getSnapshot()
    },
}

const reactDomState = {
    rendered: 0,
    unmounted: 0,
    mountNode: undefined as unknown,
}

mock.module("react", () => reactModule)
mock.module("react/jsx-runtime", () => ({
    Fragment: Symbol.for("react.fragment"),
    jsx: (type: unknown, props: Record<string, unknown>) => reactModule.createElement(type, props),
    jsxs: (type: unknown, props: Record<string, unknown>) => reactModule.createElement(type, props),
}))
mock.module("react/jsx-dev-runtime", () => ({
    Fragment: Symbol.for("react.fragment"),
    jsxDEV: (type: unknown, props: Record<string, unknown>) => reactModule.createElement(type, props),
}))
mock.module("react-dom/client", () => ({
    default: {
        createRoot: (node: unknown) => {
            reactDomState.mountNode = node
            return {
                render: () => {
                    reactDomState.rendered += 1
                },
                unmount: () => {
                    reactDomState.unmounted += 1
                },
            }
        },
    },
}))

describe("Application", () => {
    afterEach(() => {
        ;(globalThis as { window?: unknown; document?: unknown }).window = undefined
        ;(globalThis as { window?: unknown; document?: unknown }).document = undefined
        ;(globalThis as { __iocConfigGlobForTests?: unknown }).__iocConfigGlobForTests = undefined
    })

    test("make throws when container is not initialized", () => {
        expect(() => Application.make("config")).toThrow("Application container is not available. Call run() first.")
    })

    test("current application helper throws when container is not initialized", () => {
        setContainer(null)

        expect(() => make("config")).toThrow("Application container is not available. Call run() first.")
    })

    test("run executes lifecycle and cleanup in reverse order", () => {
        const calls: string[] = []
        let beforeUnload: (() => void) | undefined

        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: (_event, cb) => {
                beforeUnload = cb
            },
        }

        class DemoProviderA extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                calls.push("a.register")
                container.bind("demo").toConstantValue("value")
            }

            boot() {
                calls.push("a.boot")
            }

            destroy() {
                calls.push("a.destroy")
            }
        }

        class DemoProviderB extends ServiceProvider {
            boot() {
                calls.push("b.boot")
            }

            destroy() {
                calls.push("b.destroy")
            }
        }

        const _app = Application.configure("./")
            .withProviders([...defaultProviders, new DemoProviderA(), new DemoProviderB()])
            .run()

        expect(Application.make<string>("demo")).toBe("value")
        expect(Application.make("store")).toBeTruthy()
        expect(Application.make("cache")).toBeTruthy()
        expect(calls).toEqual(["a.register", "a.boot", "b.boot"])

        expect(typeof beforeUnload).toBe("function")
        beforeUnload?.()

        // destroy() runs in reverse provider order — B (registered last) tears down before A.
        expect(calls).toEqual(["a.register", "a.boot", "b.boot", "b.destroy", "a.destroy"])

        expect(() => Application.make("demo")).toThrow("Application container is not available. Call run() first.")
    })

    test("layers static config over discovered config modules", () => {
        ;(
            globalThis as {
                __iocConfigGlobForTests?: (
                    pattern: string | string[],
                    options?: { eager?: boolean },
                ) => Record<string, unknown>
            }
        ).__iocConfigGlobForTests = (pattern) => {
            // Mirror import.meta.glob: only paths under the requested pattern's directory match.
            const prefix = String(pattern).split("**")[0]
            const files: Record<string, unknown> = {
                "./src/config/app.ts": { default: { name: "From App Config" } },
                "./src/config/cache.ts": { default: { store: "memory" } },
                "./other/path/ignored.ts": { default: { nope: true } },
            }

            return Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith(prefix)))
        }

        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const first = Application.configure({
            basePath: "./src",
            config: {
                cache: { store: "local" },
            },
        }).run()
        const second = Application.configure({
            basePath: "./src",
            config: {
                cache: { store: "local" },
            },
        }).run()

        const firstConfig = first.container.get(ConfigRepository)
        const secondConfig = second.container.get(ConfigRepository)

        // Discovered files still load, and static config wins on conflicting keys.
        expect(firstConfig.get<{ name: string }>("app")).toEqual({ name: "From App Config" })
        expect(firstConfig.get<{ store: string }>("cache")).toEqual({ store: "local" })
        expect(firstConfig.get("ignored")).toBeNull()
        expect(firstConfig.all()).toEqual(secondConfig.all())
        expect(firstConfig.all()).not.toBe(secondConfig.all())

        // Config passed to configure should be cloned into each app instance.
        firstConfig.set("cache.store", "updated")
        expect(secondConfig.get<string>("cache.store")).toBe("local")

        first.stop()
        second.stop()
    })

    test("configure supports explicit config object overrides", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const running = Application.configure({
            basePath: "./",
            config: {
                app: { name: "From configure()", timezone: "UTC" },
            },
        }).run()

        const config = running.container.get(ConfigRepository)
        expect(config.get<string>("app.name")).toBe("From configure()")
    })

    test("use registers a provider instance", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class DemoProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("demo").toConstantValue("value")
            }
        }

        const running = Application.configure("./").use(new DemoProvider()).run()

        expect(running.container.get<string>("demo")).toBe("value")
    })

    test("use registers a provider class", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class DemoProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("demo").toConstantValue("value")
            }
        }

        const running = Application.configure("./").use(DemoProvider).run()

        expect(running.container.get<string>("demo")).toBe("value")
    })

    test("use merges a config object", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const running = Application.configure("./")
            .use({ app: { name: "From use()" } })
            .run()

        const config = running.container.get(ConfigRepository)
        expect(config.get<string>("app.name")).toBe("From use()")
    })

    test("use is chainable alongside withProviders", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class DemoProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("demo").toConstantValue("value")
            }
        }

        const running = Application.configure("./")
            .use({ app: { name: "From use()" } })
            .use(new DemoProvider())
            .run()

        expect(running.container.get<string>("demo")).toBe("value")
        expect(running.container.get(ConfigRepository).get<string>("app.name")).toBe("From use()")
    })

    test("use flattens arrays of classes, instances and nested arrays", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class AlphaProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("alpha").toConstantValue("a")
            }
        }
        class BetaProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("beta").toConstantValue("b")
            }
        }
        class GammaProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("gamma").toConstantValue("g")
            }
        }

        const running = Application.configure("./")
            .use([AlphaProvider, new BetaProvider(), [new GammaProvider()]])
            .run()

        expect(running.container.get<string>("alpha")).toBe("a")
        expect(running.container.get<string>("beta")).toBe("b")
        expect(running.container.get<string>("gamma")).toBe("g")
    })

    test("use registers defaultProviders as an array", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const running = Application.configure("./").use(defaultProviders).run()

        expect(running.container.bound("cache")).toBe(true)
        expect(running.container.bound("log")).toBe(true)
    })

    test("use treats a non-provider class as config", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class AppConfig {
            services = { mailer: "log" }
        }

        const running = Application.configure("./")
            .use({ app: { name: "architect" } })
            .use(AppConfig)
            .run()

        const config = running.container.get(ConfigRepository)
        expect(config.get<string>("app.name")).toBe("architect")
        expect(config.get<string>("services.mailer")).toBe("log")
    })

    test("use deep merges repeated config objects instead of clobbering", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const running = Application.configure("./")
            .use({ app: { name: "architect" } })
            .use({ app: { debug: true } })
            .run()

        const config = running.container.get(ConfigRepository)
        expect(config.get<{ name: string; debug: boolean }>("app")).toEqual({ name: "architect", debug: true })
    })

    test("static use bootstraps an application without configure", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class DemoProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("demo").toConstantValue("value")
            }
        }

        const running = Application.use(DemoProvider).run()

        expect(running.container.get<string>("demo")).toBe("value")
    })

    test("withProviders accepts classes alongside instances", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        class AlphaProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("alpha").toConstantValue("a")
            }
        }
        class BetaProvider extends ServiceProvider {
            register(container: { bind: (id: string) => { toConstantValue: (v: unknown) => void } }) {
                container.bind("beta").toConstantValue("b")
            }
        }

        const running = Application.configure("./").withProviders([AlphaProvider, new BetaProvider()]).run()

        expect(running.container.get<string>("alpha")).toBe("a")
        expect(running.container.get<string>("beta")).toBe("b")
    })

    test("use still rejects plain functions", () => {
        expect(() => Application.configure("./").use(() => {})).toThrow("cannot accept a plain function")
    })

    test("configure options are merged with defaults", () => {
        expect(mergeConfigureOptions()).toEqual({
            basePath: "./",
            container: { factory: null },
            config: {},
        })

        expect(
            mergeConfigureOptions({
                basePath: "./src",
                container: {},
            }),
        ).toEqual({
            basePath: "./src",
            container: { factory: null },
            config: {},
        })
    })

    test("configure uses builtin container by default", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const running = Application.configure({ basePath: "./" }).run()
        expect(running.container).toBeInstanceOf(BuiltinContainer)
    })

    test("configure can use builtin adapter or custom factory", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        const builtin = Application.configure({
            basePath: "./",
            container: { adapter: "builtin" },
        }).run()
        expect(builtin.container).toBeInstanceOf(BuiltinContainer)

        const custom = Application.configure({
            basePath: "./",
            container: { factory: () => new BuiltinContainer() },
        }).run()
        expect(custom.container).toBeInstanceOf(BuiltinContainer)
    })

    test("react renderer throws if mount node is missing", async () => {
        const { default: ReactRenderer } = await import("@/renderers/adapters/react")

        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }
        ;(globalThis as { document: { getElementById: (id: string) => null } }).document = {
            getElementById: () => null,
        }

        const running = Application.configure("./").run()
        const renderer = new ReactRenderer()

        expect(() =>
            renderer.render({ container: running.container, RootComponent: () => null, rootElementId: "root" }),
        ).toThrow("Missing mount node #root.")
    })

    test("react renderer mounts and unmounts when stopped", async () => {
        const { default: ReactRenderer } = await import("@/renderers/adapters/react")

        let beforeUnload: (() => void) | undefined

        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: (_event, cb) => {
                beforeUnload = cb
            },
        }
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => ({}),
        }

        reactDomState.rendered = 0
        reactDomState.unmounted = 0
        reactDomState.mountNode = undefined

        const running = Application.configure("./").run()
        const renderer = new ReactRenderer()
        const rendererCleanup =
            renderer.render({ container: running.container, RootComponent: () => null, rootElementId: "root" }) ??
            (() => {})
        expect(reactDomState.rendered).toBe(1)
        expect(reactDomState.mountNode).toBeTruthy()
        rendererCleanup()
        running.stop()
        expect(reactDomState.unmounted).toBe(1)
        // Application shutdown is separate from renderer cleanup; a second stop remains a no-op for the renderer.
        beforeUnload?.()
        expect(reactDomState.unmounted).toBe(1)
    })

    test("does not require a renderer", () => {
        ;(globalThis as { window: { addEventListener: (event: string, cb: () => void) => void } }).window = {
            addEventListener: () => {},
        }

        expect(() => Application.configure("./").run()).not.toThrow()
    })
})
