import { decode, encode } from "./base64"
import type { Contract } from "./contract"
import DecryptError from "./errors/decrypt-error"
import EncryptError from "./errors/encrypt-error"
import UnsupportedCipherError from "./errors/unsupported-cipher-error"

/**
 * The supported AES ciphers.
 */
export type Cipher = "aes-128-cbc" | "aes-256-cbc" | "aes-128-gcm" | "aes-256-gcm"

// Key size, AEAD support, and IV length (OpenSSL's openssl_cipher_iv_length()) per cipher.
const CIPHERS: Record<Cipher, { size: number; aead: boolean; iv: number }> = {
    "aes-128-cbc": { size: 16, aead: false, iv: 16 },
    "aes-256-cbc": { size: 32, aead: false, iv: 16 },
    "aes-128-gcm": { size: 16, aead: true, iv: 12 },
    "aes-256-gcm": { size: 32, aead: true, iv: 12 },
}

// GCM authentication tag length in bytes; payloads must carry exactly 16.
const TAG_BYTES = 16

type Payload = { iv: string; value: string; mac: string; tag?: string }

const encoder = new TextEncoder()

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length))

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/**
 * Encrypts values with AES. Payloads are base64 of `{"iv","value","mac","tag"}` JSON.
 * CBC payloads are authenticated with an HMAC-SHA256 `mac`; GCM payloads with their `tag`.
 */
export default class Encrypter implements Contract {
    protected key: Uint8Array<ArrayBuffer>
    protected cipher: Cipher
    protected previous: Uint8Array<ArrayBuffer>[] = []

    /**
     * Creates an encrypter for a raw key, throwing UnsupportedCipherError if the cipher is unknown
     * or the key is the wrong length for it.
     */
    constructor(key: Uint8Array, cipher: string = "aes-128-cbc") {
        const name = cipher.toLowerCase()

        if (!Encrypter.supported(key, name)) {
            throw new UnsupportedCipherError(
                `Unsupported cipher or incorrect key length. Supported ciphers are: ${Object.keys(CIPHERS).join(", ")}.`,
            )
        }

        this.key = new Uint8Array(key)
        this.cipher = name as Cipher
    }

    /**
     * Determines whether the key is the right length for the cipher.
     */
    static supported(key: Uint8Array, cipher: string): boolean {
        const spec = CIPHERS[cipher.toLowerCase() as Cipher]
        return spec !== undefined && key.length === spec.size
    }

    /**
     * Generates a random key of the right length for the cipher.
     */
    static generateKey(cipher: string): Uint8Array<ArrayBuffer> {
        return random(CIPHERS[cipher.toLowerCase() as Cipher]?.size ?? 32)
    }

    /**
     * Determines whether a value looks like a payload from this encrypter: base64 of JSON with
     * `iv`, `value`, and `mac` set. It doesn't check that the payload decrypts.
     */
    static appearsEncrypted(value: unknown): boolean {
        if (typeof value !== "string") {
            return false
        }

        try {
            const payload = JSON.parse(new TextDecoder().decode(decode(value)))
            return (
                typeof payload === "object" &&
                payload !== null &&
                ["iv", "value", "mac"].every((item) => payload[item] !== undefined && payload[item] !== null)
            )
        } catch {
            return false
        }
    }

    /**
     * Encrypts a value, serializing it to JSON first unless `serialize` is false. Throws EncryptError
     * when the value can't be serialized (e.g. `undefined`) or isn't a string with `serialize` off.
     */
    async encrypt(value: unknown, serialize = true): Promise<string> {
        const plaintext = serialize ? JSON.stringify(value) : value

        if (typeof plaintext !== "string") {
            throw new EncryptError("Could not encrypt the data.")
        }

        const spec = CIPHERS[this.cipher]
        const iv = random(spec.iv)
        let ciphertext: Uint8Array
        let tag = ""

        if (spec.aead) {
            const key = await crypto.subtle.importKey("raw", this.key, "AES-GCM", false, ["encrypt"])
            const sealed = new Uint8Array(
                await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext)),
            )
            // Web Crypto appends the tag to the ciphertext; the payload stores it separately.
            ciphertext = sealed.subarray(0, -TAG_BYTES)
            tag = encode(sealed.subarray(-TAG_BYTES))
        } else {
            const key = await crypto.subtle.importKey("raw", this.key, "AES-CBC", false, ["encrypt"])
            ciphertext = new Uint8Array(
                await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, encoder.encode(plaintext)),
            )
        }

        const payload: Payload = { iv: encode(iv), value: encode(ciphertext), mac: "", tag }

        if (!spec.aead) {
            payload.mac = await this.hash(payload.iv, payload.value, this.key)
        }

        return encode(encoder.encode(JSON.stringify(payload)))
    }

    /**
     * Decrypts a payload with the current key or any previous key, parsing the JSON back into a value
     * unless `unserialize` is false. Throws DecryptError when the payload is malformed or doesn't verify.
     */
    async decrypt(payload: string, unserialize = true): Promise<unknown> {
        const data = this.getJsonPayload(payload)
        const iv = decode(data.iv)
        const value = this.decode(data.value)
        const tag = data.tag ? this.decode(data.tag) : null

        this.ensureTagIsValid(tag)

        let decrypted: string | null = null

        if (this.shouldValidateMac()) {
            const key = await this.keyWithValidMac(data)
            decrypted = await this.open(key, iv, value, null)
        } else {
            // GCM authenticates itself, so try each key until one opens the payload.
            for (const key of this.getAllKeys()) {
                decrypted = await this.open(key, iv, value, tag)
                if (decrypted !== null) break
            }
        }

        if (decrypted === null) {
            throw new DecryptError("Could not decrypt the data.")
        }

        if (!unserialize) {
            return decrypted
        }

        try {
            return JSON.parse(decrypted)
        } catch {
            throw new DecryptError("Could not unserialize the data.")
        }
    }

    /**
     * Encrypts a string without serialization.
     */
    encryptString(value: string): Promise<string> {
        return this.encrypt(value, false)
    }

    /**
     * Decrypts a payload without unserialization.
     */
    async decryptString(payload: string): Promise<string> {
        return (await this.decrypt(payload, false)) as string
    }

    /**
     * Returns the current encryption key.
     */
    getKey(): Uint8Array {
        return this.key
    }

    /**
     * Returns the current key followed by the previous keys, in the order decryption tries them.
     */
    getAllKeys(): Uint8Array<ArrayBuffer>[] {
        return [this.key, ...this.previous]
    }

    /**
     * Returns the keys that can still decrypt but are no longer used to encrypt.
     */
    getPreviousKeys(): Uint8Array[] {
        return this.previous
    }

    /**
     * Sets the keys that can still decrypt after a key rotation. Each must be valid for the cipher.
     */
    previousKeys(keys: Uint8Array[]): this {
        for (const key of keys) {
            if (!Encrypter.supported(key, this.cipher)) {
                throw new UnsupportedCipherError(
                    `Unsupported cipher or incorrect key length. Supported ciphers are: ${Object.keys(CIPHERS).join(", ")}.`,
                )
            }
        }

        this.previous = keys.map((key) => new Uint8Array(key))
        return this
    }

    /**
     * Computes the hex HMAC-SHA256 of the base64 IV followed by the base64 value.
     */
    protected async hash(iv: string, value: string, key: Uint8Array<ArrayBuffer>): Promise<string> {
        const hmac = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
        return hex(new Uint8Array(await crypto.subtle.sign("HMAC", hmac, encoder.encode(iv + value))))
    }

    /**
     * Determines whether the payload's `mac` is valid for the current key.
     */
    protected validMac(payload: Payload): Promise<boolean> {
        return this.validMacForKey(payload, this.key)
    }

    /**
     * Determines whether the payload's `mac` is valid for the given key, comparing in constant time.
     */
    protected async validMacForKey(payload: Payload, key: Uint8Array<ArrayBuffer>): Promise<boolean> {
        if (!/^[0-9a-f]{64}$/.test(payload.mac)) {
            return false
        }

        const mac = Uint8Array.from(payload.mac.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
        const hmac = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
        return crypto.subtle.verify("HMAC", hmac, mac, encoder.encode(payload.iv + payload.value))
    }

    /**
     * Returns the first key whose MAC matches the payload, throwing DecryptError when none does.
     */
    protected async keyWithValidMac(payload: Payload): Promise<Uint8Array<ArrayBuffer>> {
        for (const key of this.getAllKeys()) {
            if (await this.validMacForKey(payload, key)) {
                return key
            }
        }

        throw new DecryptError("The MAC is invalid.")
    }

    /**
     * Determines whether payloads need a MAC: CBC ciphers do, GCM ciphers authenticate with their tag.
     */
    protected shouldValidateMac(): boolean {
        return !CIPHERS[this.cipher].aead
    }

    /**
     * Decrypts with one key, returning null instead of throwing when the key or tag doesn't fit.
     */
    protected async open(
        raw: Uint8Array<ArrayBuffer>,
        iv: Uint8Array<ArrayBuffer>,
        value: Uint8Array<ArrayBuffer>,
        tag: Uint8Array<ArrayBuffer> | null,
    ): Promise<string | null> {
        try {
            if (tag) {
                const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
                const sealed = new Uint8Array(value.length + tag.length)
                sealed.set(value)
                sealed.set(tag, value.length)
                return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed))
            }

            const key = await crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"])
            return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, value))
        } catch {
            return null
        }
    }

    /**
     * Decodes and validates the outer payload, throwing DecryptError if it isn't the expected shape
     * or the IV is the wrong length for the cipher.
     */
    protected getJsonPayload(payload: string): Payload {
        let data: unknown

        try {
            data = JSON.parse(new TextDecoder().decode(decode(payload)))
        } catch {
            throw new DecryptError("The payload is invalid.")
        }

        if (!this.validPayload(data)) {
            throw new DecryptError("The payload is invalid.")
        }

        return data
    }

    /**
     * Checks that `iv`, `value`, and `mac` are strings, any `tag` is a string, and the IV fits the cipher.
     */
    protected validPayload(payload: unknown): payload is Payload {
        if (typeof payload !== "object" || payload === null) {
            return false
        }

        const data = payload as Record<string, unknown>

        if (!["iv", "value", "mac"].every((item) => typeof data[item] === "string")) {
            return false
        }

        if (data.tag !== undefined && typeof data.tag !== "string") {
            return false
        }

        try {
            return decode(data.iv as string).length === CIPHERS[this.cipher].iv
        } catch {
            return false
        }
    }

    /**
     * Requires a 16-byte tag for GCM and rejects any tag for CBC.
     */
    protected ensureTagIsValid(tag: Uint8Array | null): void {
        const { aead } = CIPHERS[this.cipher]

        if (aead && tag?.length !== TAG_BYTES) {
            throw new DecryptError("Could not decrypt the data.")
        }

        if (!aead && tag !== null) {
            throw new DecryptError("Unable to use tag because the cipher algorithm does not support AEAD.")
        }
    }

    /**
     * Decodes a base64 payload field, throwing DecryptError instead of the DOMException atob() raises.
     */
    protected decode(field: string): Uint8Array<ArrayBuffer> {
        try {
            return decode(field)
        } catch {
            throw new DecryptError("Could not decrypt the data.")
        }
    }
}
