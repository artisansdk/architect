import AbstractHasher from "./abstract-hasher"

/**
 * Bcrypt cost: the log2 number of rounds (4–31).
 */
export type BcryptOptions = { rounds: number }

/**
 * Hashes with bcrypt, mainly for compatibility with existing hashes such as PHP's `password_hash()`.
 * The built-in runtimes reject values over BCRYPT_MAX_BYTES rather than silently truncating them.
 */
export default class BcryptHasher extends AbstractHasher<BcryptOptions> {
    /**
     * Hashes a value with bcrypt, merging per-call options over the configured rounds.
     */
    make(value: string, options: Partial<BcryptOptions> = {}): Promise<string> {
        return this.runtime.hash(value, { algorithm: "bcrypt", ...this.options, ...options })
    }

    /**
     * Determines whether the hash isn't bcrypt or was made with different rounds than the current options.
     */
    needsRehash(hash: string, options: Partial<BcryptOptions> = {}): boolean {
        const { rounds } = { ...this.options, ...options }
        const info = this.info(hash)
        return info.algorithm !== "bcrypt" || info.rounds !== rounds
    }
}
