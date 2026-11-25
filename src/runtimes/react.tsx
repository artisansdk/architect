import {
    Component,
    createContext,
    type ErrorInfo,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react"
import { useProxy } from "valtio/utils"
import { proxy } from "valtio/vanilla"
import type { Container, Identifier } from "../container/contract"
import ArchitectError from "../errors/error"
import type { Bus } from "../events/bus"
import type FeatureManager from "../feature/manager"
import type { Application } from "../foundation/application"
import type { Signal } from "../support/signal"

const dummyReactive = proxy({})

const Context = createContext<Container | null>(null)

export type ErrorBoundaryProps = {
    fallback?: ReactNode | ((error: unknown) => ReactNode)
    children?: ReactNode
}

type ErrorBoundaryState = { failed: boolean; error: unknown }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    static contextType = Context
    declare context: Container | null

    state: ErrorBoundaryState = { failed: false, error: null }

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return { failed: true, error }
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        if (this.context?.bound("events")) {
            void this.context.make<Bus>("events").dispatch(new ArchitectError(error, "react", errorInfo))
        }
    }

    render() {
        if (this.state.failed) {
            const { fallback } = this.props
            return typeof fallback === "function" ? fallback(this.state.error) : (fallback ?? null)
        }

        return this.props.children
    }
}

type ApplicationProviderProps = {
    container: Container
    errorFallback?: ErrorBoundaryProps["fallback"]
    children?: ReactNode
}

export function ApplicationProvider({ container, errorFallback, children }: ApplicationProviderProps) {
    return (
        <Context.Provider value={container}>
            <ErrorBoundary fallback={errorFallback}>{children}</ErrorBoundary>
        </Context.Provider>
    )
}

export type ContextProviderProps = {
    application?: Application
    container?: Container
    fallback?: ReactNode
    errorFallback?: ErrorBoundaryProps["fallback"]
    children?: ReactNode
}

export function ContextProvider({
    application,
    container,
    fallback = null,
    errorFallback,
    children,
}: ContextProviderProps) {
    if (!application && !container) {
        throw new Error("ContextProvider requires either `application` or `container`.")
    }

    const externalRuntime = useMemo(() => (container ? { container, stop: () => {} } : null), [container])
    const [runtime, setRuntime] = useState<{ container: Container; stop: () => void } | null>(externalRuntime)

    const stopRef = useRef<null | (() => void)>(null)
    const startedRef = useRef(false)

    useEffect(() => {
        if (externalRuntime) {
            setRuntime(externalRuntime)
            return
        }

        if (startedRef.current || !application) {
            return
        }

        startedRef.current = true

        const running = application.run()
        stopRef.current = running.stop
        setRuntime(running)

        return () => {
            stopRef.current?.()
            stopRef.current = null
            startedRef.current = false
            setRuntime(null)
        }
    }, [application, externalRuntime])

    if (!runtime) {
        return <>{fallback}</>
    }

    return (
        <ApplicationProvider container={runtime.container} errorFallback={errorFallback}>
            {children}
        </ApplicationProvider>
    )
}

export function useService<T>(identifier: Identifier<T>): T {
    const container = useContext(Context)
    if (!container) {
        throw new Error("You must use `useService` inside the Application Context.")
    }

    const service = container.make<T>(identifier)
    const reactive = container.tagged(identifier).includes("reactive")
    const proxied = useProxy(reactive ? (service as object) : dummyReactive)

    return (reactive ? proxied : service) as T
}

export function useContainer(): Container {
    const container = useContext(Context)
    if (!container) {
        throw new Error("You must use `useContainer` inside the Application Context.")
    }

    return container
}

export function useSignal<T>(signal: Signal<T>): T {
    return useSyncExternalStore(
        (onChange) => signal.subscribe(onChange),
        () => signal.get(),
    )
}

/**
 * Whether a feature is active; `useFeatures([name])` for one feature.
 */
export function useFeature(name: string, scope?: unknown): boolean {
    return useFeatures([name], scope)[0]
}

/**
 * Whether each feature is active, re-checked whenever the default feature store changes (a response sync,
 * `activate()`, `flushCache()`, ...). Pass a list for a tuple, `const [a, b] = useFeatures(["a", "b"])`,
 * or an object of local names to feature names for the same keys, `const { a, b } = useFeatures({ a, b })`.
 *
 * Each is `false` until its check resolves or when it fails, so gated UI stays hidden until access is known.
 * Inline lists and objects are fine: checks re-run only when the feature names change. Pass `scope` to check
 * someone other than the default scope; it is compared by identity, so pass a stable value such as `user:42`.
 */
export function useFeatures<const T extends readonly string[]>(
    names: T,
    scope?: unknown,
): { -readonly [I in keyof T]: boolean }
export function useFeatures<K extends string>(names: Record<K, string>, scope?: unknown): Record<K, boolean>
export function useFeatures(names: readonly string[] | Record<string, string>, scope?: unknown): unknown {
    const features = useService<FeatureManager>("feature")
    const revision = useSignal(features.changes())
    const list = Array.isArray(names) ? names : Object.values(names)
    const key = JSON.stringify(list)
    const [checked, setChecked] = useState<{ key: string; values: boolean[] } | null>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to check again after the store changes.
    useEffect(() => {
        let current = true
        const store = scope === undefined ? features : features.for(scope)
        const names = JSON.parse(key) as string[]
        void Promise.all(names.map((name) => store.active(name).catch(() => false))).then((values) => {
            if (current) setChecked({ key, values })
        })
        return () => {
            current = false
        }
    }, [features, key, scope, revision])

    // Values checked for a previous list of names don't apply to this one.
    const values = checked?.key === key ? checked.values : list.map(() => false)
    return Array.isArray(names) ? values : Object.fromEntries(Object.keys(names).map((alias, i) => [alias, values[i]]))
}
