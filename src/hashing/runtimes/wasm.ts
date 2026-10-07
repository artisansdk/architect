import { argon2d, argon2i, argon2id, argon2Verify, bcrypt, bcryptVerify } from "hash-wasm"
import PasswordTooLongError from "../errors/password-too-long-error"
import { BCRYPT_MAX_BYTES, type Runtime } from "./contract"

const argon = { argon2i, argon2d, argon2id }

// 16-byte salt and 32-byte digest match PHP's password_hash() and Bun.password output.
const salt = () => crypto.getRandomValues(new Uint8Array(16))

/**
 * Portable runtime backed by hash-wasm. Runs anywhere WebAssembly and Web Crypto exist.
 * Bcrypt rejects values over BCRYPT_MAX_BYTES rather than silently truncating them.
 */
export const wasmRuntime: Runtime = {
    async hash(value, options) {
        if (options.algorithm === "bcrypt") {
            if (new TextEncoder().encode(value).length > BCRYPT_MAX_BYTES) {
                throw new PasswordTooLongError(`Bcrypt values must be at most ${BCRYPT_MAX_BYTES} bytes.`)
            }
            return bcrypt({ password: value, salt: salt(), costFactor: options.rounds, outputType: "encoded" })
        }

        return argon[options.algorithm]({
            password: value,
            salt: salt(),
            memorySize: options.memory,
            iterations: options.iterations,
            parallelism: options.parallelism,
            hashLength: 32,
            outputType: "encoded",
        })
    },

    verify(value, hash) {
        return hash.startsWith("$argon2")
            ? argon2Verify({ password: value, hash })
            : bcryptVerify({ password: value, hash })
    },
}
