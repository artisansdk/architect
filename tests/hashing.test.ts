import { describe, expect, test } from "bun:test"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { argon2d, argon2i, argon2id } from "hash-wasm"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import ArchitectError from "@/errors/error"
import type { HashRuntime as Runtime, HashRuntimeOptions as RuntimeOptions } from "@/hashing"
import {
    Argon2IdHasher,
    ArgonHasher,
    BcryptHasher,
    bunRuntime,
    detectRuntime,
    HashManager,
    HashProvider,
    type NodeCrypto,
    nodeRuntime,
    PasswordTooLongError,
    wasmRuntime,
} from "@/hashing"
import { DeferrableServiceProvider } from "@/support/service-provider"

// Low costs keep the suite fast; production defaults are covered by the config tests.
const drivers = {
    argon2id: () => new Argon2IdHasher({ memory: 1024, iterations: 1, parallelism: 1 }),
    argon: () => new ArgonHasher({ memory: 1024, iterations: 1, parallelism: 1 }),
    bcrypt: () => new BcryptHasher({ rounds: 4 }),
}

for (const [name, create] of Object.entries(drivers)) {
    describe(`${name} hasher`, () => {
        test("make() produces a salted hash that check() accepts", async () => {
            const hasher = create()
            const a = await hasher.make("secret")
            const b = await hasher.make("secret")

            expect(a).not.toBe(b)
            expect(await hasher.check("secret", a)).toBe(true)
            expect(await hasher.check("wrong", a)).toBe(false)
        })

        test("check() returns false for malformed or empty hashes", async () => {
            const hasher = create()
            expect(await hasher.check("secret", "garbage")).toBe(false)
            expect(await hasher.check("secret", "")).toBe(false)
        })

        test("needsRehash() is false for current config and true after a change", async () => {
            const hasher = create()
            const hash = await hasher.make("secret")
            const changed = name === "bcrypt" ? { rounds: 5 } : { memory: 2048 }

            expect(hasher.needsRehash(hash)).toBe(false)
            expect(hasher.needsRehash(hash, changed)).toBe(true)
        })
    })
}

describe("encoded parameters", () => {
    test("argon2id encodes memory, iterations, and parallelism", async () => {
        const hasher = new Argon2IdHasher({ memory: 1024, iterations: 1, parallelism: 1 })
        const hash = await hasher.make("secret", { memory: 2048, iterations: 2, parallelism: 2 })

        expect(hasher.info(hash)).toEqual({ algorithm: "argon2id", memory: 2048, iterations: 2, parallelism: 2 })
        expect(await hasher.check("secret", hash)).toBe(true)
        expect(hasher.needsRehash(hash, { memory: 2048, iterations: 2 })).toBe(true)
    })

    test("bcrypt verifies hashes made by PHP password_hash()", async () => {
        const php = "$2y$04$CO09tupJ5cX87ceE6UAyuOBSK9vcwiI07ahwcVAePS7z5v2MEXSna"
        const hasher = new BcryptHasher({ rounds: 4 })

        expect(await hasher.check("x", php)).toBe(true)
        expect(await hasher.check("y", php)).toBe(false)
    })

    test("bcrypt rejects values over 72 bytes instead of truncating", async () => {
        await expect(new BcryptHasher({ rounds: 4 }).make("x".repeat(73))).rejects.toBeInstanceOf(PasswordTooLongError)
    })

    test("bcrypt encodes rounds", async () => {
        const hasher = new BcryptHasher({ rounds: 4 })
        expect(hasher.info(await hasher.make("secret", { rounds: 5 }))).toEqual({ algorithm: "bcrypt", rounds: 5 })
    })

    test("unknown formats are reported as unknown", () => {
        expect(new BcryptHasher({ rounds: 4 }).info("plain")).toEqual({ algorithm: "unknown" })
    })
})

// Builds the manager the way the app does: through HashProvider and the container.
const resolve = (config: Record<string, unknown>) => {
    const container = new BuiltinContainer()
    container.instance("config", new ConfigRepository(config))
    new HashProvider().register(container)
    return container
}

describe("HashManager", () => {
    const manager = (values: Record<string, unknown> = {}) =>
        resolve({
            hashing: {
                argon: { memory: 1024, iterations: 1, parallelism: 1 },
                bcrypt: { rounds: 4 },
                ...values,
            },
        }).make<HashManager>("hash")

    test("defaults to argon2id with the documented costs", async () => {
        const hash = await resolve({}).make<HashManager>("hash").make("secret", { memory: 1024 })
        expect(new ArgonHasher({ memory: 0, iterations: 0, parallelism: 0 }).info(hash)).toEqual({
            algorithm: "argon2id",
            memory: 1024,
            iterations: 3,
            parallelism: 1,
        })
    })

    test("respects the configured default algorithm", async () => {
        const hash = await manager({ algo: "bcrypt" }).make("secret")
        expect(hash.startsWith("$2")).toBe(true)
    })

    test("driver() selects a specific hasher", async () => {
        const hashes = manager()
        expect(hashes.algo("bcrypt")).toBeInstanceOf(BcryptHasher)
        expect(hashes.info(await hashes.algo("bcrypt").make("secret")).algorithm).toBe("bcrypt")
    })

    test("legacy bcrypt hashes still check and are flagged for rehash", async () => {
        const hashes = manager()
        const legacy = await hashes.algo("bcrypt").make("secret")

        expect(await hashes.check("secret", legacy)).toBe(true)
        expect(hashes.needsRehash(legacy)).toBe(true)
    })

    test("extend() registers a custom driver", async () => {
        const hashes = manager().extend("fast", () => new BcryptHasher({ rounds: 4 }))
        expect(await hashes.algo("fast").check("x", await hashes.algo("fast").make("x"))).toBe(true)
    })

    test("an unknown configured default algorithm throws instead of falling back", () => {
        expect(() => manager({ algo: "nope" }).make("x")).toThrow("Hash algorithm [nope] is not defined.")
    })

    test("extend() overrides a built-in driver", () => {
        const custom = new BcryptHasher({ rounds: 4 })
        expect(
            manager()
                .extend("bcrypt", () => custom)
                .algo("bcrypt"),
        ).toBe(custom)
    })

    test("unknown drivers throw", () => {
        expect(() => manager().algo("nope")).toThrow("Hash algorithm [nope] is not defined.")
    })

    const recorder = (seen: string[]): Runtime => ({
        hash: async (_, options) => {
            seen.push(options.algorithm)
            return "custom-hash"
        },
        verify: async () => true,
    })

    test("use() runs every algorithm on one registered runtime", async () => {
        const seen: string[] = []
        const hashes = manager().use("custom", () => recorder(seen))

        await hashes.make("x")
        await hashes.algo("argon").make("x")
        await hashes.algo("bcrypt").make("x")

        expect(seen).toEqual(["argon2id", "argon2i", "bcrypt"])
    })

    test("use() rebuilds hashers already created on the previous runtime", async () => {
        const seen: string[] = []
        const hashes = manager()
        await hashes.make("x")

        await hashes.use("custom", () => recorder(seen)).make("x")
        expect(seen).toEqual(["argon2id"])
    })

    test("hashing.runtime selects a runtime registered with use()", async () => {
        const seen: string[] = []
        const hashes = manager({ runtime: "custom" })
        hashes.use("custom", () => recorder(seen))

        await hashes.make("x")
        expect(seen).toEqual(["argon2id"])
    })

    test("extend() hands custom algorithms the active runtime", async () => {
        const seen: string[] = []
        const hashes = manager()
            .use("custom", () => recorder(seen))
            .extend("cheap", (_, runtime) => new BcryptHasher({ rounds: 4 }, runtime))

        await hashes.algo("cheap").make("x")
        expect(seen).toEqual(["bcrypt"])
    })

    test("unknown runtimes throw", () => {
        expect(() => manager().use("nope")).toThrow("Hash runtime [nope] is not defined.")
        expect(() => manager({ runtime: "nope" }).make("x")).toThrow("Hash runtime [nope] is not defined.")
    })

    test("delegates to an injected runtime", async () => {
        const runtime = { hash: async () => "custom-hash", verify: async () => true }
        expect(await new BcryptHasher({ rounds: 4 }, runtime).make("x")).toBe("custom-hash")
    })
})

describe("HashProvider", () => {
    test("binds the manager under 'hash', its class, and the default algorithm under 'hash.algo'", () => {
        const container = resolve({ hashing: { algo: "bcrypt" } })

        expect(container.make("hash")).toBeInstanceOf(HashManager)
        expect(container.make(HashManager)).toBe(container.make<HashManager>("hash"))
        expect(container.make("hash.algo")).toBeInstanceOf(BcryptHasher)
    })

    test("is deferred until one of its bindings is resolved", () => {
        const provider = new HashProvider()
        expect(provider).toBeInstanceOf(DeferrableServiceProvider)
        expect(provider.provides()).toEqual(["hash", "hash.algo", HashManager])
    })
})

describe("runtimes", () => {
    // Bun has no crypto.argon2, so exercise the Node adapter's encoding/parsing against hash-wasm.
    const fakeNodeCrypto: NodeCrypto = {
        argon2(algorithm, p, callback) {
            const derive = { argon2i, argon2d, argon2id }[algorithm as "argon2i" | "argon2d" | "argon2id"]
            derive({
                password: p.message,
                salt: p.nonce,
                memorySize: p.memory,
                iterations: p.passes,
                parallelism: p.parallelism,
                hashLength: p.tagLength,
                outputType: "binary",
            }).then(
                (key) => callback(null, key),
                (err) => callback(err, new Uint8Array()),
            )
        },
        randomBytes,
        timingSafeEqual,
    }

    const runtimes: Record<string, Runtime> = {
        wasm: wasmRuntime,
        bun: bunRuntime(Bun.password),
        node: nodeRuntime(fakeNodeCrypto),
    }

    const cases: RuntimeOptions[] = [
        { algorithm: "argon2id", memory: 1024, iterations: 1, parallelism: 1 },
        { algorithm: "argon2id", memory: 1024, iterations: 1, parallelism: 2 },
        { algorithm: "argon2i", memory: 1024, iterations: 2, parallelism: 1 },
        { algorithm: "bcrypt", rounds: 4 },
    ]

    for (const [maker, runtime] of Object.entries(runtimes)) {
        for (const options of cases) {
            test(`${maker} ${JSON.stringify(options)} verifies in every runtime`, async () => {
                const hash = await runtime.hash("secret", options)
                const { algorithm: _, ...encoded } = options

                expect(new BcryptHasher({ rounds: 4 }).info(hash)).toMatchObject(encoded)
                for (const verifier of Object.values(runtimes)) {
                    expect(await verifier.verify("secret", hash)).toBe(true)
                    expect(await verifier.verify("wrong", hash)).toBe(false)
                }
            })
        }
    }

    for (const [name, runtime] of Object.entries(runtimes)) {
        test(`BcryptHasher on ${name} rejects values over 72 bytes with PasswordTooLongError`, async () => {
            const hasher = new BcryptHasher({ rounds: 4 }, runtime)
            const hash = await hasher.make("x")
            const error = await hasher.make("x".repeat(73)).catch((e) => e)

            expect(error).toBeInstanceOf(PasswordTooLongError)
            expect(error).toBeInstanceOf(ArchitectError)
            expect(error.name).toBe("PasswordTooLongError")
            expect(error.source).toBe("hashing")
            expect(await hasher.check("x".repeat(73), hash)).toBe(false)
        })
    }

    test("the 72-byte limit is measured in UTF-8, not characters", async () => {
        const hasher = new BcryptHasher({ rounds: 4 })

        expect(await hasher.make("x".repeat(72))).toStartWith("$2")
        await expect(hasher.make("é".repeat(37))).rejects.toBeInstanceOf(PasswordTooLongError)
    })

    test("detectRuntime() picks the native Bun runtime under Bun", () => {
        expect(detectRuntime()).not.toBe(wasmRuntime)
        expect(detectRuntime()).toBe(detectRuntime())
    })
})
