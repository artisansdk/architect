import ConfigRepository from "../config/repository"
import Manager from "../support/manager"
import type AbstractHasher from "./abstract-hasher"
import type { HashInfo } from "./abstract-hasher"
import ArgonHasher, { type ArgonOptions } from "./argon-hasher"
import Argon2IdHasher from "./argon2id-hasher"
import BcryptHasher, { type BcryptOptions } from "./bcrypt-hasher"

/**
 * Resolves password hashing drivers and forwards calls to the configured default.
 * Built-in drivers are created from the `hashing.*` config on first use.
 */
export default class HashManager extends Manager<AbstractHasher, AbstractHasher> {
    /**
     * Creates a manager whose default driver is `hashing.driver` (argon2id unless configured).
     */
    constructor(config: ConfigRepository = new ConfigRepository({})) {
        super({}, "argon2id", config)
        this.active = config.get<string>("hashing.driver", "argon2id") ?? "argon2id"
    }

    /**
     * Resolves a hasher by name, defaulting to the configured driver.
     */
    driver(name: string = this.active): AbstractHasher {
        return this.resolve(name)
    }

    /**
     * Hashes a value with the default driver.
     */
    make(value: string, options?: Record<string, number>): Promise<string> {
        return this.driver().make(value, options)
    }

    /**
     * Verifies a value against a hash made by any supported driver.
     */
    check(value: string, hash: string): Promise<boolean> {
        return this.driver().check(value, hash)
    }

    /**
     * Determines whether a hash should be regenerated under the default driver's current config.
     */
    needsRehash(hash: string, options?: Record<string, number>): boolean {
        return this.driver().needsRehash(hash, options)
    }

    /**
     * Reads the algorithm and cost parameters encoded in a hash.
     */
    info(hash: string): HashInfo {
        return this.driver().info(hash)
    }

    /**
     * Creates the Argon2id driver from `hashing.argon`.
     */
    protected createArgon2idDriver(): AbstractHasher {
        return new Argon2IdHasher(this.argonOptions())
    }

    /**
     * Creates the Argon2i driver from `hashing.argon`.
     */
    protected createArgonDriver(): AbstractHasher {
        return new ArgonHasher(this.argonOptions())
    }

    /**
     * Creates the bcrypt driver from `hashing.bcrypt`, defaulting to 12 rounds.
     */
    protected createBcryptDriver(): AbstractHasher {
        return new BcryptHasher({ rounds: 12, ...this.config.get<Partial<BcryptOptions>>("hashing.bcrypt", {}) })
    }

    /**
     * Merges `hashing.argon` over the defaults shared by both Argon2 drivers.
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
     * Lazily creates built-in drivers on first use; drivers registered with extend() take precedence.
     */
    protected resolve(name: string): AbstractHasher {
        if (!(name in this.drivers) && !(name in this.customCreators)) {
            const create = {
                argon2id: () => this.createArgon2idDriver(),
                argon: () => this.createArgonDriver(),
                bcrypt: () => this.createBcryptDriver(),
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
        return "Hash driver"
    }
}
