import { beforeAll, describe, expect, mock, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import type { ContainerIdentifier } from "@/container/contract"

const svelteState = {
    provided: null as { key: unknown; value: unknown } | null,
    providedContainer: null as BuiltinContainer | null,
    mounted: null as { component: unknown; options: unknown } | null,
    unmounted: null as unknown,
    useLegacyApi: false,
}

mock.module("svelte", () => ({
    setContext: (key: unknown, value: unknown) => {
        svelteState.provided = { key, value }
        svelteState.providedContainer = value as BuiltinContainer
    },
    getContext: (key: unknown) => {
        if (svelteState.provided?.key !== key) {
            return null
        }
        return svelteState.providedContainer
    },
    mount: (component: unknown, options: unknown) => {
        if (svelteState.useLegacyApi) {
            throw new Error("legacy")
        }
        svelteState.mounted = { component, options }
        return { mounted: true, component }
    },
    unmount: (instance: unknown) => {
        svelteState.unmounted = instance
    },
}))

let containerKey: symbol
let provideContainer: (container: BuiltinContainer) => void
let useService: <T>(identifier: ContainerIdentifier<T>) => T
let SvelteRenderer: new () => {
    render: (context: { RootComponent: unknown; container: BuiltinContainer; rootElementId: string }) => () => void
}

beforeAll(async () => {
    const runtime = await import("@/runtimes/svelte")
    const renderer = await import("@/renderers/adapters/svelte")
    containerKey = runtime.containerKey
    provideContainer = runtime.provideContainer
    useService = runtime.useService
    SvelteRenderer = renderer.default as typeof SvelteRenderer
})

describe("Svelte runtime and renderer", () => {
    test("provideContainer + useService resolves from Svelte context", () => {
        const container = new BuiltinContainer()
        const token = Symbol("token")
        container.bind(token).toConstantValue("resolved")

        svelteState.provided = null
        svelteState.providedContainer = null

        provideContainer(container)
        expect(svelteState.provided as { key: unknown; value: unknown } | null).toEqual({
            key: containerKey,
            value: container,
        })
        expect(useService<string>(token)).toBe("resolved")
    })

    test("useService throws when container is missing", () => {
        svelteState.provided = null
        svelteState.providedContainer = null

        expect(() => useService("missing")).toThrow("Application container is not available in Svelte context.")
    })

    test("throws when mount node is missing", () => {
        ;(globalThis as { document: { getElementById: (id: string) => null } }).document = {
            getElementById: () => null,
        }

        const renderer = new SvelteRenderer()
        expect(() =>
            renderer.render({
                RootComponent: class {},
                container: new BuiltinContainer(),
                rootElementId: "root",
            }),
        ).toThrow("Missing mount node #root.")
    })

    test("mounts component and unmounts on cleanup via svelte5 api", () => {
        const mountNode = {}
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => mountNode,
        }

        svelteState.mounted = null
        svelteState.unmounted = null
        svelteState.useLegacyApi = false

        const RootComponent = {}

        const container = new BuiltinContainer()
        const renderer = new SvelteRenderer()
        const cleanup = renderer.render({
            RootComponent,
            container,
            rootElementId: "root",
        })

        expect(svelteState.mounted as { component: unknown; options: unknown } | null).toEqual({
            component: RootComponent,
            options: { target: mountNode, props: { container } },
        })
        cleanup()
        expect(svelteState.unmounted).toEqual({ mounted: true, component: RootComponent })
    })

    test("supports legacy component api fallback", () => {
        let destroyed = 0
        svelteState.useLegacyApi = true
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => ({}),
        }

        class FakeComponent {
            destroy() {
                destroyed += 1
            }
        }

        const renderer = new SvelteRenderer()
        const cleanup = renderer.render({
            RootComponent: FakeComponent,
            container: new BuiltinContainer(),
            rootElementId: "root",
        })

        cleanup()
        expect(destroyed).toBe(1)
        svelteState.useLegacyApi = false
    })

    test("supports legacy component $destroy cleanup", () => {
        let destroyed = 0
        svelteState.useLegacyApi = true
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => ({}),
        }

        class FakeComponent {
            $destroy() {
                destroyed += 1
            }
        }

        const renderer = new SvelteRenderer()
        const cleanup = renderer.render({
            RootComponent: FakeComponent,
            container: new BuiltinContainer(),
            rootElementId: "root",
        })

        cleanup()
        expect(destroyed).toBe(1)
        svelteState.useLegacyApi = false
    })

    test("falls back to legacy api when svelte5 mount/unmount are unavailable", async () => {
        let destroyed = 0
        mock.module("svelte", () => ({
            setContext: () => {},
            getContext: () => null,
            mount: undefined,
            unmount: undefined,
        }))
        const { default: FreshSvelteRenderer } = await import("@/renderers/adapters/svelte")
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => ({}),
        }

        class FakeComponent {
            destroy() {
                destroyed += 1
            }
        }

        const renderer = new FreshSvelteRenderer()
        const cleanup = renderer.render({
            RootComponent: FakeComponent,
            container: new BuiltinContainer(),
            rootElementId: "root",
        })

        cleanup()
        expect(destroyed).toBe(1)
    })

    test("supports legacy component cleanup when no destroy hook exists", () => {
        svelteState.useLegacyApi = true
        ;(globalThis as { document: { getElementById: (id: string) => object | null } }).document = {
            getElementById: () => ({}),
        }

        class FakeComponent {}

        const renderer = new SvelteRenderer()
        const cleanup = renderer.render({
            RootComponent: FakeComponent,
            container: new BuiltinContainer(),
            rootElementId: "root",
        })

        expect(() => cleanup()).not.toThrow()
        svelteState.useLegacyApi = false
    })
})
