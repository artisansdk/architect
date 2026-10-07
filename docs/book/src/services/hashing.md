# Hashing

**HashManager** hashes passwords with salted, deliberately slow algorithms. **Argon2id** is the default, and **bcrypt** is there for compatibility, so hashes from PHP/Laravel's `password_hash()` (`$2y$`) verify as-is. Each call to `make()` produces a different hash because the salt is random. To encrypt and decrypt values, use [`Crypt`](./encryption.md) instead.

`HashProvider` is included in `defaultProviders` and is deferred, so nothing is built until the first hash.

## Basic usage

```typescript
import { Hash } from "@artisansdk/architect/support/facades"

const hash = await Hash.make("secret")

await Hash.check("secret", hash) // true
Hash.needsRehash(hash)           // false
Hash.info(hash)                  // { algorithm: "argon2id", memory: 65536, iterations: 3, parallelism: 1 }
```

`check()` returns `false` for empty or malformed hashes rather than throwing. It verifies any supported algorithm whatever the default driver is, so legacy bcrypt hashes keep working while you migrate them.

The same API without the container:

```typescript doctest
import { HashManager } from "@artisansdk/architect/hashing"
import ConfigRepository from "@artisansdk/architect/config/repository"

const hashes = new HashManager(new ConfigRepository({ hashing: { argon: { memory: 1024, iterations: 1 } } }))
const hash = await hashes.make("secret")

await hashes.check("secret", hash) // true
await hashes.check("wrong", hash)  // false
hashes.needsRehash(hash)           // false
hashes.info(hash).algorithm        // "argon2id"
```

## Upgrading hashes on login

`needsRehash()` is `true` when a hash was made by a different algorithm or with different costs than the current config. Check it after a successful login and store a fresh hash:

```typescript
if (await Hash.check(password, user.password)) {
  if (Hash.needsRehash(user.password)) {
    user.password = await Hash.make(password)
  }
}
```

This moves bcrypt users to Argon2id, and moves everyone to new cost settings, without a migration.

## Drivers

| Driver | Algorithm | Notes |
|--------|-----------|-------|
| `argon2id` | Argon2id | Default. |
| `argon` | Argon2i | |
| `bcrypt` | bcrypt | Values over 72 bytes throw `PasswordTooLongError` instead of being silently truncated. |

```typescript
await Hash.driver("bcrypt").make("secret")
```

## Configuration

```typescript
Application.configure({
  config: {
    hashing: {
      driver: "argon2id",
      argon: { memory: 65536, iterations: 3, parallelism: 1 }, // shared by argon and argon2id
      bcrypt: { rounds: 12 },
    },
  },
})
```

The values above are the defaults. To override them for a single call, pass options to `make()` and `needsRehash()`:

```typescript
await Hash.make(password, { memory: 131072 })
```

An unknown `driver` throws `Hash driver [name] is not defined.` the first time a hash is made.

## Runtimes

Hashers delegate the actual cryptography to a runtime, picked automatically by `detectRuntime()`:

| Environment | Runtime | |
|-------------|---------|---|
| Bun | `Bun.password` | Native, off the main thread. Falls back to WASM when `parallelism` isn't 1. |
| Node 24.7+ | `crypto.argon2` | Native, on the libuv thread pool. Bcrypt uses WASM. |
| Everything else | WASM (`hash-wasm`) | Browsers, workers, Deno, Tauri webviews, older Node. |

Every runtime produces standard encoded hashes, so a hash made in one verifies in any other. In browsers the WASM runtime blocks the main thread while it hashes (about 100ms with the default costs).

To use a different runtime, such as a Tauri command that hashes in Rust, pass one implementing `hash()` and `verify()` to a hasher, and register that hasher as a driver:

```typescript
import { Argon2IdHasher, HashManager, type HashRuntime } from "@artisansdk/architect/hashing"

const tauri: HashRuntime = {
  hash: (value, options) => invoke("hash_password", { value, options }),
  verify: (value, hash) => invoke("verify_password", { value, hash }),
}

container.make(HashManager).extend("argon2id", () => new Argon2IdHasher({ memory: 65536, iterations: 3, parallelism: 1 }, tauri))
```

## Custom drivers

`extend()` registers a driver, and it takes precedence over a built-in driver of the same name. Extend `AbstractHasher` to get `check()` and `info()` for free:

```typescript
import { AbstractHasher, HashManager } from "@artisansdk/architect/hashing"

class ScryptHasher extends AbstractHasher {
  async make(value: string) { /* ... */ }
  needsRehash(hash: string) { /* ... */ }
}

container.make(HashManager).extend("scrypt", () => new ScryptHasher({}))
```
