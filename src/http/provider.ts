import type { Container } from "../container/contract"
import ServiceProvider from "../support/service-provider"
import HttpFactory from "./factory"

/**
 * Registers the {@link HttpFactory} as a singleton under `"http"` and its class token.
 * Included in `defaultProviders`.
 */
export class HttpProvider extends ServiceProvider {
    /**
     * Bind the shared {@link HttpFactory}, resolvable by the `"http"` string or the class.
     */
    register(container: Container): void {
        container.singleton("http", () => new HttpFactory())
        container.singleton(HttpFactory, (c) => c.make<HttpFactory>("http"))
    }
}
