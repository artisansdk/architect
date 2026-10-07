import { detectRuntime } from "./runtimes"
import type { Runtime, RuntimeOptions } from "./runtimes/contract"

/**
 * The algorithm and cost parameters encoded in a hash, as reported by info().
 * Unrecognized formats report `{ algorithm: "unknown" }`.
 */
export type HashInfo = RuntimeOptions | { algorithm: "unknown" }

const ARGON = /^\$(argon2id|argon2i|argon2d)\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/
const BCRYPT = /^\$2[abxy]?\$(\d{2})\$/

/**
 * Base class for password hashing drivers. Subclasses decide how to hash and when a hash is stale;
 * verification and hash inspection are shared because every supported format is self-describing.
 */
export default abstract class AbstractHasher<TOptions extends Record<string, number> = Record<string, number>> {
    protected options: TOptions
    protected runtime: Runtime

    /**
     * Creates a hasher with its default cost options, delegating to the given runtime
     * or the fastest one detected for the current environment.
     */
    constructor(options: TOptions, runtime: Runtime = detectRuntime()) {
        this.options = options
        this.runtime = runtime
    }

    /**
     * Hashes a value with a fresh random salt; options override the configured costs for this call only.
     */
    abstract make(value: string, options?: Partial<TOptions>): Promise<string>

    /**
     * Determines whether a hash was made with a different algorithm or costs than this hasher's
     * (optionally overridden) options, and should be regenerated on next login.
     */
    abstract needsRehash(hash: string, options?: Partial<TOptions>): boolean

    /**
     * Verifies a plain value against any supported hash, regardless of which driver made it,
     * so legacy hashes keep working until needsRehash() flags them for upgrade.
     * Malformed or empty hashes return false rather than throwing.
     */
    async check(value: string, hash: string): Promise<boolean> {
        if (!hash) {
            return false
        }

        try {
            return await this.runtime.verify(value, hash)
        } catch {
            return false
        }
    }

    /**
     * Reads the algorithm and cost parameters encoded in a hash.
     */
    info(hash: string): HashInfo {
        const argon = ARGON.exec(hash)
        if (argon) {
            return {
                algorithm: argon[1] as "argon2i" | "argon2d" | "argon2id",
                memory: Number(argon[2]),
                iterations: Number(argon[3]),
                parallelism: Number(argon[4]),
            }
        }

        const bcrypt = BCRYPT.exec(hash)
        return bcrypt ? { algorithm: "bcrypt", rounds: Number(bcrypt[1]) } : { algorithm: "unknown" }
    }
}
