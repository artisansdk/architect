# Encryption

**Encrypter** encrypts and decrypts values with your application key, mirroring Laravel's `Illuminate\Encryption`. Payloads use Laravel's format, so a string encrypted with `Crypt::encryptString()` in a Laravel app decrypts here and vice versa, as long as both share `APP_KEY` and the cipher.

`EncryptionProvider` is included in `defaultProviders` and is deferred: nothing is built, and a missing key doesn't throw, until something resolves the encrypter.

> **Keep the key off the client.** Anything shipped to a browser bundle is public, so an `app.key` there protects nothing. Use the encrypter where the key stays secret: Bun or Node servers, workers, and Tauri's Rust side.

## Basic usage

```typescript
import { Crypt } from "@artisansdk/architect/support/facades"

const payload = await Crypt.encryptString("secret")
await Crypt.decryptString(payload) // "secret"

const token = await Crypt.encrypt({ userId: 42 })  // serialized as JSON
await Crypt.decrypt(token)                         // { userId: 42 }
```

`decrypt()` and `decryptString()` throw `DecryptError` when a payload is malformed, has been tampered with, or can't be decrypted by any configured key.

The same API without the container:

```typescript doctest
import { Encrypter } from "@artisansdk/architect/encryption"

const encrypter = new Encrypter(Encrypter.generateKey("aes-128-cbc"))
const payload = await encrypter.encryptString("secret")

await encrypter.decryptString(payload)                        // "secret"
await encrypter.decrypt(await encrypter.encrypt({ id: 42 }))  // { "id": 42 }
```

## Configuration

The keys match Laravel's `config/app.php`, so you can reuse a Laravel `.env`:

```typescript
Application.configure({
  config: {
    app: {
      key: env("APP_KEY"),                // "base64:..." as written by `php artisan key:generate`
      cipher: "aes-256-cbc",              // match a Laravel app; defaults to aes-128-cbc
      previous_keys: [env("APP_OLD_KEY")], // still decrypt, never encrypt
    },
  },
})
```

| Cipher | Key size | Authenticated by |
|--------|----------|------------------|
| `aes-128-cbc` | 16 bytes | HMAC-SHA256 `mac` (default) |
| `aes-256-cbc` | 32 bytes | HMAC-SHA256 `mac` (Laravel's `config/app.php` default) |
| `aes-256-gcm` | 32 bytes | GCM `tag` |
| `aes-128-gcm` | 16 bytes | GCM `tag` |

Without `app.cipher` the encrypter uses `aes-128-cbc`, which needs a 16-byte key. Laravel apps ship with `AES-256-CBC` in `config/app.php` and a 32-byte `APP_KEY`, so set `cipher: "aes-256-cbc"` when sharing a Laravel key, otherwise the key length won't match and `UnsupportedCipherError` is thrown.

Keys prefixed with `base64:` are decoded; any other key is used as raw UTF-8 bytes. A missing key throws `MissingAppKeyError`, and an unknown cipher or a key of the wrong length throws `UnsupportedCipherError`.

To generate a key:

```typescript
import { Encrypter } from "@artisansdk/architect/encryption"

const key = Encrypter.generateKey("aes-128-cbc")
`base64:${btoa(String.fromCharCode(...key))}` // paste into APP_KEY
```

To check whether a stored value is already encrypted, for example while migrating a column, use `Encrypter.appearsEncrypted(value)`. It only checks the payload's shape and doesn't decrypt it.

## Rotating keys

Move the old key to `previous_keys` and set a new `key`. New payloads use the new key, and payloads made with any previous key still decrypt. Re-encrypt stored values at your own pace, then drop the old key.

## Interoperating with Laravel

| Here | Laravel | Compatible |
|------|---------|------------|
| `encryptString()` / `decryptString()` | `Crypt::encryptString()` / `Crypt::decryptString()` | Yes, both directions |
| `encrypt()` / `decrypt()` | `Crypt::encrypt()` / `Crypt::decrypt()` | No: values are serialized as JSON here and with PHP's `serialize()` there |

To share structured data with Laravel, `JSON.stringify` it into `encryptString()` and `json_decode` the result of `decryptString()` in PHP.

## Errors

All extend `ArchitectError` with `source: "encryption"`.

| Error | Thrown when |
|-------|-------------|
| `DecryptError` | The payload is malformed, the MAC or tag doesn't verify, or no key decrypts it |
| `EncryptError` | The value can't be serialized (e.g. `undefined`) |
| `MissingAppKeyError` | The encrypter is resolved without `app.key` |
| `UnsupportedCipherError` | The cipher is unknown or a key is the wrong length for it |
