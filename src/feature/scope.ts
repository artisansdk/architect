import type { FeatureScopeSerializable } from "./contracts/feature-scope-serializable"
import type { FeatureScopeable } from "./contracts/feature-scopeable"

export function resolveScope(scope: unknown, driver: string): unknown {
    if (
        scope !== null &&
        typeof scope === "object" &&
        "toFeatureIdentifier" in scope &&
        typeof scope.toFeatureIdentifier === "function"
    ) {
        return (scope as FeatureScopeable).toFeatureIdentifier(driver)
    }
    return scope
}

export function serializeScope(scope: unknown): string {
    if (
        scope !== null &&
        typeof scope === "object" &&
        "featureScopeSerialize" in scope &&
        typeof scope.featureScopeSerialize === "function"
    ) {
        const serialized = (scope as FeatureScopeSerializable).featureScopeSerialize()
        if (typeof serialized === "string") return serialized
    }
    if (scope === null) return "__architect_null"
    if (typeof scope === "string" || (typeof scope === "number" && Number.isFinite(scope))) {
        return String(scope)
    }
    throw new TypeError("Unable to serialize the feature scope. Implement FeatureScopeSerializeable.")
}
