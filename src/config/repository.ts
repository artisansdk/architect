import type { Contract } from "./contract"

export type ConfigItems = Record<string, unknown>
export type Defaults = Record<string | number, unknown>

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function mergeItems(target: ConfigItems, source: ConfigItems): ConfigItems {
    for (const [key, value] of Object.entries(source)) {
        const existing = target[key]
        target[key] = isPlainObject(existing) && isPlainObject(value) ? mergeItems({ ...existing }, value) : value
    }

    return target
}

function resolveDefault<T>(defaultValue: T | (() => T)): T {
    return typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue
}

function dataGet(source: unknown, path: string, defaultValue: unknown = null): unknown {
    if (!path) {
        return source
    }

    const segments = path.split(".")
    let cursor: unknown = source

    for (const segment of segments) {
        if (!hasDataKey(cursor, segment)) {
            return resolveDefault(defaultValue)
        }

        cursor = cursor[segment]
    }

    return cursor
}

function hasDataKey(value: unknown, key: string): value is Record<string, unknown> {
    return isPlainObject(value) && key in value
}

function dataTraverse(
    target: Record<string, unknown>,
    path: string,
    onCreate: boolean,
): [Record<string, unknown>, string] | null {
    const segments = path.split(".")
    let cursor: Record<string, unknown> = target

    for (let i = 0; i < segments.length - 1; i += 1) {
        const segment = segments[i]

        if (!isPlainObject(cursor[segment])) {
            if (!onCreate) return null
            cursor[segment] = {}
        }

        cursor = cursor[segment] as Record<string, unknown>
    }

    return [cursor, segments[segments.length - 1]]
}

function dataSet(target: Record<string, unknown>, path: string, value: unknown): void {
    const result = dataTraverse(target, path, true)
    if (result) result[0][result[1]] = value
}

class ConfigRepository implements Contract {
    protected items: ConfigItems

    constructor(items: ConfigItems = {}) {
        this.items = items
    }

    has(key: string | string[]): boolean {
        const keys = Array.isArray(key) ? key : [key]
        for (const configKey of keys) {
            if (this.get(configKey) == null) {
                return false
            }
        }

        return true
    }

    get(key: string): unknown
    get<T>(key: string): T | null
    get<T>(key: string, defaultValue: T | (() => T)): T
    get<T>(key: string, defaultValue: T | (() => T) | null): T | null
    get(key: string[]): Record<string, unknown>
    get<T = unknown>(
        key: string | string[],
        defaultValue: T | (() => T) | null = null,
    ): T | Record<string, unknown> | null {
        if (Array.isArray(key)) {
            return this.getMany(key)
        }

        return dataGet(this.items, key, defaultValue) as T | null
    }

    getMany(keys: string[] | Defaults): Record<string, unknown> {
        const results: Record<string, unknown> = {}

        if (Array.isArray(keys)) {
            for (const key of keys) {
                results[key] = this.get(key)
            }

            return results
        }

        for (const [key, defaultValue] of Object.entries(keys)) {
            results[key] = this.get(key, defaultValue)
        }

        return results
    }

    set(key: string | ConfigItems, value: unknown = null): void {
        const payload = isPlainObject(key) ? key : { [key]: value }

        for (const [configKey, configValue] of Object.entries(payload)) {
            dataSet(this.items, configKey, configValue)
        }
    }

    prepend(key: string, value: unknown): void {
        const values = this.get<unknown[]>(key, [])
        this.set(key, [value, ...values])
    }

    push(key: string, value: unknown): void {
        const values = this.get<unknown[]>(key, [])
        values.push(value)
        this.set(key, values)
    }

    all(): ConfigItems {
        return this.items
    }
}

export { ConfigRepository }
export default ConfigRepository
