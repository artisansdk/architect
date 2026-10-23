import type { Runtime } from "./contract"
import { wasmRuntime } from "./wasm"

type Argon2Parameters = {
    message: string
    nonce: Uint8Array
    memory: number
    passes: number
    parallelism: number
    tagLength: number
}

/**
 * The subset of `node:crypto` the Node runtime uses.
 */
export interface NodeCrypto {
    argon2(
        algorithm: string,
        parameters: Argon2Parameters,
        callback: (err: Error | null, key: Uint8Array) => void,
    ): void
    randomBytes(size: number): Uint8Array
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean
}

const PasswordHashingCompetition =
    /^\$(argon2id|argon2i|argon2d)\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64").replace(/=+$/, "")

/**
 * Native runtime backed by Node's `crypto.argon2` (Node 24.7+), which hashes on the libuv thread pool.
 * Node has no native bcrypt, so bcrypt and pre-1.3 argon2 hashes go through the WASM runtime.
 */
export function nodeRuntime(crypto: NodeCrypto): Runtime {
    const derive = (algorithm: string, parameters: Argon2Parameters) =>
        new Promise<Uint8Array>((resolve, reject) =>
            crypto.argon2(algorithm, parameters, (err, key) => (err ? reject(err) : resolve(key))),
        )

    return {
        async hash(value, options) {
            if (options.algorithm === "bcrypt") {
                return wasmRuntime.hash(value, options)
            }

            const { algorithm, memory, iterations, parallelism } = options
            const nonce = crypto.randomBytes(16)
            const key = await derive(algorithm, {
                message: value,
                nonce,
                memory,
                passes: iterations,
                parallelism,
                tagLength: 32,
            })

            return `$${algorithm}$v=19$m=${memory},t=${iterations},p=${parallelism}$${encode(nonce)}$${encode(key)}`
        },

        async verify(value, hash) {
            const phc = PasswordHashingCompetition.exec(hash)
            if (!phc) {
                return wasmRuntime.verify(value, hash)
            }

            const [, algorithm, memory, passes, parallelism, nonce, digest] = phc
            const expected = Buffer.from(digest, "base64")
            const key = await derive(algorithm, {
                message: value,
                nonce: Buffer.from(nonce, "base64"),
                memory: Number(memory),
                passes: Number(passes),
                parallelism: Number(parallelism),
                tagLength: expected.length,
            })

            return crypto.timingSafeEqual(key, expected)
        },
    }
}
