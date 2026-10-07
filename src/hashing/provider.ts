import type ConfigRepository from "../config/repository"
import type { Container, Identifier } from "../container/contract"
import { DeferrableServiceProvider } from "../support/service-provider"
import HashManager from "./manager"

/**
 * Registers the HashManager. Deferred, so the manager isn't built until something resolves it.
 */
export class HashProvider extends DeferrableServiceProvider {
    /**
     * Binds the manager as `hash` (aliased to its class) and the default driver as `hash.driver`.
     */
    register(container: Container): void {
        container.singleton("hash", (c) => new HashManager(c.make<ConfigRepository>("config")))
        container.alias(HashManager, "hash")
        container.singleton("hash.driver", (c) => c.make<HashManager>("hash").driver())
    }

    /**
     * Returns the bindings that trigger this provider to register.
     */
    provides(): Identifier[] {
        return ["hash", "hash.driver", HashManager]
    }
}
