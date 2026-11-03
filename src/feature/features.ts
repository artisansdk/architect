import type { Class } from "../container/contract"
import { make } from "../foundation/container"
import type Contract from "./contract"
import type { CanListStoredFeatures } from "./contracts/can-list-stored-features"
import type { CanSetManyFeaturesForScopes, FeatureUpdate } from "./contracts/can-set-many-features-for-scopes"
import type { DefinesFeaturesExternally } from "./contracts/defines-features-externally"
import type { Driver, FeatureScopes, FeatureValues } from "./contracts/driver"
import type { HasFlushableCache } from "./contracts/has-flushable-cache"
import { resolveScope, serializeScope } from "./scope"

export type Resolver<T = unknown, TScope = string> = T | ((scope: TScope) => T | Promise<T>)

type FeatureDriver = Driver &
    Partial<CanListStoredFeatures & CanSetManyFeaturesForScopes & DefinesFeaturesExternally & HasFlushableCache>

/**
 * Pennant-style feature flags. A feature's first resolved value is persisted per scope,
 * so a random A/B assignment stays sticky. Unknown features are `false` and never stored.
 */
export class Features implements CanListStoredFeatures, CanSetManyFeaturesForScopes, HasFlushableCache {
    protected driver: FeatureDriver
    protected scope: unknown
    protected definitions: Map<string, Resolver>
    protected pending: Map<string, Promise<unknown>>

    constructor(
        driver: Driver,
        scope: unknown = "global",
        definitions = new Map<string, Resolver>(),
        pending = new Map<string, Promise<unknown>>(),
        protected driverName = "store",
    ) {
        this.driver = driver
        this.scope = scope
        this.definitions = definitions
        this.pending = pending
    }

    /**
     * Define a feature by a static value or a resolver receiving the scope.
     */
    define<T = unknown, TScope = string>(name: string, resolver: Resolver<T, TScope> = true as T): this {
        this.definitions.set(name, resolver)
        this.driver.define(name, (scope) =>
            typeof resolver === "function"
                ? (resolver as (scope: TScope) => T | Promise<T>)(scope as TScope)
                : resolver,
        )
        this.flush(name)
        return this
    }

    /**
     * Retrieve a feature's implementation without evaluating or persisting it.
     */
    instance<T extends Contract<never>>(feature: Class<T>): T
    instance(feature: string): (scope: string) => unknown
    instance<T extends Contract<never>>(feature: Class<T> | string): T | ((scope: string) => unknown) {
        if (typeof feature !== "string") {
            return make(feature)
        }

        const resolver = this.definitions.get(feature) ?? feature
        return typeof resolver === "function" ? (resolver as (scope: string) => unknown) : () => resolver
    }

    /**
     * A view of the same features for another scope, e.g. `Feature.for("user:42")`.
     */
    for(scope: unknown): Features {
        return new Features(this.driver, scope, this.definitions, this.pending, this.driverName)
    }

    async value<T = unknown>(name: string): Promise<T> {
        const scope = resolveScope(this.scope, this.driverName)
        const key = this.key(name, scope)
        let pending = this.pending.get(key)
        // Share the first resolution across all views of this scope.
        if (!pending) {
            pending = this.driver.get(name, scope)
            void pending.catch(() => {
                if (this.pending.get(key) === pending) this.pending.delete(key)
            })
            this.pending.set(key, pending)
        }
        return pending as Promise<T>
    }

    getDriver(): Driver {
        return this.driver
    }

    defined(): string[] {
        return this.driver.defined()
    }

    async stored(): Promise<string[]> {
        if (typeof this.driver.stored !== "function") {
            throw new Error(`The [${this.driverName}] driver does not support listing stored features.`)
        }
        return this.driver.stored()
    }

    async definedFeaturesForScope(scope: unknown = this.scope): Promise<string[]> {
        const resolved = resolveScope(scope, this.driverName)
        return typeof this.driver.definedFeaturesForScope === "function"
            ? this.driver.definedFeaturesForScope(resolved)
            : this.defined()
    }

    async values(names: string[]): Promise<Record<string, unknown>> {
        return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await this.value(name)])))
    }

    async all(): Promise<Record<string, unknown>> {
        return this.values(await this.definedFeaturesForScope())
    }

    /**
     * Load feature values for multiple scopes using the driver's bulk read.
     */
    async getAll(features: FeatureScopes): Promise<FeatureValues> {
        const resolved = Object.fromEntries(
            Object.entries(features).map(([name, scopes]) => [
                name,
                scopes.map((scope) => resolveScope(scope, this.driverName)),
            ]),
        )
        const values = await this.driver.getAll(resolved)
        for (const [name, scopes] of Object.entries(resolved)) {
            scopes.forEach((scope, index) => {
                this.pending.set(this.key(name, scope), Promise.resolve(values[name][index]))
            })
        }
        return values
    }

    async active(name: string): Promise<boolean> {
        return (await this.value(name)) !== false
    }

    async inactive(name: string): Promise<boolean> {
        return !(await this.active(name))
    }

    async when<R>(
        name: string,
        onActive: (value: unknown, features: this) => R | Promise<R>,
        onInactive?: (features: this) => R | Promise<R>,
    ): Promise<R | undefined> {
        const value = await this.value(name)
        return value !== false ? onActive(value, this) : onInactive?.(this)
    }

    unless<R>(
        name: string,
        onInactive: (features: this) => R | Promise<R>,
        onActive?: (value: unknown, features: this) => R | Promise<R>,
    ): Promise<R | undefined> {
        return this.when<R | undefined>(name, onActive ?? (() => undefined), onInactive)
    }

    /**
     * Override the stored value for this scope.
     */
    async activate(names: string | string[], value: unknown = true): Promise<void> {
        await this.setAll(
            (Array.isArray(names) ? names : [names]).map((feature) => ({
                feature,
                scope: this.scope,
                value,
            })),
        )
    }

    deactivate(names: string | string[]): Promise<void> {
        return this.activate(names, false)
    }

    async setAll(features: FeatureUpdate[]): Promise<void> {
        const updates = features.map((update) => ({
            ...update,
            scope: resolveScope(update.scope, this.driverName),
        }))
        try {
            if (typeof this.driver.setAll === "function") {
                await this.driver.setAll(updates)
            } else {
                for (const { feature, scope, value } of updates) {
                    await this.driver.set(feature, scope, value)
                }
            }
        } finally {
            for (const { feature, scope } of updates) this.pending.delete(this.key(feature, scope))
        }
    }

    /**
     * Update existing stored scopes; new scopes still use the feature resolver.
     */
    async activateForEveryone(names: string | string[], value: unknown = true): Promise<void> {
        for (const name of Array.isArray(names) ? names : [names]) {
            try {
                await this.driver.setForAllScopes(name, value)
            } finally {
                this.flush(name)
            }
        }
    }

    deactivateForEveryone(names: string | string[]): Promise<void> {
        return this.activateForEveryone(names, false)
    }

    /**
     * Drop the stored value for this scope so it re-resolves on next read.
     */
    async forget(names: string | string[]): Promise<void> {
        const scope = resolveScope(this.scope, this.driverName)
        for (const name of Array.isArray(names) ? names : [names]) {
            try {
                await this.driver.delete(name, scope)
            } finally {
                this.pending.delete(this.key(name, scope))
            }
        }
    }

    /**
     * Drop stored values for every scope — one feature, or all features when no name is given.
     */
    async purge(names?: string | string[] | null): Promise<void> {
        const features = names == null ? null : Array.isArray(names) ? names : [names]
        try {
            await this.driver.purge(features)
        } finally {
            if (features === null) this.pending.clear()
            else for (const name of features) this.flush(name)
        }
    }

    flushCache(): void {
        this.pending.clear()
        this.driver.flushCache?.()
    }

    protected key(name: string, scope: unknown): string {
        return `feature:${encodeURIComponent(name)}:${serializeScope(scope)}`
    }

    protected flush(name?: string): void {
        const prefix = name === undefined ? "feature:" : `feature:${encodeURIComponent(name)}:`
        for (const key of this.pending.keys()) {
            if (key.startsWith(prefix)) {
                this.pending.delete(key)
            }
        }
    }
}
