export default abstract class Feature<TScope = string> {
    /**
     * Resolve a feature's initial value for the given scope. Definitions pass the feature's name second.
     */
    public abstract resolve(scope: TScope, feature?: string): unknown
}
