import type { Class } from "../container/contract"
import { make } from "../foundation/container"
import Lottery from "../lottery/lottery"
import LotteryFacade from "../support/facades/lottery"
import { Signal } from "../support/signal"
import Contract from "./contract"
import type { CanListStoredFeatures } from "./contracts/can-list-stored-features"
import type { CanSetManyFeaturesForScopes, FeatureUpdate } from "./contracts/can-set-many-features-for-scopes"
import type { DefinesFeaturesExternally } from "./contracts/defines-features-externally"
import type { Driver, FeatureScopes, FeatureValues } from "./contracts/driver"
import { type FeatureList, toFeatureValues } from "./contracts/extracts-features"
import type { HasFlushableCache } from "./contracts/has-flushable-cache"
import { resolveScope, serializeScope } from "./scope"

export type Resolver<T = unknown, TScope = string> =
    | T
    | ((scope: TScope, feature: string) => T | Promise<T>)
    | Contract<TScope>
    | Lottery

type FeatureDriver = Driver &
    Partial<CanListStoredFeatures & CanSetManyFeaturesForScopes & DefinesFeaturesExternally & HasFlushableCache>

/**
 * Feature flags. A feature's first resolved value is persisted per scope,
 * so a random A/B assignment stays sticky. Unknown features are `false` and never stored.
 */
export class Feature implements CanListStoredFeatures, CanSetManyFeaturesForScopes, HasFlushableCache {
    protected driver: FeatureDriver
    protected scope?: unknown[]
    protected definitions: Map<string, Resolver>
    protected pending: Map<string, Promise<unknown>>
    protected scopeResolver?: (driver: string) => unknown
    protected revision = new Signal(0)

    /**
     * @param scope the scope(s) to check, defaults to global or the scope returned from `resolveScopeUsing()`.
     */
    constructor(
        driver: Driver,
        scope?: unknown,
        definitions = new Map<string, Resolver>(),
        pending = new Map<string, Promise<unknown>>(),
        protected driverName = "store",
    ) {
        this.driver = driver
        this.scope = scope === undefined ? undefined : Array.isArray(scope) ? scope : [scope]
        this.definitions = definitions
        this.pending = pending
    }

    /**
     * Define a feature by a static value, a resolver receiving the scope and feature name,
     * a feature class instance, or a `Lottery` such as `Lottery.odds(1, 10)`.
     *
     * A lottery draws at random for the `"global"` scope, so the stored value keeps it sticky.
     * For any other scope it draws from a hash of the feature name and scope, so a user gets
     * the same result on every device.
     *
     * A `null` scope resolves to `false` without calling a lottery, a class instance, or a resolver that
     * declares a scope parameter. Give the parameter a default (`(user = null) => ...`) to receive `null`.
     */
    define<T = unknown, TScope = string>(name: string, resolver: Resolver<T, TScope> = true as T): this {
        this.definitions.set(name, resolver)
        const nullSafe =
            !(resolver instanceof Contract || resolver instanceof Lottery) &&
            (typeof resolver !== "function" || (resolver as () => unknown).length === 0)
        const resolve = this.resolverFor(name, resolver as Resolver)
        this.driver.define(name, (scope) => (scope === null && !nullSafe ? false : resolve(scope)))
        this.flush(name)
        this.changed()
        return this
    }

    /**
     * Define a feature that picks one variant: equally from a list, or by weight from a map
     * (`{ a: 2, b: 1, c: 1 }`). The first pick is persisted like any feature; read it with `value()`.
     * Needs the `"lottery"` binding from `FeatureProvider`.
     */
    variant(name: string, variants: string[] | Record<string, number>): this {
        return this.define(name, LotteryFacade.pick(variants))
    }

    /**
     * Set how this store resolves the default scope when `for()` is not used.
     * The resolver runs on each check and receives the store's driver name; returning
     * `null` selects the null scope. `FeatureManager.resolveScopeUsing()` sets it for every store.
     */
    resolveScopeUsing(resolver: (driver: string) => unknown): void {
        this.scopeResolver = resolver
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
        return typeof resolver === "function"
            ? (resolver as (scope: string) => unknown)
            : this.resolverFor(feature, resolver)
    }

    /**
     * A view of the same features for another scope, or several: `Feature.for("user:42")`, `Feature.for([a, b])`.
     * With multiple scopes, `active()` requires every scope and value reads throw.
     */
    for(scope: unknown): Feature {
        const view = new Feature(this.driver, scope, this.definitions, this.pending, this.driverName)
        view.scopeResolver = this.scopeResolver
        view.revision = this.revision
        return view
    }

    /**
     * The feature's value for the current scope.
     *
     * @throws Error when the view has more than one scope.
     */
    async value<T = unknown>(name: string): Promise<T> {
        return (await this.get(name, this.only())) as T
    }

    /**
     * Read a feature for one scope, converting the scope with `toFeatureIdentifier()` first.
     * Concurrent reads of the same feature and scope share one pending resolution.
     */
    protected get(name: string, raw: unknown): Promise<unknown> {
        const scope = resolveScope(raw, this.driverName)
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
        return pending
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

    async definedFeaturesForScope(scope: unknown = this.only()): Promise<string[]> {
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

    /**
     * Active for every scope.
     */
    async active(name: string): Promise<boolean> {
        return (await this.everyScope(name)).every((value) => value !== false)
    }

    /**
     * Inactive for every scope.
     */
    async inactive(name: string): Promise<boolean> {
        return (await this.everyScope(name)).every((value) => value === false)
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
     * Override the stored value for each scope.
     */
    async activate(names: string | string[], value: unknown = true): Promise<void> {
        const scopes = this.scopes()
        await this.setAll(
            (Array.isArray(names) ? names : [names]).flatMap((feature) =>
                scopes.map((scope) => ({ feature, scope, value })),
            ),
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
            this.changed()
        }
    }

    /**
     * Apply server-owned features to each scope: a list of active names, or a name → value map.
     * Sent values overwrite local ones. A stored feature that is neither sent nor defined locally
     * was revoked on the server, so it is forgotten. Locally defined features the server omits keep their value.
     */
    async sync(features: FeatureList): Promise<void> {
        const values = toFeatureValues(features)
        const scopes = this.scopes()
        await this.setAll(
            Object.entries(values).flatMap(([feature, value]) => scopes.map((scope) => ({ feature, scope, value }))),
        )
        const defined = new Set(this.defined())
        const revoked = (await this.stored()).filter((name) => !Object.hasOwn(values, name) && !defined.has(name))
        if (revoked.length) await this.forget(revoked)
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
                this.changed()
            }
        }
    }

    deactivateForEveryone(names: string | string[]): Promise<void> {
        return this.activateForEveryone(names, false)
    }

    /**
     * Drop the stored value for each scope so it re-resolves on next read.
     */
    async forget(names: string | string[]): Promise<void> {
        const scopes = this.scopes().map((scope) => resolveScope(scope, this.driverName))
        try {
            for (const name of Array.isArray(names) ? names : [names]) {
                for (const scope of scopes) {
                    try {
                        await this.driver.delete(name, scope)
                    } finally {
                        this.pending.delete(this.key(name, scope))
                    }
                }
            }
        } finally {
            this.changed()
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
            this.changed()
        }
    }

    flushCache(): void {
        this.pending.clear()
        this.driver.flushCache?.()
        this.changed()
    }

    /**
     * A counter shared by every view of this store, bumped after each definition, write, or cache flush,
     * so a UI knows to check its features again (e.g. React's `useFeature`).
     */
    changes(): Signal<number> {
        return this.revision
    }

    /**
     * The scopes given to `for()`, or the default scope. As in Pennant, `for([])` is the null scope.
     */
    protected scopes(): unknown[] {
        if (this.scope) return this.scope.length ? this.scope : [null]
        return [this.scopeResolver ? this.scopeResolver(this.driverName) : "global"]
    }

    /**
     * The view's single scope, for reads that return one value.
     *
     * @throws Error when the view has more than one scope.
     */
    protected only(): unknown {
        const scopes = this.scopes()
        if (scopes.length > 1) {
            throw new Error("It is not possible to retrieve the values for multiple scopes.")
        }
        return scopes[0]
    }

    /**
     * The feature's value for each of the view's scopes, in order.
     */
    protected everyScope(name: string): Promise<unknown[]> {
        return Promise.all(this.scopes().map((scope) => this.get(name, scope)))
    }

    /**
     * A definition as a `(scope) => value` function, passing the feature name to resolvers and seeding lotteries.
     */
    protected resolverFor(name: string, resolver: Resolver): (scope: unknown) => unknown {
        if (resolver instanceof Contract) return (scope) => resolver.resolve(scope, name)
        if (resolver instanceof Lottery) {
            return (scope) => resolver.draw(scope === "global" ? undefined : `${name}:${serializeScope(scope)}`)
        }
        return typeof resolver === "function"
            ? (scope) => (resolver as (scope: unknown, feature: string) => unknown)(scope, name)
            : () => resolver
    }

    protected changed(): void {
        this.revision.update((revision) => revision + 1)
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
