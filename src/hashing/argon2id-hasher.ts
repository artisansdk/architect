import ArgonHasher from "./argon-hasher"

/**
 * Hashes with Argon2id, the recommended variant and the default driver.
 */
export default class Argon2IdHasher extends ArgonHasher {
    protected algorithm = "argon2id" as const
}
