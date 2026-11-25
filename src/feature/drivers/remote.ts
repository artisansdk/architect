import type { Adapter } from "../../store/adapters/contract"
import type { DefinesFeaturesExternally } from "../contracts/defines-features-externally"
import { type FeatureList, toFeatureValues } from "../contracts/extracts-features"
import type { HasFlushableCache } from "../contracts/has-flushable-cache"
import { serializeScope } from "../scope"
import StoreDriver from "./store"

/**
 * Fetches a scope's server-owned features, e.g. `() => fetch("/features").then((r) => r.json())`.
 */
export type Fetcher = (scope: unknown) => Promise<FeatureList>

/**
 * A store driver whose server-owned features come from an endpoint (e.g. Laravel Pennant's
 * `Feature::for($user)->all()`). Each scope is fetched once per session, before its first check;
 * sent values overwrite stored ones, and stored features the server stops sending read `false`
 * unless defined locally. When the fetch fails, stored and local values are used and the next check retries.
 * `flushCache()` refetches. Local writes (`activate()`) are not sent to the server and the next fetch overwrites them.
 */
export default class RemoteDriver extends StoreDriver implements DefinesFeaturesExternally, HasFlushableCache {
    protected fetched = new Map<string, Promise<Record<string, unknown> | null>>()

    constructor(
        store: Adapter,
        protected fetcher: Fetcher,
    ) {
        super(store)
    }

    async definedFeaturesForScope(scope: unknown): Promise<string[]> {
        return [...new Set([...this.defined(), ...Object.keys((await this.remote(scope)) ?? {})])]
    }

    flushCache(): void {
        this.fetched.clear()
    }

    protected async resolve(feature: string, scope: unknown, key: string): Promise<unknown> {
        const values = await this.remote(scope)
        if (values && !Object.hasOwn(values, feature) && !this.definitions.has(feature)) {
            await this.store.delete(key)
            return false
        }
        return super.resolve(feature, scope, key)
    }

    /**
     * The scope's server features, fetched and stored once; `null` when the fetch failed.
     */
    protected remote(scope: unknown): Promise<Record<string, unknown> | null> {
        const id = serializeScope(scope)
        let pending = this.fetched.get(id)
        if (!pending) {
            const attempt: Promise<Record<string, unknown> | null> = this.pull(scope).catch(() => {
                if (this.fetched.get(id) === attempt) this.fetched.delete(id)
                return null
            })
            pending = attempt
            this.fetched.set(id, pending)
        }
        return pending
    }

    protected async pull(scope: unknown): Promise<Record<string, unknown>> {
        const values = toFeatureValues(await this.fetcher(scope))
        for (const [feature, value] of Object.entries(values)) await this.store.set(this.key(feature, scope), value)
        return values
    }
}
