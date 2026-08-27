export type Factory<T> = (container: Container) => T
export type Class<T> = new (...args: any[]) => T
export type Identifier<T = unknown> = string | symbol | Class<T>
export type Concrete<T> = Class<T> | Factory<T> | T

export interface Scope {
    /** Set singleton scope for this binding. */
    inSingletonScope(): void
    /** Set transient scope for this binding. */
    inTransientScope(): void
}

export interface BindTo<T> {
    /** Bind an identifier to a class, factory, or value concrete. */
    to(concrete: Concrete<T>): Scope
    /** Bind an identifier to a constant shared value. */
    toConstantValue(value: T): void
}

export interface Container {
    /** Register a singleton binding using a class, factory, or value concrete. */
    singleton<T>(identifier: Identifier<T>, concrete: Concrete<T>): this
    /** Register a binding using a class, factory, or value concrete. */
    bind<T>(identifier: Identifier<T>, concrete: Concrete<T>): this
    /** Register an existing instance as a shared binding. */
    instance<T>(identifier: Identifier<T>, value: T): this
    /** Point an identifier at another identifier; resolving the alias resolves the target. */
    alias<T>(alias: Identifier<T>, target: Identifier<T>): this
    /** Resolve an instance from the container. */
    make<T>(identifier: Identifier<T>): T
    /** Compatibility alias for make(). */
    get<T>(identifier: Identifier<T>): T
    /** Resolve multiple identifiers at once; class keys infer their instance type, string/symbol keys resolve to unknown. */
    get<T extends readonly Identifier[]>(
        identifiers: [...T],
    ): { [K in keyof T]: T[K] extends Identifier<infer U> ? U : never }
    /** Determine if an identifier is currently bound. */
    bound(identifier: Identifier): boolean
    /** Alias for bound(). */
    has(identifier: Identifier): boolean
    /**
     * Register a singleton whose resolved value is guaranteed to be a Valtio proxy — the
     * intentional way to opt a binding into reactive state. Also tags the identifier "reactive"
     * so consumers (e.g. the React runtime's `useService`) can detect it without re-checking types.
     */
    reactive<T extends object>(identifier: Identifier<T>, concrete: Concrete<T>): this
    /** Attach one or more tags to one or more identifiers, independent of binding order. */
    tag(identifiers: Identifier | Identifier[], ...tags: string[]): this
    /** List the tags attached to an identifier. */
    tagged(identifier: Identifier): readonly string[]
    /** Register a transform applied to a tagged binding's resolved value, once, before it is cached/returned. */
    extendTag<T>(tag: string, transform: (value: T, container: Container) => T): this
    /** Remove a specific binding by identifier. */
    unbind(identifier: Identifier): void
    /** Remove all bindings from the container. */
    unbindAll(): void
    /** Clear all bindings. */
    flush(): void
    /** Expose the underlying container for advanced use. */
    getRawContainer(): unknown
}
