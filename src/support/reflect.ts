/**
 * Narrows a value to a zero-argument constructor.
 *
 * Reads the source text rather than checking for a `prototype`, so plain functions are excluded —
 * `use()` relies on that to reject callbacks. The tradeoff is that classes transpiled down to ES5
 * functions won't match.
 */
export function isClass(value: unknown): value is new () => unknown {
    return typeof value === "function" && /^class\s/.test(Function.prototype.toString.call(value))
}

/**
 * Narrows a value to one with a callable `method`, like PHP's `method_exists()`.
 */
export function methodExists<K extends string>(value: unknown, method: K): value is Record<K, () => unknown> {
    return typeof (value as Record<K, unknown> | null)?.[method] === "function"
}
