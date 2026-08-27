import { getVersion, proxy } from "valtio/vanilla"
import type { BindTo, Class, Concrete, Container as Contract, Factory, Identifier } from "../contract"

const INJECT_TOKENS_METADATA_KEY = "ioc:inject.tokens"

type Scope = "singleton" | "transient"

type BindingRecord<T = unknown> =
    | {
          kind: "constant"
          value: T
          transformed?: T
      }
    | {
          kind: "class"
          concrete: Class<T>
          scope: Scope
          cached?: T
      }
    | {
          kind: "factory"
          concrete: Factory<T>
          scope: Scope
          cached?: T
      }

type MetadataReflect = typeof Reflect & {
    defineMetadata?: (key: string, value: unknown, target: object) => void
    getMetadata?: (key: string, target: object) => unknown
}

const metadataReflect = Reflect as MetadataReflect

function isClassConcrete<T>(value: Concrete<T>): value is Class<T> {
    return typeof value === "function" && Object.hasOwn(value, "prototype")
}

function isFactoryConcrete<T>(value: Concrete<T>): value is Factory<T> {
    return typeof value === "function" && !isClassConcrete(value)
}

function readInjectTokens(target: object): Map<number, Identifier> {
    const metadata = metadataReflect.getMetadata?.(INJECT_TOKENS_METADATA_KEY, target) as
        | Record<number, Identifier>
        | undefined

    const tokens = new Map<number, Identifier>()
    if (!metadata) {
        return tokens
    }

    for (const [index, identifier] of Object.entries(metadata)) {
        tokens.set(Number(index), identifier)
    }

    return tokens
}

function readConstructorParamTypes(target: object): Array<Identifier | undefined> {
    return (
        (metadataReflect.getMetadata?.("design:paramtypes", target) as Array<Identifier | undefined> | undefined) ?? []
    )
}

class BuiltinBindingFluent<T> {
    protected record: BindingRecord<T> | null = null

    constructor(
        protected readonly container: BuiltinContainer,
        protected readonly identifier: Identifier<T>,
    ) {}

    to(concrete: Concrete<T>): {
        inSingletonScope: () => void
        inTransientScope: () => void
    } {
        if (isClassConcrete(concrete)) {
            this.record = { kind: "class", concrete, scope: "singleton" }
        } else if (isFactoryConcrete(concrete)) {
            this.record = { kind: "factory", concrete, scope: "singleton" }
        } else {
            this.record = { kind: "constant", value: concrete as T }
        }

        this.container.setRecord(this.identifier, this.record)

        return {
            inSingletonScope: () => {
                if (this.record && this.record.kind !== "constant") {
                    this.record.scope = "singleton"
                }
            },
            inTransientScope: () => {
                if (this.record && this.record.kind !== "constant") {
                    this.record.scope = "transient"
                    delete this.record.cached
                }
            },
        }
    }

    toConstantValue(value: T): void {
        this.record = { kind: "constant", value }
        this.container.setRecord(this.identifier, this.record)
    }
}

export function inject(identifier: Identifier): ParameterDecorator {
    return (target, _propertyKey, parameterIndex) => {
        const existing =
            (metadataReflect.getMetadata?.(INJECT_TOKENS_METADATA_KEY, target) as
                | Record<number, Identifier>
                | undefined) ?? {}
        existing[parameterIndex] = identifier
        metadataReflect.defineMetadata?.(INJECT_TOKENS_METADATA_KEY, existing, target)
    }
}

export default class BuiltinContainer implements Contract {
    protected bindings = new Map<Identifier, BindingRecord>()
    protected resolving = new Set<Identifier>()
    protected identifierTags = new Map<Identifier, Set<string>>()
    protected tagIndex = new Map<string, Set<Identifier>>()
    protected tagTransforms = new Map<string, (value: unknown, container: Contract) => unknown>()

    bind<T>(identifier: Identifier<T>): BindTo<T>
    bind<T>(identifier: Identifier<T>, concrete: Concrete<T>): this
    bind<T>(identifier: Identifier<T>, concrete?: Concrete<T>): BindTo<T> | this {
        if (typeof concrete !== "undefined") {
            this.removeIfBound(identifier)

            if (isClassConcrete(concrete)) {
                if (identifier !== concrete) {
                    this.bindings.set(identifier, {
                        kind: "factory",
                        concrete: (c) => c.make(concrete) as T,
                        scope: "transient",
                    })
                } else {
                    this.bindings.set(identifier, {
                        kind: "class",
                        concrete,
                        scope: "transient",
                    })
                }
                return this
            }

            if (isFactoryConcrete(concrete)) {
                this.bindings.set(identifier, {
                    kind: "factory",
                    concrete,
                    scope: "transient",
                })
                return this
            }

            this.bindings.set(identifier, {
                kind: "factory",
                concrete: () => concrete as T,
                scope: "transient",
            })
            return this
        }

        if (this.bindings.has(identifier)) {
            throw new Error(`Cannot bind [${String(identifier)}] because it is already bound.`)
        }

        return new BuiltinBindingFluent<T>(this, identifier)
    }

    singleton<T>(identifier: Identifier<T>, concrete: Concrete<T>): this {
        this.removeIfBound(identifier)

        if (isClassConcrete(concrete)) {
            this.bindings.set(identifier, {
                kind: "class",
                concrete,
                scope: "singleton",
            })
            return this
        }

        if (isFactoryConcrete(concrete)) {
            this.bindings.set(identifier, {
                kind: "factory",
                concrete,
                scope: "singleton",
            })
            return this
        }

        this.bindings.set(identifier, {
            kind: "constant",
            value: concrete as T,
        })
        return this
    }

    reactive<T extends object>(identifier: Identifier<T>, concrete: Concrete<T>): this {
        this.removeIfBound(identifier)

        const resolve: Factory<T> = isClassConcrete(concrete)
            ? identifier === concrete
                ? () => this.resolveClass(concrete)
                : (c) => c.make(concrete) as T
            : isFactoryConcrete(concrete)
              ? concrete
              : () => concrete as T

        this.bindings.set(identifier, {
            kind: "factory",
            concrete: (c) => {
                const value = resolve(c) as object
                return (getVersion(value) !== undefined ? value : proxy(value)) as T
            },
            scope: "singleton",
        })
        this.tag(identifier, "reactive")
        return this
    }

    instance<T>(identifier: Identifier<T>, value: T): this {
        this.removeIfBound(identifier)
        this.bindings.set(identifier, { kind: "constant", value })
        return this
    }

    alias<T>(alias: Identifier<T>, target: Identifier<T>): this {
        this.removeIfBound(alias)
        this.bindings.set(alias, {
            kind: "factory",
            concrete: (c) => c.make(target) as T,
            scope: "transient",
        })
        return this
    }

    make<T>(identifier: Identifier<T>): T {
        const record = this.bindings.get(identifier)
        if (record) {
            return this.resolveRecord(record, identifier) as T
        }

        if (typeof identifier === "function") {
            return this.resolveClass(identifier as Class<T>)
        }

        throw new Error(`Container binding [${String(identifier)}] is not registered.`)
    }

    get<T>(identifier: Identifier<T>): T
    get<T extends readonly Identifier[]>(
        identifiers: [...T],
    ): { [K in keyof T]: T[K] extends Identifier<infer U> ? U : never }
    get<T>(identifier: Identifier<T> | Identifier[]): unknown {
        if (Array.isArray(identifier)) {
            return identifier.map((id) => this.make(id))
        }

        const taggedIds =
            typeof identifier === "string" && !this.bindings.has(identifier) ? this.tagIndex.get(identifier) : undefined
        if (taggedIds) {
            const group: Record<string, unknown> = {}
            for (const id of taggedIds) {
                group[String(id)] = this.make(id)
            }
            return group
        }

        return this.make(identifier)
    }

    bound(identifier: Identifier): boolean {
        return this.bindings.has(identifier)
    }

    has(identifier: Identifier): boolean {
        return this.bound(identifier)
    }

    tag(identifiers: Identifier | Identifier[], ...tags: string[]): this {
        const ids = Array.isArray(identifiers) ? identifiers : [identifiers]

        for (const id of ids) {
            const existing = this.identifierTags.get(id) ?? new Set<string>()
            for (const tag of tags) {
                existing.add(tag)

                const group = this.tagIndex.get(tag) ?? new Set<Identifier>()
                group.add(id)
                this.tagIndex.set(tag, group)
            }
            this.identifierTags.set(id, existing)
        }

        return this
    }

    tagged(identifier: Identifier): readonly string[] {
        return [...(this.identifierTags.get(identifier) ?? [])]
    }

    extendTag<T>(tag: string, transform: (value: T, container: Contract) => T): this {
        this.tagTransforms.set(tag, transform as (value: unknown, container: Contract) => unknown)
        return this
    }

    unbind(identifier: Identifier): void {
        this.bindings.delete(identifier)
        this.untagIdentifier(identifier)
    }

    unbindAll(): void {
        this.bindings.clear()
        this.resolving.clear()
        this.identifierTags.clear()
        this.tagIndex.clear()
    }

    flush(): void {
        this.unbindAll()
    }

    getRawContainer(): unknown {
        return this.bindings
    }

    setRecord<T>(identifier: Identifier<T>, record: BindingRecord<T>): void {
        this.bindings.set(identifier, record as BindingRecord)
    }

    protected removeIfBound(identifier: Identifier): void {
        this.bindings.delete(identifier)
    }

    protected untagIdentifier(identifier: Identifier): void {
        const tags = this.identifierTags.get(identifier)
        if (!tags) {
            return
        }

        for (const tag of tags) {
            this.tagIndex.get(tag)?.delete(identifier)
        }
        this.identifierTags.delete(identifier)
    }

    protected applyTagTransforms<T>(tags: Set<string> | undefined, value: T): T {
        if (!tags?.size) {
            return value
        }

        let result = value
        for (const tag of tags) {
            const transform = this.tagTransforms.get(tag)
            if (transform) {
                result = transform(result, this) as T
            }
        }
        return result
    }

    protected resolveRecord<T>(record: BindingRecord<T>, identifier: Identifier): T {
        if (record.kind === "constant") {
            const tags = this.identifierTags.get(identifier)
            if (tags?.size) {
                record.transformed ??= this.applyTagTransforms(tags, record.value)
                return record.transformed
            }
            return record.value
        }

        if (this.hasCachedSingleton(record)) {
            return record.cached
        }

        const resolved = this.resolveConcrete(record)
        const value = this.applyTagTransforms(this.identifierTags.get(identifier), resolved)

        if (record.scope === "singleton") {
            record.cached = value
        }

        return value
    }

    protected resolveConcrete<T>(record: Exclude<BindingRecord<T>, { kind: "constant" }>): T {
        if (record.kind === "class") {
            return this.resolveClass(record.concrete)
        }

        return record.concrete(this)
    }

    protected hasCachedSingleton<T>(record: BindingRecord<T>): record is BindingRecord<T> & { cached: T } {
        return (
            record.kind !== "constant" &&
            record.scope === "singleton" &&
            "cached" in record &&
            typeof record.cached !== "undefined"
        )
    }

    protected resolveClass<T>(concrete: Class<T>): T {
        this.assertNotResolving(concrete)
        this.resolving.add(concrete)

        try {
            const paramTypes = readConstructorParamTypes(concrete)
            const injectTokens = readInjectTokens(concrete)
            const args = paramTypes.map((designType, index) =>
                this.resolveParameter(concrete, injectTokens, designType, index),
            )

            return new concrete(...args)
        } finally {
            this.resolving.delete(concrete)
        }
    }

    protected assertNotResolving(concrete: Class<unknown>): void {
        if (this.resolving.has(concrete)) {
            throw new Error(`Circular dependency detected while resolving [${concrete.name || "anonymous"}].`)
        }
    }

    protected resolveParameter(
        concrete: Class<unknown>,
        injectTokens: Map<number, Identifier>,
        designType: Identifier | undefined,
        index: number,
    ): unknown {
        const token = injectTokens.get(index) ?? designType
        if (!token) {
            throw new Error(`Cannot resolve parameter #${index} for [${concrete.name || "anonymous"}].`)
        }

        return this.make(token)
    }
}
