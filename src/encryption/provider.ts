import type ConfigRepository from "../config/repository"
import type { Container, Identifier } from "../container/contract"
import { DeferrableServiceProvider } from "../support/service-provider"
import { decode } from "./base64"
import Encrypter from "./encrypter"
import MissingAppKeyError from "./errors/missing-app-key-error"

/**
 * Registers the Encrypter from `app.key`, `app.cipher`, and `app.previous_keys`.
 * Deferred, so a missing key only throws once something resolves it.
 */
export class EncryptionProvider extends DeferrableServiceProvider {
    /**
     * Binds the encrypter as `encrypter`, aliased to its class.
     */
    register(container: Container): void {
        container.singleton("encrypter", (c) => {
            const config = c.make<ConfigRepository>("config")
            const previous = config.get<string[]>("app.previous_keys", []) ?? []

            return new Encrypter(this.key(config), config.get<string>("app.cipher") ?? undefined).previousKeys(
                previous.map((key) => this.parseKey(key)),
            )
        })
        container.alias(Encrypter, "encrypter")
    }

    /**
     * Returns the bindings that trigger this provider to register.
     */
    provides(): Identifier[] {
        return ["encrypter", Encrypter]
    }

    /**
     * Reads `app.key`, throwing MissingAppKeyError when it's empty.
     */
    protected key(config: ConfigRepository): Uint8Array {
        const key = config.get<string>("app.key", "")

        if (!key) {
            throw new MissingAppKeyError("No application encryption key has been specified.")
        }

        return this.parseKey(key)
    }

    /**
     * Decodes a `base64:`-prefixed key; other keys are used as raw UTF-8 bytes.
     */
    protected parseKey(key: string): Uint8Array {
        return key.startsWith("base64:") ? decode(key.slice("base64:".length)) : new TextEncoder().encode(key)
    }
}
