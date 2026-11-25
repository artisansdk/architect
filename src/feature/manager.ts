import type ConfigRepository from "../config/repository"
import type { Class } from "../container/contract"
import type StoreManager from "../store/manager"
import type { Signal } from "../support/signal"
import type Contract from "./contract"
import type { FeatureUpdate } from "./contracts/can-set-many-features-for-scopes"
import type { Driver, FeatureScopes, FeatureValues } from "./contracts/driver"
import type { ExtractsFeatures, FeatureList } from "./contracts/extracts-features"
import StoreDriver from "./drivers/store"
import JsonApiUserFeatures from "./extractors/json-api-user"
import { Feature, type Resolver } from "./feature"

/**
 * Feature stores by name, as in Pennant's `FeatureManager`. A store is created on first use,
 * from a driver registered with `extend()` or else the store driver of the same name.
 * Every other call goes to the default store.
 */
export default class FeatureManager {
    protected stores = new Map<string, Feature>()
    protected creators = new Map<string, (config: ConfigRepository) => Driver>()
    protected scopeResolver?: (driver: string) => unknown
    protected extractor: ExtractsFeatures = new JsonApiUserFeatures()

    constructor(
        protected storeManager: StoreManager,
        protected defaultStore: string,
        protected config: ConfigRepository,
    ) {}

    /**
     * The default store is `feature.store`, or else the active store driver.
     */
    static fromConfig(config: ConfigRepository, stores: StoreManager): FeatureManager {
        return new FeatureManager(stores, config.get<string>("feature.store") ?? stores.getDefaultDriver(), config)
    }

    /**
     * The feature store with the given name, or the default store, e.g. `Feature.store("redis")`.
     * Each store is created once and keeps its own definitions and cache.
     *
     * @throws Error when no feature driver or store driver has that name.
     */
    store(name = this.defaultStore): Feature {
        let store = this.stores.get(name)
        if (!store) {
            const driver = this.creators.get(name)?.(this.config) ?? new StoreDriver(this.storeManager.driver(name))
            store = new Feature(driver, undefined, undefined, undefined, name)
            store.resolveScopeUsing((driver) => (this.scopeResolver ? this.scopeResolver(driver) : "global"))
            this.stores.set(name, store)
        }
        return store
    }

    /**
     * Register a custom feature driver, available through `store(name)`.
     */
    extend(name: string, factory: (config: ConfigRepository) => Driver): this {
        this.creators.set(name, factory)
        return this
    }

    /**
     * Set how every store resolves the default scope when `for()` is not used.
     * The resolver runs on each check and receives the store's driver name; returning
     * `null` selects the null scope.
     */
    resolveScopeUsing(resolver: (driver: string) => unknown): void {
        this.scopeResolver = resolver
    }

    /**
     * Set how response bodies map to server-owned features. Defaults to `JsonApiUserFeatures`.
     */
    extractFeaturesUsing(extractor: ExtractsFeatures): this {
        this.extractor = extractor
        return this
    }

    /**
     * Sync the server-owned features a parsed response body carries into the default store.
     * Bodies without features are ignored. Architect's HTTP client calls this for every JSON response
     * when `feature.sync` is `true`; call it yourself for responses from other clients.
     */
    async syncResponse(body: unknown): Promise<void> {
        const features = this.extractor.features(body)
        if (features == null) return
        const scope = this.extractor.scope?.(body)
        await (scope === undefined ? this.store() : this.store().for(scope)).sync(features)
    }

    /**
     * Clear the in-memory cache of every store created so far.
     */
    flushCache(): void {
        for (const store of this.stores.values()) store.flushCache()
    }

    define<T = unknown, TScope = string>(name: string, resolver?: Resolver<T, TScope>): Feature {
        return this.store().define(name, resolver)
    }

    variant(name: string, variants: string[] | Record<string, number>): Feature {
        return this.store().variant(name, variants)
    }

    instance<T extends Contract<never>>(feature: Class<T>): T
    instance(feature: string): (scope: string) => unknown
    instance<T extends Contract<never>>(feature: Class<T> | string): T | ((scope: string) => unknown) {
        return typeof feature === "string" ? this.store().instance(feature) : this.store().instance(feature)
    }

    for(scope: unknown): Feature {
        return this.store().for(scope)
    }

    value<T = unknown>(name: string): Promise<T> {
        return this.store().value<T>(name)
    }

    values(names: string[]): Promise<Record<string, unknown>> {
        return this.store().values(names)
    }

    all(): Promise<Record<string, unknown>> {
        return this.store().all()
    }

    getAll(features: FeatureScopes): Promise<FeatureValues> {
        return this.store().getAll(features)
    }

    active(name: string): Promise<boolean> {
        return this.store().active(name)
    }

    inactive(name: string): Promise<boolean> {
        return this.store().inactive(name)
    }

    when<R>(
        name: string,
        onActive: (value: unknown, features: Feature) => R | Promise<R>,
        onInactive?: (features: Feature) => R | Promise<R>,
    ): Promise<R | undefined> {
        return this.store().when(name, onActive, onInactive)
    }

    unless<R>(
        name: string,
        onInactive: (features: Feature) => R | Promise<R>,
        onActive?: (value: unknown, features: Feature) => R | Promise<R>,
    ): Promise<R | undefined> {
        return this.store().unless(name, onInactive, onActive)
    }

    activate(names: string | string[], value?: unknown): Promise<void> {
        return this.store().activate(names, value)
    }

    deactivate(names: string | string[]): Promise<void> {
        return this.store().deactivate(names)
    }

    setAll(features: FeatureUpdate[]): Promise<void> {
        return this.store().setAll(features)
    }

    sync(features: FeatureList): Promise<void> {
        return this.store().sync(features)
    }

    activateForEveryone(names: string | string[], value?: unknown): Promise<void> {
        return this.store().activateForEveryone(names, value)
    }

    deactivateForEveryone(names: string | string[]): Promise<void> {
        return this.store().deactivateForEveryone(names)
    }

    forget(names: string | string[]): Promise<void> {
        return this.store().forget(names)
    }

    purge(names?: string | string[] | null): Promise<void> {
        return this.store().purge(names)
    }

    changes(): Signal<number> {
        return this.store().changes()
    }

    defined(): string[] {
        return this.store().defined()
    }

    stored(): Promise<string[]> {
        return this.store().stored()
    }

    definedFeaturesForScope(scope?: unknown): Promise<string[]> {
        return this.store().definedFeaturesForScope(scope)
    }

    getDriver(): Driver {
        return this.store().getDriver()
    }
}
