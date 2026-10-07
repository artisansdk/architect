/**
 * The most UTF-8 bytes bcrypt reads from a value. Runtimes reject longer values with
 * PasswordTooLongError rather than silently truncating them.
 */
export const BCRYPT_MAX_BYTES = 72

/**
 * The algorithm and cost parameters a hasher passes to its runtime's hash().
 */
export type RuntimeOptions =
    | { algorithm: "argon2i" | "argon2d" | "argon2id"; memory: number; iterations: number; parallelism: number }
    | { algorithm: "bcrypt"; rounds: number }

/**
 * The password primitive a hasher delegates to. Defaults to detectRuntime(); pass another
 * (e.g. a Tauri command bridge) to override it.
 */
export interface Runtime {
    /**
     * Hashes a value, returning the standard encoded string (PHC for argon2, `$2a$`/`$2b$` for bcrypt)
     * with the salt and parameters embedded.
     */
    hash(value: string, options: RuntimeOptions): Promise<string>
    /**
     * Verifies a value against an encoded hash, reading the algorithm and parameters from the hash itself.
     */
    verify(value: string, hash: string): Promise<boolean>
}
