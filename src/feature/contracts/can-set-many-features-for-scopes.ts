export interface FeatureUpdate {
    feature: string
    scope: unknown
    value: unknown
}

export interface CanSetManyFeaturesForScopes {
    /**
     * Set multiple feature values for their respective scopes.
     */
    setAll(features: FeatureUpdate[]): Promise<void>
}
