import type { Adapter } from "../../store/adapters/contract"
import type { CanListStoredFeatures } from "../contracts/can-list-stored-features"
import type { CanSetManyFeaturesForScopes, FeatureUpdate } from "../contracts/can-set-many-features-for-scopes"
import type { Driver, FeatureScopes, FeatureValues, ScopedResolver } from "../contracts/driver"
import { serializeScope } from "../scope"

/**
 * A feature driver backed by any Architect store adapter.
 */
export default class StoreDriver implements Driver, CanListStoredFeatures, CanSetManyFeaturesForScopes {
    protected definitions = new Map<string, ScopedResolver>()
    protected pending = new Map<string, Promise<unknown>>()

    constructor(protected store: Adapter) {}

    define(feature: string, resolver: ScopedResolver): void {
        this.definitions.set(feature, resolver)
    }

    defined(): string[] {
        return [...this.definitions.keys()]
    }

    async stored(): Promise<string[]> {
        const keys = await this.featureKeys()
        return [...new Set(keys.map((key) => decodeURIComponent(key.slice(8, key.indexOf(":", 8)))))]
    }

    async getAll(features: FeatureScopes): Promise<FeatureValues> {
        return Object.fromEntries(
            await Promise.all(
                Object.entries(features).map(async ([feature, scopes]) => [
                    feature,
                    await Promise.all(scopes.map((scope) => this.get(feature, scope))),
                ]),
            ),
        )
    }

    get(feature: string, scope: unknown): Promise<unknown> {
        const key = this.key(feature, scope)
        let pending = this.pending.get(key)
        if (!pending) {
            pending = this.resolve(feature, scope, key)
            this.pending.set(key, pending)
            const forget = () => {
                if (this.pending.get(key) === pending) this.pending.delete(key)
            }
            void pending.then(forget, forget)
        }
        return pending
    }

    async set(feature: string, scope: unknown, value: unknown): Promise<void> {
        const key = this.key(feature, scope)
        await this.waitForResolution(key)
        await this.store.set(key, value)
    }

    async setAll(features: FeatureUpdate[]): Promise<void> {
        // Preserve input order when a batch updates the same feature and scope twice.
        for (const { feature, scope, value } of features) {
            await this.set(feature, scope, value)
        }
    }

    async setForAllScopes(feature: string, value: unknown): Promise<void> {
        const prefix = this.prefix(feature)
        await this.waitForResolutions([prefix])
        for (const key of await this.featureKeys()) {
            if (key.startsWith(prefix)) await this.store.set(key, value)
        }
    }

    async delete(feature: string, scope: unknown): Promise<void> {
        const key = this.key(feature, scope)
        await this.waitForResolution(key)
        await this.store.delete(key)
    }

    async purge(features: string[] | null): Promise<void> {
        const prefixes = features === null ? ["feature:"] : features.map((feature) => this.prefix(feature))
        await this.waitForResolutions(prefixes)
        for (const key of await this.featureKeys()) {
            if (prefixes.some((prefix) => key.startsWith(prefix))) await this.store.delete(key)
        }
    }

    protected async resolve(feature: string, scope: unknown, key: string): Promise<unknown> {
        if (await this.store.has(key)) return this.store.get(key)
        const resolver = this.definitions.get(feature)
        if (!resolver) return false
        const value = (await resolver(scope)) ?? false
        await this.store.set(key, value)
        return value
    }

    protected key(feature: string, scope: unknown): string {
        return this.prefix(feature) + serializeScope(scope)
    }

    protected prefix(feature: string): string {
        return `feature:${encodeURIComponent(feature)}:`
    }

    protected async featureKeys(): Promise<string[]> {
        return (await this.store.keys()).filter((key) => key.startsWith("feature:") && key.indexOf(":", 8) !== -1)
    }

    protected async waitForResolution(key: string): Promise<void> {
        await this.pending.get(key)?.catch(() => undefined)
    }

    protected async waitForResolutions(prefixes: string[]): Promise<void> {
        await Promise.all(
            [...this.pending.keys()]
                .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
                .map((key) => this.waitForResolution(key)),
        )
    }
}
