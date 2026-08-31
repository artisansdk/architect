import { beforeAll, describe, expect, mock, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import type { ContainerIdentifier } from "@/container/contract"

const reactContextValues = new Map<object, unknown>()
let forcedReactContextValue: unknown
let lastEffectCleanup: (() => void) | undefined
function normalizeChildren(children: unknown[]): unknown {
    if (children.length === 0) {
        return undefined
    }

    return children.length === 1 ? children[0] : children
}

class MockComponent {
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
    Component: MockComponent,
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
        if (typeof forcedReactContextValue !== "undefined") {
            return forcedReactContextValue as T
        }
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
    useEffect(callback: () => void | (() => void)) {
        lastEffectCleanup = callback() || undefined
    },
    useLayoutEffect(callback: () => void | (() => void)) {
        callback()
    },
    useCallback<T>(callback: T) {
        return callback
    },
    useDebugValue() {},
    useMemo<T>(factory: () => T) {
        return factory()
    },
    useRef<T>(value: T) {
        return { current: value }
    },
    useState<T>(value: T) {
        return [value, () => undefined] as const
    },
    useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T) {
        subscribe(() => undefined)
        return getSnapshot()
    },
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

let ApplicationProvider: (props: { container: BuiltinContainer; children?: unknown }) => unknown
let ContextProvider: (props: {
    application?: { run: () => { container: BuiltinContainer; stop: () => void } }
    container?: BuiltinContainer
    fallback?: unknown
    children?: unknown
}) => unknown
let useService: <T>(identifier: ContainerIdentifier<T>) => T
let useContainer: () => BuiltinContainer
let useSignal: <T>(signal: import("@/support/signal").Signal<T>) => T

describe("React runtime", () => {
    beforeAll(async () => {
        const runtime = await import("@/runtimes/react")
        ApplicationProvider = runtime.ApplicationProvider as (props: {
            container: BuiltinContainer
            children?: unknown
        }) => unknown
        ContextProvider = runtime.ContextProvider as typeof ContextProvider
        useService = runtime.useService
        useContainer = runtime.useContainer as typeof useContainer
        useSignal = runtime.useSignal
    })

    test("useSignal reads the current signal value and subscribes to changes", async () => {
        const { Signal } = await import("@/support/signal")
        const signal = new Signal(1)
        expect(useSignal(signal)).toBe(1)
        signal.set(2)
        expect(useSignal(signal)).toBe(2)
    })

    test("ApplicationProvider + useService resolves from container", () => {
        const container = new BuiltinContainer()
        const token = Symbol("token")
        container.bind(token).toConstantValue("resolved")

        ApplicationProvider({ container, children: null })
        forcedReactContextValue = container
        expect(useService<string>(token)).toBe("resolved")
        forcedReactContextValue = undefined
    })

    test("useService auto-wraps a container.reactive() binding in useProxy", () => {
        const container = new BuiltinContainer()

        class Menu {
            open = false
        }
        container.reactive(Menu, Menu)

        forcedReactContextValue = container
        const menu = useService<Menu>(Menu)
        expect(menu.open).toBe(false)

        menu.open = true
        expect(menu.open).toBe(true)

        forcedReactContextValue = undefined
    })

    test("useService leaves untagged bindings unwrapped", () => {
        const container = new BuiltinContainer()

        class Counter {
            value = 0
        }
        container.singleton(Counter, Counter)

        forcedReactContextValue = container
        expect(useService<Counter>(Counter)).toBeInstanceOf(Counter)
        forcedReactContextValue = undefined
    })

    test("useService throws when provider is missing", () => {
        forcedReactContextValue = undefined
        reactContextValues.clear()
        expect(() => useService("missing")).toThrow("You must use `useService` inside the Application Context.")
    })

    test("ContextProvider with container prop does not throw", () => {
        const container = new BuiltinContainer()
        expect(() => ContextProvider({ container, children: "child" })).not.toThrow()
    })

    test("ContextProvider throws when neither application nor container is provided", () => {
        expect(() => ContextProvider({})).toThrow("ContextProvider requires either `application` or `container`.")
    })

    test("ContextProvider with application calls application.run() in effect", () => {
        let ran = false
        const innerContainer = new BuiltinContainer()
        const fakeApp = {
            run: () => {
                ran = true
                return { container: innerContainer, stop: () => {} }
            },
        }
        // useEffect mock calls callback synchronously; useState is a no-op setter so runtime stays null → fallback rendered
        reactContextValues.clear()
        ContextProvider({ application: fakeApp, fallback: "loading" })
        expect(ran).toBe(true)
    })

    test("ContextProvider effect cleanup stops the running app", () => {
        const stop = mock()
        reactContextValues.clear()
        lastEffectCleanup = undefined
        ContextProvider({
            application: { run: () => ({ container: new BuiltinContainer(), stop }) },
            fallback: "loading",
        })
        lastEffectCleanup?.()
        expect(stop).toHaveBeenCalledTimes(1)
    })

    test("useContainer returns the current container", () => {
        const container = new BuiltinContainer()
        forcedReactContextValue = container
        expect(useContainer()).toBe(container)
        forcedReactContextValue = undefined
    })

    test("useContainer throws when outside application context", () => {
        forcedReactContextValue = undefined
        reactContextValues.clear()
        expect(() => useContainer()).toThrow("You must use `useContainer` inside the Application Context.")
    })

    test("ErrorBoundary renders children until an error is caught, then the fallback", async () => {
        const { ErrorBoundary } = await import("@/runtimes/react")
        const boundary = new ErrorBoundary({ fallback: (error: unknown) => `caught: ${error}`, children: "child" })

        expect(boundary.render()).toBe("child")

        boundary.state = ErrorBoundary.getDerivedStateFromError("boom")
        expect(boundary.render()).toBe("caught: boom")
    })

    test("ErrorBoundary dispatches caught errors on the container's event bus", async () => {
        const { ErrorBoundary } = await import("@/runtimes/react")
        const { Bus } = await import("@/events/bus")
        const { default: ArchitectError } = await import("@/errors/error")

        const container = new BuiltinContainer()
        const bus = new Bus()
        container.singleton("events", () => bus)

        const seen: InstanceType<typeof ArchitectError>[] = []
        bus.listen("error", (payload: InstanceType<typeof ArchitectError>) => {
            seen.push(payload)
        })

        const boundary = new ErrorBoundary({})
        boundary.context = container
        const error = new Error("boom")
        boundary.componentDidCatch(error, { componentStack: "" })

        await Bun.sleep(0)
        expect(seen).toHaveLength(1)
        expect(seen[0]).toBeInstanceOf(ArchitectError)
        expect(seen[0].cause).toBe(error)
        expect(seen[0].source).toBe("react")
        expect(seen[0].errorInfo).toEqual({ componentStack: "" })
    })

    test("ErrorBoundary tolerates a container without an events binding", async () => {
        const { ErrorBoundary } = await import("@/runtimes/react")
        const boundary = new ErrorBoundary({})
        boundary.context = new BuiltinContainer()
        expect(() => boundary.componentDidCatch(new Error("boom"), { componentStack: "" })).not.toThrow()
    })
})
