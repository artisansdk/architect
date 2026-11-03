import type ConfigRepository from "../config/repository"
import type { Container } from "../container/contract"
import type StoreManager from "../store/manager"
import ServiceProvider from "../support/service-provider"
import StoreDriver from "./drivers/store"
import { Features } from "./features"

export class FeatureProvider extends ServiceProvider {
    register(container: Container): void {
        container.singleton("feature", (c) => {
            const name = c.make<ConfigRepository>("config").get<string>("feature.store") ?? undefined
            const driver = new StoreDriver(c.make<StoreManager>("store").driver(name))

            return new Features(driver, "global", undefined, undefined, name)
        })

        container.alias(Features, "feature")
    }
}
