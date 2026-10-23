import AbstractHasher from "./abstract-hasher"

/**
 * Argon2 costs: memory in KiB, iterations (time cost), and parallelism (lanes).
 */
export type ArgonOptions = { memory: number; iterations: number; parallelism: number }

/**
 * Hashes with Argon2i. Subclasses change the variant by overriding `algorithm`.
 */
export default class ArgonHasher extends AbstractHasher<ArgonOptions> {
    protected algorithm: "argon2i" | "argon2id" = "argon2i"

    /**
     * Hashes a value with Argon2, merging per-call options over the configured costs.
     */
    make(value: string, options: Partial<ArgonOptions> = {}): Promise<string> {
        return this.runtime.hash(value, { algorithm: this.algorithm, ...this.options, ...options })
    }

    /**
     * Determines whether the hash's variant, memory, iterations, or parallelism differ from the current options.
     */
    needsRehash(hash: string, options: Partial<ArgonOptions> = {}): boolean {
        const { memory, iterations, parallelism } = { ...this.options, ...options }
        const info = this.info(hash)

        return (
            info.algorithm !== this.algorithm ||
            info.memory !== memory ||
            info.iterations !== iterations ||
            info.parallelism !== parallelism
        )
    }
}
