import PasswordTooLongError from "../errors/password-too-long-error"
import { BCRYPT_MAX_BYTES, type Runtime } from "./contract"
import { wasmRuntime } from "./wasm"

/**
 * The subset of `Bun.password` the Bun runtime uses.
 */
export interface BunPassword {
    hash(value: string, options: Record<string, unknown>): Promise<string>
    verify(value: string, hash: string): Promise<boolean>
}

/**
 * Native runtime backed by `Bun.password`, which hashes off the main thread.
 */
export function bunRuntime(password: BunPassword): Runtime {
    return {
        async hash(value, options) {
            if (options.algorithm === "bcrypt") {
                // Bun SHA-512s longer values first, which no other bcrypt can verify; reject like the WASM runtime.
                if (new TextEncoder().encode(value).length > BCRYPT_MAX_BYTES) {
                    throw new PasswordTooLongError(`Bcrypt values must be at most ${BCRYPT_MAX_BYTES} bytes.`)
                }
                return password.hash(value, { algorithm: "bcrypt", cost: options.rounds })
            }

            // Bun always hashes argon2 with parallelism 1.
            if (options.parallelism !== 1) {
                return wasmRuntime.hash(value, options)
            }

            return password.hash(value, {
                algorithm: options.algorithm,
                memoryCost: options.memory,
                timeCost: options.iterations,
            })
        },

        verify(value, hash) {
            // Bun SHA-512s longer bcrypt values first, which no other bcrypt does; no standard hash can match.
            if (!hash.startsWith("$argon2") && new TextEncoder().encode(value).length > BCRYPT_MAX_BYTES) {
                return Promise.resolve(false)
            }
            return password.verify(value, hash)
        },
    }
}
