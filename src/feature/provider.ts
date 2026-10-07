import type ConfigRepository from "../config/repository"
import type { Container } from "../container/contract"
import type StoreManager from "../store/manager"
import ServiceProvider from "../support/service-provider"
import { Features } from "./features"

export class FeatureProvider extends ServiceProvider {
    register(container: Container): void {
        container.singleton("feature", (c) => {
            const driver = c.make<ConfigRepository>("config").get<string>("feature.store") ?? undefined
            return new Features(c.make<StoreManager>("store").driver(driver))
        })
        container.singleton(Features, (c) => c.make<Features>("feature"))
    }
}
