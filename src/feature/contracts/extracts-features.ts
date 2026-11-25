/**
 * Server features as a list of active names or a name → value map.
 */
export type FeatureList = string[] | Record<string, unknown>

/**
 * Normalize server features: a list of active names becomes `{ name: true }`.
 */
export function toFeatureValues(features: FeatureList): Record<string, unknown> {
    return Array.isArray(features) ? Object.fromEntries(features.map((name) => [name, true])) : features
}

/**
 * Maps a parsed response body to the server-owned features it carries.
 */
export interface ExtractsFeatures {
    /**
     * The features in the body, or `null` / `undefined` when the body carries none.
     */
    features(body: unknown): FeatureList | null | undefined

    /**
     * The scope the features belong to; `undefined` uses the default scope.
     * Implement it for login responses, which arrive before the app knows the user.
     */
    scope?(body: unknown): unknown
}
