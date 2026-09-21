import { createConfig } from "../config/discovery"
import { registerGlobalEnv } from "../config/env"
import { ConfigProvider } from "../config/provider"
import type ConfigRepository from "../config/repository"
import { mergeItems } from "../config/repository"
import type { Container as Contract, Identifier } from "../container/contract"
import { createRuntimeContainer } from "../container/runtime"
import { isClass } from "../support/reflect"
import ServiceProvider, { type Cleanup, DeferrableServiceProvider } from "../support/service-provider"
import { getContainer, make, setContainer } from "./container"
import { type ApplicationConfigureOptions, type ApplicationResolvedOptions, mergeConfigureOptions } from "./options"
import type { Usable } from "./usable"

export { getContainer, make, setContainer } from "./container"
export type { ApplicationConfigureOptions, ApplicationResolvedOptions } from "./options"
export type { Usable } from "./usable"

registerGlobalEnv()

export class Application {
    protected providers: ServiceProvider[]
    protected options: ApplicationResolvedOptions

    constructor(options: ApplicationResolvedOptions) {
        this.options = options
        this.providers = []
    }

    protected getConfigItems(): ConfigRepository {
        return createConfig(this.options.basePath, this.options.config)
    }

    static configure(basePath?: string): Application
    static configure(options?: ApplicationConfigureOptions): Application
    static configure(basePathOrOptions: string | ApplicationConfigureOptions = "./") {
        if (typeof basePathOrOptions === "string") {
            return new Application(mergeConfigureOptions({ basePath: basePathOrOptions }))
        }

        return new Application(mergeConfigureOptions(basePathOrOptions))
    }

    static make<T>(identifier: Identifier<T>): T {
        return make<T>(identifier)
    }

    static use(value: Usable | Usable[]): Application {
        return Application.configure().use(value)
    }

    withProviders(providers: (ServiceProvider | (new () => ServiceProvider))[]) {
        return this.use(providers)
    }

    use(value: Usable | Usable[]): this {
        if (Array.isArray(value)) {
            for (const item of value) {
                this.use(item)
            }

            return this
        }

        if (typeof value === "function") {
            if (!isClass(value)) {
                throw new Error(
                    "Application.use() cannot accept a plain function; pass a class, an instance, or a config object.",
                )
            }

            // A class is routed by what it produces, so use(Database) and use(new Database()) agree.
            return this.use(new value() as Usable)
        }

        if (value instanceof ServiceProvider) {
            this.providers.push(value)
            return this
        }

        mergeItems(this.options.config, value)
        return this
    }

    protected createContainer(): Contract {
        return createRuntimeContainer(this.options.container)
    }

    /**
     * Wires deferred providers so register()/boot() run lazily, once, the first time any of their
     * declared provides() identifiers is resolved — instead of eagerly during run(). Patches the
     * container's own make() (get() already delegates to it) rather than wrapping the container,
     * so there's exactly one resolution/tag-transform pass either way. Booted providers are added
     * to `booted` (in the order they actually boot) so destroy() only runs for providers that did.
     */
    protected installDeferredResolution(
        container: Contract,
        providers: ServiceProvider[],
        booted: Set<ServiceProvider>,
    ): void {
        const pending = new Map<Identifier, DeferrableServiceProvider>()

        for (const provider of providers) {
            if (!(provider instanceof DeferrableServiceProvider)) continue
            for (const identifier of provider.provides()) {
                pending.set(identifier, provider)
            }
        }

        if (pending.size === 0) return

        const originalMake = container.make.bind(container)
        container.make = (<T>(identifier: Identifier<T>): T => {
            const provider = pending.get(identifier)
            if (provider) {
                for (const id of provider.provides()) pending.delete(id)
                provider.register(container)
                provider.boot(container)
                booted.add(provider)
            }
            return originalMake(identifier)
        }) as Contract["make"]
    }

    /**
     * `booted` is a Set in the order providers actually booted — eager providers in registration
     * order, deferred ones spliced in whenever they were first resolved. Reversing it gives LIFO
     * teardown: whatever booted last (even a deferred provider triggered mid-session, well after
     * run() returned) is destroyed first. Providers never booted — a deferred provider nothing ever
     * resolved — are simply absent, so destroy() never runs for them.
     */
    protected createStopHandler(container: Contract, booted: Set<ServiceProvider>): Cleanup {
        const stop: Cleanup = () => {
            for (const provider of [...booted].reverse()) {
                provider.destroy(container)
            }

            container.flush()

            if (getContainer() === container) {
                setContainer(null)
            }
        }

        return stop
    }

    run() {
        const container = this.createContainer()

        setContainer(container)
        container.instance("app", container)

        const providers = [new ConfigProvider(this.getConfigItems()), ...this.providers]

        const deferred = new Set<ServiceProvider>(
            providers.filter(
                (provider): provider is DeferrableServiceProvider =>
                    provider instanceof DeferrableServiceProvider && provider.provides().length > 0,
            ),
        )

        const booted = new Set<ServiceProvider>()

        this.installDeferredResolution(container, providers, booted)

        for (const provider of providers) {
            if (deferred.has(provider)) continue
            provider.register(container)
        }

        for (const provider of providers) {
            if (deferred.has(provider)) continue
            provider.boot(container)
            booted.add(provider)
        }

        const stop = this.createStopHandler(container, booted)

        window.addEventListener("beforeunload", stop, { once: true })

        return {
            container,
            stop,
        }
    }
}
