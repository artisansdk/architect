export interface FeatureScopeable {
    /**
     * Convert this object to the scope passed to the named driver and its resolvers.
     */
    toFeatureIdentifier(driver: string): unknown
}
