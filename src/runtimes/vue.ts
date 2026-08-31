import { defineComponent, type InjectionKey, inject, onUnmounted, provide } from "vue"
import type { Container, Identifier } from "../container/contract"
import type { Application } from "../foundation/application"

export const containerKey: InjectionKey<Container> = Symbol("application.container")

export const ContextProvider = defineComponent({
    name: "ArchitectContextProvider",
    props: {
        application: { type: Object as () => Application, required: false },
        container: { type: Object as () => Container, required: false },
    },
    setup(props, { slots }) {
        if (!props.container && !props.application) {
            throw new Error("ContextProvider requires either `application` or `container`.")
        }

        const runtime = props.container
            ? { container: props.container, stop: () => {} }
            : (props.application as Application).run()

        provide(containerKey, runtime.container)
        onUnmounted(() => runtime.stop())

        return () => slots.default?.() ?? []
    },
})

export function useService<T>(identifier: Identifier<T>): T {
    const container = inject(containerKey, null)
    if (!container) {
        throw new Error("Application container is not available in Vue context.")
    }

    return container.make<T>(identifier)
}
