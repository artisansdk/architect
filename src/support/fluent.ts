// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: Proxy in constructor handles runtime property access; interface merging is intentional for typed T["key"] access
export class Fluent<T extends Record<string, unknown> = Record<string, unknown>> {
    protected attributes: Record<string, unknown>

    constructor(attributes: T = {} as T) {
        this.attributes = { ...attributes }

        // biome-ignore lint/correctness/noConstructorReturn: Creating a proxy for magic methods: `get()`
        return new Proxy(this, {
            get(target, prop, receiver) {
                if (typeof prop === "string" && !(prop in target)) {
                    return target.attributes[prop]
                }
                return Reflect.get(target, prop, receiver)
            },
        }) as Fluent<T>
    }

    get(key: string): unknown
    get<V>(key: string): V | null
    get<V>(key: string, defaultValue: V): V
    get<V>(key: string, defaultValue: V | null): V | null
    get<V = unknown>(key: string, defaultValue?: V | null): unknown {
        const fallback = defaultValue !== undefined ? defaultValue : null
        const parts = key.split(".")
        let current: unknown = this.attributes
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== "object") return fallback
            current = (current as Record<string, unknown>)[part]
        }
        return current === undefined ? fallback : current
    }

    set(key: string, value: unknown): this {
        const parts = key.split(".")
        let current = this.attributes
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i]
            if (typeof current[part] !== "object" || current[part] === null) current[part] = {}
            current = current[part] as Record<string, unknown>
        }
        current[parts[parts.length - 1]] = value
        return this
    }

    has(key: string): boolean {
        return this.get(key) !== null
    }

    toArray(): T {
        return { ...this.attributes } as T
    }
}

// The declaration merge below gives callers typed access to `T`'s keys directly on a
// Fluent instance (the constructor Proxy handles it at runtime). TS rejects `extends T`
// for a bare type parameter because a caller could pick a `T` whose members clash with
// the class's own (`get`, `set`, `has`, ...); that trade-off is intentional and the
// class members win. The suppression keeps the package type-checking clean for consumers.
// @ts-expect-error - intentional interface/class merge over a generic parameter
export interface Fluent<T extends Record<string, unknown> = Record<string, unknown>> extends T {}
