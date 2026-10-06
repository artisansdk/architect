import { compareOp } from "./compare"
import { LazyCollection } from "./lazy-collection"

export class Collection<T> {
    protected items: T[]

    constructor(items: T[] = []) {
        this.items = [...items]
    }

    // ── Static constructors ────────────────────────────────────────────────────

    static make<T>(items?: T[] | null): Collection<T> {
        return new Collection(items ?? [])
    }

    static fromJson(json: string): Collection<unknown> {
        const parsed = JSON.parse(json)
        return new Collection(Array.isArray(parsed) ? parsed : [parsed])
    }

    static range(start: number, end: number): Collection<number> {
        const result: number[] = []
        for (let i = start; i <= end; i++) result.push(i)
        return new Collection(result)
    }

    static times<U>(count: number, callback: (n: number) => U): Collection<U> {
        const result: U[] = []
        for (let i = 1; i <= count; i++) result.push(callback(i))
        return new Collection(result)
    }

    static wrap<U>(value: U | U[] | Collection<U> | null | undefined): Collection<U> {
        if (value == null) return new Collection<U>()
        if (value instanceof Collection) return new Collection(value.all())
        if (Array.isArray(value)) return new Collection(value)
        return new Collection([value as U])
    }

    static unwrap<U>(value: U | U[] | Collection<U>): U[] | U {
        if (value instanceof Collection) return value.all()
        if (Array.isArray(value)) return value
        return value
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    all(): T[] {
        return [...this.items]
    }

    toArray(): T[] {
        return this.all()
    }

    lazy(): LazyCollection<T> {
        return LazyCollection.make(this.items)
    }

    count(): number {
        return this.items.length
    }

    isEmpty(): boolean {
        return this.items.length === 0
    }

    isNotEmpty(): boolean {
        return this.items.length > 0
    }

    first(callback?: (item: T, index: number) => boolean): T | null {
        if (!callback) return this.items[0] ?? null
        return this.items.find(callback) ?? null
    }

    last(callback?: (item: T, index: number) => boolean): T | null {
        if (!callback) return this.items[this.items.length - 1] ?? null
        return [...this.items].reverse().find((item, i) => callback(item, this.items.length - 1 - i)) ?? null
    }

    // ── Aliases ───────────────────────────────────────────────────────────────

    average(key?: keyof T | ((item: T) => number)): number {
        return this.avg(key)
    }

    avg(key?: keyof T | ((item: T) => number)): number {
        if (this.items.length === 0) return 0
        return this.sum(key) / this.items.length
    }

    some(callback: (item: T, index: number) => boolean): boolean {
        return this.items.some(callback)
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    after(item: T | ((item: T, index: number) => boolean), strict = false): T | null {
        const idx = this._findIndex(item, strict)
        if (idx === -1 || idx >= this.items.length - 1) return null
        return this.items[idx + 1] ?? null
    }

    before(item: T | ((item: T, index: number) => boolean), strict = false): T | null {
        const idx = this._findIndex(item, strict)
        if (idx <= 0) return null
        return this.items[idx - 1] ?? null
    }

    protected _findIndex(item: T | ((item: T, index: number) => boolean), strict = false): number {
        if (typeof item === "function") {
            return this.items.findIndex(item as (item: T, index: number) => boolean)
        }
        if (strict) {
            return this.items.indexOf(item)
        }
        // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality
        return this.items.findIndex((i) => i == item)
    }

    // ── Counting / stats ──────────────────────────────────────────────────────

    countBy(callback?: (item: T) => string | number): Record<string, number> {
        const result: Record<string, number> = {}
        for (const item of this.items) {
            const key = String(callback ? callback(item) : item)
            result[key] = (result[key] ?? 0) + 1
        }
        return result
    }

    sum(key?: keyof T | ((item: T) => number)): number {
        return this.items.reduce((s, i) => s + (this.extractValue(i, key) as number), 0)
    }

    min(key?: keyof T | ((item: T) => number)): T | null {
        if (this.items.length === 0) return null
        return this.items.reduce((min, i) =>
            (this.extractValue(i, key) as number) < (this.extractValue(min, key) as number) ? i : min,
        )
    }

    max(key?: keyof T | ((item: T) => number)): T | null {
        if (this.items.length === 0) return null
        return this.items.reduce((max, i) =>
            (this.extractValue(i, key) as number) > (this.extractValue(max, key) as number) ? i : max,
        )
    }

    median(key?: keyof T | ((item: T) => number)): number | null {
        if (this.items.length === 0) return null
        const vals = this.items.map((i) => this.extractValue(i, key) as number).sort((a, b) => a - b)
        const mid = Math.floor(vals.length / 2)
        return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid]
    }

    mode(key?: keyof T | ((item: T) => number)): T[] {
        if (this.items.length === 0) return []
        const freq = new Map<unknown, number>()
        for (const item of this.items) {
            const v = this.extractValue(item, key)
            freq.set(v, (freq.get(v) ?? 0) + 1)
        }
        const maxFreq = Math.max(...freq.values())
        const modalVals = new Set([...freq.entries()].filter(([, c]) => c === maxFreq).map(([v]) => v))
        return this.items.filter((item) => modalVals.has(this.extractValue(item, key)))
    }

    percentage(callback: (item: T) => boolean, precision = 2): number {
        if (this.items.length === 0) return 0
        const pct = (this.items.filter(callback).length / this.items.length) * 100
        return Math.round(pct * 10 ** precision) / 10 ** precision
    }

    // ── Searching ─────────────────────────────────────────────────────────────

    firstOrFail(callback?: (item: T, index: number) => boolean): T {
        const found = this.first(callback)
        if (found === null) throw new Error("Item not found.")
        return found
    }

    firstWhere(key: keyof T, operatorOrValue: unknown, value?: unknown): T | null {
        const [op, val] = value === undefined ? ["==", operatorOrValue] : [operatorOrValue as string, value]
        return (
            this.items.find((item) => {
                return this._compareOp(item[key], op as string, val)
            }) ?? null
        )
    }

    search(item: T | ((item: T, index: number) => boolean), strict = false): number | false {
        if (typeof item === "function") {
            const idx = this.items.findIndex(item as (item: T, index: number) => boolean)
            return idx === -1 ? false : idx
        }
        if (strict) {
            const idx = this.items.indexOf(item)
            return idx === -1 ? false : idx
        }
        // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality
        const idx = this.items.findIndex((i) => i == item)
        return idx === -1 ? false : idx
    }

    sole(callback?: (item: T, index: number) => boolean): T {
        const matches = callback ? this.items.filter(callback) : this.items
        if (matches.length === 0) throw new Error("No items match the given criteria.")
        if (matches.length > 1) throw new Error("Multiple items match the given criteria.")
        return matches[0]
    }

    value(key: keyof T): T[keyof T] | null {
        const first = this.first()
        if (first === null || first === undefined) return null
        return first[key]
    }

    // ── Transforming ──────────────────────────────────────────────────────────

    map<U>(callback: (item: T, index: number) => U): Collection<U> {
        return new Collection(this.items.map(callback))
    }

    filter(callback?: (item: T, index: number) => boolean): Collection<T> {
        return new Collection(
            callback ? this.items.filter(callback) : this.items.filter(Boolean as unknown as (item: T) => boolean),
        )
    }

    reject(callback: (item: T, index: number) => boolean): Collection<T> {
        return new Collection(this.items.filter((item, i) => !callback(item, i)))
    }

    reduce<U>(callback: (carry: U, item: T, index: number) => U, initial: U): U {
        return this.items.reduce(callback, initial)
    }

    each(callback: (item: T, index: number) => void): this {
        this.items.forEach(callback)
        return this
    }

    collect(): Collection<T> {
        return new Collection(this.items)
    }

    flatMap<U>(callback: (item: T, index: number) => U[]): Collection<U> {
        return new Collection(this.items.flatMap(callback))
    }

    mapSpread<U>(callback: (...args: unknown[]) => U): Collection<U> {
        return new Collection(this.items.map((item) => callback(...(item as unknown as unknown[]))))
    }

    mapToGroups<K extends string, V>(callback: (item: T, index: number) => [K, V]): Record<string, Collection<V>> {
        const result: Record<string, V[]> = {}
        this.items.forEach((item, i) => {
            const [k, v] = callback(item, i)
            if (!result[k]) result[k] = []
            result[k].push(v)
        })
        return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, new Collection(v as V[])]))
    }

    mapWithKeys<K extends string, V>(callback: (item: T, index: number) => [K, V]): Record<K, V> {
        const result = {} as Record<K, V>
        this.items.forEach((item, i) => {
            const [k, v] = callback(item, i)
            result[k] = v
        })
        return result
    }

    transform(callback: (item: T, index: number) => T): this {
        this.items = this.items.map(callback)
        return this
    }

    undot(): Collection<Record<string, unknown>> {
        return new Collection(
            (this.items as unknown as Record<string, unknown>[]).map((item) => {
                const result: Record<string, unknown> = {}
                for (const [dotKey, val] of Object.entries(item)) {
                    const parts = dotKey.split(".")
                    let cur = result
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") {
                            cur[parts[i]] = {}
                        }
                        cur = cur[parts[i]] as Record<string, unknown>
                    }
                    cur[parts[parts.length - 1]] = val
                }
                return result
            }),
        )
    }

    dot(): Collection<Record<string, unknown>> {
        const flattenObj = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
            const result: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}.${k}` : k
                if (v && typeof v === "object" && !Array.isArray(v)) {
                    Object.assign(result, flattenObj(v as Record<string, unknown>, newKey))
                } else {
                    result[newKey] = v
                }
            }
            return result
        }
        return new Collection((this.items as unknown as Record<string, unknown>[]).map((item) => flattenObj(item)))
    }

    // ── Set operations ────────────────────────────────────────────────────────

    diff(items: T[] | Collection<T>): Collection<T> {
        const other = items instanceof Collection ? items.all() : items
        return new Collection(this.items.filter((i) => !other.includes(i)))
    }

    intersect(items: T[] | Collection<T>): Collection<T> {
        const other = items instanceof Collection ? items.all() : items
        return new Collection(this.items.filter((i) => other.includes(i)))
    }

    union(items: T[] | Collection<T>): Collection<T> {
        const other = items instanceof Collection ? items.all() : items
        const result = [...this.items]
        for (let i = 0; i < other.length; i++) {
            if (i >= result.length) {
                result.push(other[i])
            }
        }
        return new Collection(result)
    }

    // ── Key/object operations ─────────────────────────────────────────────────

    pluck<K extends keyof T>(key: K): Collection<T[K]> {
        return new Collection(this.items.map((item) => item[key]))
    }

    contains(itemOrCallback: T | ((item: T) => boolean)): boolean {
        if (typeof itemOrCallback === "function") {
            return this.items.some(itemOrCallback as (item: T) => boolean)
        }
        return this.items.includes(itemOrCallback)
    }

    unique(key?: keyof T | ((item: T) => unknown)): Collection<T> {
        const seen = new Set<unknown>()
        return new Collection(
            this.items.filter((item) => {
                const val = this.extractValue(item, key)
                if (seen.has(val)) return false
                seen.add(val)
                return true
            }),
        )
    }

    except(keys: string[]): Collection<Partial<T>> {
        return new Collection(
            this.items.map((item) => {
                const result = { ...(item as object) } as Partial<T>
                for (const k of keys) {
                    delete (result as Record<string, unknown>)[k]
                }
                return result
            }),
        )
    }

    only(keys: Array<keyof T>): Collection<Partial<T>> {
        return new Collection(
            this.items.map((item) => {
                const result: Partial<T> = {}
                for (const k of keys) {
                    result[k] = item[k]
                }
                return result
            }),
        )
    }

    select(keys: Array<keyof T>): Collection<Partial<T>> {
        return this.only(keys)
    }

    forget(index: number): this {
        this.items.splice(index, 1)
        return this
    }

    pull(index: number): T | null {
        if (index < 0 || index >= this.items.length) return null
        return this.items.splice(index, 1)[0] ?? null
    }

    put(index: number, value: T): this {
        this.items[index] = value
        return this
    }

    keyBy(key: keyof T | ((item: T, index: number) => string)): Record<string, T> {
        const result: Record<string, T> = {}
        this.items.forEach((item, i) => {
            const k = typeof key === "function" ? key(item, i) : String(item[key])
            result[k] = item
        })
        return result
    }

    // ── Stack/queue ───────────────────────────────────────────────────────────

    pop(count?: number): T | Collection<T> | null {
        if (count !== undefined) {
            const removed = this.items.splice(this.items.length - count, count)
            return new Collection(removed)
        }
        return this.items.pop() ?? null
    }

    shift(count?: number): T | Collection<T> | null {
        if (count !== undefined) {
            const removed = this.items.splice(0, count)
            return new Collection(removed)
        }
        return this.items.shift() ?? null
    }

    splice(offset: number, length?: number, replacement: T[] = []): Collection<T> {
        const removed =
            length !== undefined
                ? this.items.splice(offset, length, ...replacement)
                : this.items.splice(offset, this.items.length, ...replacement)
        return new Collection(removed)
    }

    push(...items: T[]): this {
        this.items.push(...items)
        return this
    }

    prepend(...items: T[]): this {
        this.items.unshift(...items)
        return this
    }

    // ── Pagination / windowing ────────────────────────────────────────────────

    forPage(page: number, perPage: number): Collection<T> {
        return new Collection(this.items.slice((page - 1) * perPage, page * perPage))
    }

    nth(n: number, offset = 0): Collection<T> {
        const result: T[] = []
        for (let i = offset; i < this.items.length; i += n) {
            result.push(this.items[i])
        }
        return new Collection(result)
    }

    pad(size: number, value: T): Collection<T> {
        const abs = Math.abs(size)
        if (abs <= this.items.length) return new Collection(this.items)
        const padding = Array(abs - this.items.length).fill(value) as T[]
        return size < 0 ? new Collection([...padding, ...this.items]) : new Collection([...this.items, ...padding])
    }

    slice(offset: number, length?: number): Collection<T> {
        const start = offset
        const end = length !== undefined ? offset + length : undefined
        return new Collection(this.items.slice(start, end))
    }

    sliding(size: number, step = 1): Collection<Collection<T>> {
        const result: Collection<T>[] = []
        for (let i = 0; i + size <= this.items.length; i += step) {
            result.push(new Collection(this.items.slice(i, i + size)))
        }
        return new Collection(result)
    }

    split(groups: number): Collection<Collection<T>> {
        if (groups <= 0) return new Collection()
        const size = Math.ceil(this.items.length / groups)
        const result: Collection<T>[] = []
        for (let i = 0; i < this.items.length; i += size) {
            result.push(new Collection(this.items.slice(i, i + size)))
        }
        while (result.length < groups) result.push(new Collection())
        return new Collection(result)
    }

    splitIn(groups: number): Collection<Collection<T>> {
        if (groups <= 0) return new Collection()
        const size = Math.ceil(this.items.length / groups)
        const result: Collection<T>[] = []
        for (let i = 0; i < groups; i++) {
            result.push(new Collection(this.items.slice(i * size, (i + 1) * size)))
        }
        return new Collection(result)
    }

    // ── Conditional / tap ─────────────────────────────────────────────────────

    pipe<U>(callback: (collection: Collection<T>) => U): U {
        return callback(this)
    }

    pipeInto<U>(ctor: new (c: Collection<T>) => U): U {
        return new ctor(this)
    }

    pipeThrough(pipes: Array<(c: Collection<T>) => Collection<T>>): Collection<T> {
        return pipes.reduce((c, fn) => fn(c), this as Collection<T>)
    }

    tap(callback: (collection: this) => void): this {
        callback(this)
        return this
    }

    when(condition: boolean, callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        if (condition) callback(this)
        else if (fallback) fallback(this)
        return this
    }

    unless(condition: boolean, callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        return this.when(!condition, callback, fallback)
    }

    whenEmpty(callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        return this.when(this.isEmpty(), callback, fallback)
    }

    whenNotEmpty(callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        return this.when(this.isNotEmpty(), callback, fallback)
    }

    unlessEmpty(callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        return this.whenNotEmpty(callback, fallback)
    }

    unlessNotEmpty(callback: (c: this) => unknown, fallback?: (c: this) => unknown): this {
        return this.whenEmpty(callback, fallback)
    }

    // ── Chunking / grouping ───────────────────────────────────────────────────

    sortBy(key: keyof T | ((item: T) => unknown), direction: "asc" | "desc" = "asc"): Collection<T> {
        return new Collection(
            [...this.items].sort((a, b) => {
                const av = this.extractValue(a, key) as string | number
                const bv = this.extractValue(b, key) as string | number
                if (av < bv) return direction === "asc" ? -1 : 1
                if (av > bv) return direction === "asc" ? 1 : -1
                return 0
            }),
        )
    }

    groupBy<K extends string | number>(key: keyof T | ((item: T) => K)): Record<string, Collection<T>> {
        const groups: Record<string, T[]> = {}
        for (const item of this.items) {
            const k = String(this.extractValue(item, key))
            if (!groups[k]) groups[k] = []
            groups[k].push(item)
        }
        return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, new Collection(v)]))
    }

    chunk(size: number): Collection<Collection<T>> {
        const chunks: Collection<T>[] = []
        for (let i = 0; i < this.items.length; i += size) {
            chunks.push(new Collection(this.items.slice(i, i + size)))
        }
        return new Collection(chunks)
    }

    chunkWhile(callback: (current: T, index: number, chunk: Collection<T>) => boolean): Collection<Collection<T>> {
        if (this.items.length === 0) return new Collection()
        const result: Collection<T>[] = []
        let currentChunk: T[] = [this.items[0]]
        for (let i = 1; i < this.items.length; i++) {
            if (callback(this.items[i], i, new Collection(currentChunk))) {
                currentChunk.push(this.items[i])
            } else {
                result.push(new Collection(currentChunk))
                currentChunk = [this.items[i]]
            }
        }
        result.push(new Collection(currentChunk))
        return new Collection(result)
    }

    crossJoin<U>(...arrays: U[][]): Collection<unknown[]> {
        let result: unknown[][] = [[]]
        const allArrays: unknown[][] = [this.items as unknown[], ...arrays.map((a) => a as unknown[])]
        for (const arr of allArrays) {
            const newResult: unknown[][] = []
            for (const existing of result) {
                for (const item of arr) {
                    newResult.push([...existing, item])
                }
            }
            result = newResult
        }
        return new Collection(result)
    }

    eachSpread(callback: (...args: unknown[]) => unknown): this {
        for (const item of this.items) {
            callback(...(item as unknown as unknown[]))
        }
        return this
    }

    duplicates(key?: keyof T | ((item: T) => unknown)): Collection<T> {
        const seen = new Set<unknown>()
        const result: T[] = []
        for (const item of this.items) {
            const v = this.extractValue(item, key)
            if (seen.has(v)) {
                result.push(item)
            } else {
                seen.add(v)
            }
        }
        return new Collection(result)
    }

    multiply(times: number): Collection<T> {
        let result: T[] = []
        for (let i = 0; i < times; i++) result = [...result, ...this.items]
        return new Collection(result)
    }

    zip<U>(...arrays: U[][]): Collection<unknown[]> {
        const maxLen = Math.max(this.items.length, ...arrays.map((a) => a.length))
        const result: unknown[][] = []
        for (let i = 0; i < maxLen; i++) {
            result.push([this.items[i] as unknown, ...arrays.map((a) => a[i] as unknown)])
        }
        return new Collection(result)
    }

    // ── Sorting ───────────────────────────────────────────────────────────────

    sort(callback?: (a: T, b: T) => number): Collection<T> {
        return new Collection([...this.items].sort(callback))
    }

    sortByDesc(key: keyof T | ((item: T) => unknown)): Collection<T> {
        return this.sortBy(key, "desc")
    }

    sortDesc(): Collection<T> {
        return new Collection(
            [...this.items].sort((a, b) => {
                if (a > b) return -1
                if (a < b) return 1
                return 0
            }),
        )
    }

    sortKeys(): Collection<T> {
        return this.values()
    }

    reverse(): Collection<T> {
        return new Collection([...this.items].reverse())
    }

    // ── Stringification ───────────────────────────────────────────────────────

    implode(keyOrGlue: keyof T | string, glue?: string): string {
        if (glue !== undefined) {
            return this.items.map((i) => i[keyOrGlue as keyof T]).join(glue)
        }
        return this.items.join(keyOrGlue as string)
    }

    join(glue: string, finalGlue?: string): string {
        if (!finalGlue || this.items.length <= 1) return this.items.join(glue)
        const all = this.items.map(String)
        const last = all.pop() as string
        return all.join(glue) + finalGlue + last
    }

    toJson(pretty?: boolean): string {
        return JSON.stringify(this.items, null, pretty ? 2 : undefined)
    }

    toPrettyJson(): string {
        return JSON.stringify(this.items, null, 2)
    }

    // ── Filtering ─────────────────────────────────────────────────────────────

    doesntContain(itemOrCallback: T | ((item: T, index: number) => boolean)): boolean {
        return !this.contains(itemOrCallback as T | ((item: T) => boolean))
    }

    every(callback: (item: T, index: number) => boolean): boolean {
        return this.items.every(callback)
    }

    skipUntil(valueOrCallback: T | ((item: T, index: number) => boolean)): Collection<T> {
        let found = false
        return new Collection(
            this.items.filter((item, i) => {
                if (!found) {
                    const match =
                        typeof valueOrCallback === "function"
                            ? (valueOrCallback as (item: T, index: number) => boolean)(item, i)
                            : item === valueOrCallback
                    if (match) found = true
                    return found
                }
                return true
            }),
        )
    }

    skipWhile(callback: (item: T, index: number) => boolean): Collection<T> {
        let skipping = true
        return new Collection(
            this.items.filter((item, i) => {
                if (skipping && callback(item, i)) return false
                skipping = false
                return true
            }),
        )
    }

    takeUntil(valueOrCallback: T | ((item: T, index: number) => boolean)): Collection<T> {
        const result: T[] = []
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i]
            const match =
                typeof valueOrCallback === "function"
                    ? (valueOrCallback as (item: T, index: number) => boolean)(item, i)
                    : item === valueOrCallback
            if (match) break
            result.push(item)
        }
        return new Collection(result)
    }

    takeWhile(callback: (item: T, index: number) => boolean): Collection<T> {
        const result: T[] = []
        for (let i = 0; i < this.items.length; i++) {
            if (!callback(this.items[i], i)) break
            result.push(this.items[i])
        }
        return new Collection(result)
    }

    flatten(depth = Infinity): Collection<unknown> {
        return new Collection(this.items.flat(depth) as unknown[])
    }

    take(count: number): Collection<T> {
        return new Collection(count >= 0 ? this.items.slice(0, count) : this.items.slice(count))
    }

    skip(count: number): Collection<T> {
        return new Collection(this.items.slice(count))
    }

    concat(other: T[] | Collection<T>): Collection<T> {
        const otherItems = other instanceof Collection ? other.all() : other
        return new Collection([...this.items, ...otherItems])
    }

    values(): Collection<T> {
        return new Collection([...this.items])
    }

    // ── where-family ──────────────────────────────────────────────────────────

    where(key: keyof T, operatorOrValue: unknown, value?: unknown): Collection<T> {
        const [op, val] = value === undefined ? ["==", operatorOrValue] : [operatorOrValue as string, value]
        return new Collection(this.items.filter((item) => this._compareOp(item[key], op as string, val)))
    }

    whereStrict(key: keyof T, value: unknown): Collection<T> {
        return new Collection(this.items.filter((item) => item[key] === value))
    }

    whereBetween(key: keyof T, range: [unknown, unknown]): Collection<T> {
        const [min, max] = range
        return new Collection(
            this.items.filter((item) => {
                const v = item[key] as never
                return v >= (min as never) && v <= (max as never)
            }),
        )
    }

    whereNotBetween(key: keyof T, range: [unknown, unknown]): Collection<T> {
        const [min, max] = range
        return this.reject((item) => {
            const v = item[key] as never
            return v >= (min as never) && v <= (max as never)
        })
    }

    whereIn(key: keyof T, values: unknown[]): Collection<T> {
        // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality
        return new Collection(this.items.filter((item) => values.some((v) => item[key] == v)))
    }

    whereInStrict(key: keyof T, values: unknown[]): Collection<T> {
        return new Collection(this.items.filter((item) => values.includes(item[key] as unknown)))
    }

    whereNotIn(key: keyof T, values: unknown[]): Collection<T> {
        // biome-ignore lint/suspicious/noDoubleEquals: intentional loose equality
        return new Collection(this.items.filter((item) => !values.some((v) => item[key] == v)))
    }

    whereNotInStrict(key: keyof T, values: unknown[]): Collection<T> {
        return new Collection(this.items.filter((item) => !values.includes(item[key] as unknown)))
    }

    whereNull(key: keyof T): Collection<T> {
        return new Collection(this.items.filter((item) => item[key] == null))
    }

    whereNotNull(key: keyof T): Collection<T> {
        return new Collection(this.items.filter((item) => item[key] != null))
    }

    whereInstanceOf<U>(ctor: new (...args: unknown[]) => U): Collection<U> {
        return new Collection(this.items.filter((item) => item instanceof ctor) as unknown as U[])
    }

    // ── Merge/replace ─────────────────────────────────────────────────────────

    merge(items: T[] | Collection<T>): Collection<T> {
        const other = items instanceof Collection ? items.all() : items
        return new Collection([...this.items, ...other])
    }

    replace(items: T[] | Collection<T>): Collection<T> {
        const other = items instanceof Collection ? items.all() : items
        const result = [...this.items]
        for (let i = 0; i < other.length; i++) {
            result[i] = other[i]
        }
        return new Collection(result)
    }

    // ── protected helpers ───────────────────────────────────────────────────────

    protected extractValue(item: T, key?: keyof T | ((item: T) => unknown)): unknown {
        if (!key) return item
        return typeof key === "function" ? key(item) : item[key]
    }

    protected _compareOp(itemVal: unknown, op: string, val: unknown): boolean {
        return compareOp(itemVal, op, val)
    }
}
