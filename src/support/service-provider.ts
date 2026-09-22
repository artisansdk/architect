import type { Container, Identifier } from "../container/contract"

export type Cleanup = () => void

export default class ServiceProvider {
    /**
     * Register the service to the container.
     */
    register(container: Container): void
    register(): void {}

    /**
     * Boot the service instance(s).
     */
    boot(container: Container): void
    boot(): void {}

    /**
     * Called by the Application on shutdown, in reverse provider order. Tear down what boot() started.
     */
    destroy(container: Container): void
    destroy(): void {}
}

export class DeferrableServiceProvider extends ServiceProvider {
    /**
     * Identifiers this provider owns. Must be exhaustive — the Application defers register()/boot()
     * until one of these is resolved from the container, at which point both run once and the
     * provider is considered booted. An empty list (the default) disables deferral entirely and
     * the provider boots eagerly, same as a regular ServiceProvider — there's nothing to hook.
     */
    provides(): Identifier[] {
        return []
    }
}
