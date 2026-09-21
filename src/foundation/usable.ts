import type { ConfigItems } from "../config/repository"
import type ServiceProvider from "../support/service-provider"

/**
 * Anything `Application.use()` accepts. Anything that is — or produces — a ServiceProvider is
 * registered as a provider; every other object is treated as config.
 */
export type Usable = ServiceProvider | (new () => ServiceProvider) | ConfigItems
