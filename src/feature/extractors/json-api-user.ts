import type { ExtractsFeatures, FeatureList } from "../contracts/extracts-features"

type Body = { data?: { type?: unknown; attributes?: { features?: unknown } } } | null

/**
 * Reads `data.attributes.features` from a JSON:API resource of the given type (`"users"` by default).
 * Other resources are ignored, so a `features` attribute elsewhere never syncs.
 */
export default class JsonApiUserFeatures implements ExtractsFeatures {
    constructor(protected type = "users") {}

    features(body: unknown): FeatureList | null {
        const data = (body as Body)?.data
        if (data?.type !== this.type) return null
        const features = data.attributes?.features
        if (Array.isArray(features)) return features.filter((name): name is string => typeof name === "string")
        return features !== null && typeof features === "object" ? (features as Record<string, unknown>) : null
    }
}
