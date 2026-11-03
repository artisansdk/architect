export type FeatureScopes = Record<string, unknown[]>
export type FeatureValues = Record<string, unknown[]>
export type ScopedResolver = (scope: unknown) => unknown | Promise<unknown>

/**
 * Feature persistence and resolution contract.
 */
export interface Driver {
    define(feature: string, resolver: ScopedResolver): void
    defined(): string[]
    getAll(features: FeatureScopes): Promise<FeatureValues>
    get(feature: string, scope: unknown): Promise<unknown>
    set(feature: string, scope: unknown, value: unknown): Promise<void>
    setForAllScopes(feature: string, value: unknown): Promise<void>
    delete(feature: string, scope: unknown): Promise<void>
    purge(features: string[] | null): Promise<void>
}
