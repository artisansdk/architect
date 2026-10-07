import type { Adapter } from "../store/adapters/contract"

export type Resolver<T = unknown> = T | ((scope: string) => T | Promise<T>)

/**
 * Pennant-style feature flags. A feature's first resolved value is persisted per scope,
 * so a random A/B assignment stays sticky. Unknown features are `false` and never stored.
 */
export class Features {
    protected store: Adapter
    protected scope: string
    protected definitions: Map<string, Resolver>
    protected pending: Map<string, Promise<unknown>>

    constructor(
        store: Adapter,
        scope = "global",
        definitions = new Map<string, Resolver>(),
        pending = new Map<string, Promise<unknown>>(),
    ) {
        this.store = store
        this.scope = scope
        this.definitions = definitions
        this.pending = pending
    }

    /** Define a feature by a static value or a resolver receiving the scope. */
    define<T = unknown>(name: string, resolver: Resolver<T> = true as T): this {
        this.definitions.set(name, resolver)
        this.flush(name)
        return this
    }

    /** A view of the same features for another scope, e.g. `Feature.for("user:42")`. */
    for(scope: string): Features {
        return new Features(this.store, scope, this.definitions, this.pending)
    }

    value<T = unknown>(name: string): Promise<T> {
        const key = this.key(name)
        let pending = this.pending.get(key)
        // ponytail: memoize the in-flight resolution so concurrent first reads share one A/B assignment.
        if (!pending) {
            pending = this.resolve(name, key)
            pending.catch(() => this.pending.delete(key))
            this.pending.set(key, pending)
        }
        return pending as Promise<T>
    }

    async active(name: string): Promise<boolean> {
        return (await this.value(name)) !== false
    }

    async inactive(name: string): Promise<boolean> {
        return !(await this.active(name))
    }

    async when<R>(
        name: string,
        onActive: (value: unknown) => R | Promise<R>,
        onInactive?: () => R | Promise<R>,
    ): Promise<R | undefined> {
        const value = await this.value(name)
        return value !== false ? onActive(value) : onInactive?.()
    }

    /** Override the stored value for this scope. */
    async activate(name: string, value: unknown = true): Promise<void> {
        await this.store.set(this.key(name), value)
        this.flush(name)
    }

    deactivate(name: string): Promise<void> {
        return this.activate(name, false)
    }

    /** Drop the stored value for this scope so it re-resolves on next read. */
    async forget(name: string): Promise<void> {
        await this.store.delete(this.key(name))
        this.flush(name)
    }

    /** Drop stored values for every scope — one feature, or all features when no name is given. */
    async purge(name?: string): Promise<void> {
        const prefix = name === undefined ? "feature:" : `feature:${name}:`
        const keys = (await this.store.keys()).filter((key) => key.startsWith(prefix))
        await Promise.all(keys.map((key) => this.store.delete(key)))
        this.flush(name)
    }

    protected async resolve(name: string, key: string): Promise<unknown> {
        const stored = await this.store.get(key)
        if (stored !== null && stored !== undefined) {
            return stored
        }

        if (!this.definitions.has(name)) {
            return false
        }

        const resolver = this.definitions.get(name)
        const value = (await (typeof resolver === "function" ? resolver(this.scope) : resolver)) ?? false
        await this.store.set(key, value)
        return value
    }

    protected key(name: string): string {
        return `feature:${name}:${this.scope}`
    }

    protected flush(name?: string): void {
        const prefix = name === undefined ? "feature:" : `feature:${name}:`
        for (const key of this.pending.keys()) {
            if (key.startsWith(prefix)) {
                this.pending.delete(key)
            }
        }
    }
}
