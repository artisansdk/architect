export default abstract class Feature<TScope = string> {
    /**
     * Resolve a feature's initial value for the given scope.
     */
    public abstract resolve(scope: TScope): unknown
}
