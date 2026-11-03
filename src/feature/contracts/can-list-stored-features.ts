export interface CanListStoredFeatures {
    /**
     * Get the names of all stored features.
     */
    stored(): Promise<string[]>
}
