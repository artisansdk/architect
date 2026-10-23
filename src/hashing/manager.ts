import ConfigRepository from "../config/repository"
import Manager from "../support/manager"
import type AbstractHasher from "./abstract-hasher"
import type { HashInfo } from "./abstract-hasher"
import ArgonHasher, { type ArgonOptions } from "./argon-hasher"
import Argon2IdHasher from "./argon2id-hasher"
import BcryptHasher, { type BcryptOptions } from "./bcrypt-hasher"
import { detectRuntime } from "./runtimes"
import type { Runtime } from "./runtimes/contract"

/**
 * Resolves password hashing algorithms and forwards calls to the configured default. Algorithms
 * (`extend()`) decide the format and costs; runtimes (`use()`) execute them, so any algorithm runs
 * on any runtime. Built-in algorithms are created from the `hashing.*` config on first use.
 */
export default class HashManager extends Manager<AbstractHasher, AbstractHasher> {
    protected runtimes: Record<string, () => Runtime> = {}
    protected activeRuntime: string | undefined

    /**
     * Creates a manager whose default algorithm is `hashing.algo` (argon2id unless configured)
     * and whose runtime is `hashing.runtime` (detected unless configured).
     */
    constructor(config: ConfigRepository = new ConfigRepository({})) {
        super({}, "argon2id", config)
        this.active = config.get<string>("hashing.algo", "argon2id") ?? "argon2id"
        this.activeRuntime = config.get<string>("hashing.runtime") ?? undefined
    }

    /**
     * Resolves a hasher by algorithm name, defaulting to the configured algorithm.
     */
    algo(name: string = this.active): AbstractHasher {
        return this.resolve(name)
    }

    /**
     * Registers an algorithm; its factory receives the active runtime. Takes precedence over a
     * built-in algorithm of the same name.
     */
    extend(name: string, factory: (config: ConfigRepository, runtime: Runtime) => AbstractHasher): this {
        this.customCreators[name] = (config) => factory(config, this.resolveRuntime())
        return this
    }

    /**
     * Switches every algorithm to the named runtime, registering it first when a factory is given.
     */
    use(name: string, factory?: () => Runtime): this {
        if (factory) {
            this.runtimes[name] = factory
        }

        if (!(name in this.runtimes)) {
            throw new Error(`Hash runtime [${name}] is not defined.`)
        }

        this.activeRuntime = name
        this.drivers = {} // hashers hold their runtime, so rebuild them on next use
        return this
    }

    /**
     * Hashes a value with the default algorithm.
     */
    make(value: string, options?: Record<string, number>): Promise<string> {
        return this.algo().make(value, options)
    }

    /**
     * Verifies a value against a hash made by any supported algorithm.
     */
    check(value: string, hash: string): Promise<boolean> {
        return this.algo().check(value, hash)
    }

    /**
     * Determines whether a hash should be regenerated under the default algorithm's current config.
     */
    needsRehash(hash: string, options?: Record<string, number>): boolean {
        return this.algo().needsRehash(hash, options)
    }

    /**
     * Reads the algorithm and cost parameters encoded in a hash.
     */
    info(hash: string): HashInfo {
        return this.algo().info(hash)
    }

    /**
     * Creates the Argon2id hasher from `hashing.argon`.
     */
    protected createArgon2idHasher(): AbstractHasher {
        return new Argon2IdHasher(this.argonOptions(), this.resolveRuntime())
    }

    /**
     * Creates the Argon2i hasher from `hashing.argon`.
     */
    protected createArgonHasher(): AbstractHasher {
        return new ArgonHasher(this.argonOptions(), this.resolveRuntime())
    }

    /**
     * Creates the bcrypt hasher from `hashing.bcrypt`, defaulting to 12 rounds.
     */
    protected createBcryptHasher(): AbstractHasher {
        return new BcryptHasher(
            { rounds: 12, ...this.config.get<Partial<BcryptOptions>>("hashing.bcrypt", {}) },
            this.resolveRuntime(),
        )
    }

    /**
     * Merges `hashing.argon` over the defaults shared by both Argon2 algorithms.
     */
    protected argonOptions(): ArgonOptions {
        return {
            memory: 65536,
            iterations: 3,
            parallelism: 1,
            ...this.config.get<Partial<ArgonOptions>>("hashing.argon", {}),
        }
    }

    /**
     * Resolves the active runtime, or the detected one when none is selected.
     */
    protected resolveRuntime(): Runtime {
        const name = this.activeRuntime
        if (!name) {
            return detectRuntime()
        }

        const factory = this.runtimes[name]
        if (!factory) {
            throw new Error(`Hash runtime [${name}] is not defined.`)
        }

        return factory()
    }

    /**
     * Lazily creates built-in algorithms on first use; algorithms registered with extend() take precedence.
     */
    protected resolve(name: string): AbstractHasher {
        if (!(name in this.drivers) && !(name in this.customCreators)) {
            const create = {
                argon2id: () => this.createArgon2idHasher(),
                argon: () => this.createArgonHasher(),
                bcrypt: () => this.createBcryptHasher(),
            }[name]

            if (create) {
                this.drivers[name] = create()
            }
        }

        return super.resolve(name)
    }

    /**
     * Returns the driver as-is; no wrapping is needed for hashers.
     */
    protected createDriver(raw: AbstractHasher): AbstractHasher {
        return raw
    }

    /**
     * Returns the human-readable driver type label used in error messages.
     */
    protected driverType(): string {
        return "Hash algorithm"
    }
}
