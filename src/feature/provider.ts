import type ConfigRepository from "../config/repository"
import type { Container } from "../container/contract"
import type HttpFactory from "../http/factory"
import type LogManager from "../log/manager"
import Lottery from "../lottery/lottery"
import type StoreManager from "../store/manager"
import ServiceProvider from "../support/service-provider"
import { Feature } from "./feature"
import FeatureManager from "./manager"

export class FeatureProvider extends ServiceProvider {
    register(container: Container): void {
        container.singleton("feature", (c) =>
            FeatureManager.fromConfig(c.make<ConfigRepository>("config"), c.make<StoreManager>("store")),
        )

        container.singleton(FeatureManager, (c) => c.make<FeatureManager>("feature"))

        container.bind(Feature, (c) => c.make<FeatureManager>("feature").store())

        container.instance("lottery", Lottery)
    }

    /**
     * Sync server-owned features from every JSON response of the `"http"` client, when bound
     * and `feature.sync` is `true` (off by default). A failed sync is logged and never fails the request.
     */
    boot(container: Container): void {
        if (!container.has("http")) return
        if (container.make<ConfigRepository>("config").get<boolean>("feature.sync", false) !== true) return
        container.make<HttpFactory>("http").globalResponseMiddleware(async (response) => {
            let body: unknown
            try {
                body = response.json()
            } catch {
                return // not JSON
            }
            try {
                await container.make<FeatureManager>("feature").syncResponse(body)
            } catch (error) {
                if (container.has("log")) {
                    container.make<LogManager>("log").error("Syncing features from a response failed.", { error })
                }
            }
        })
    }
}
