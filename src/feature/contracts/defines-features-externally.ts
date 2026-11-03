export interface DefinesFeaturesExternally {
    /**
     * Retrieve the feature names available to the given scope.
     */
    definedFeaturesForScope(scope: unknown): Promise<string[]>
}
