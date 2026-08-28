import type HttpFactory from "../../http/factory"
import { createFacade } from "./facade"

/**
 * Facade for the {@link HttpFactory} bound as `"http"` — `Http.fake({...})`, `Http.get(url)`, etc.
 */
export const Http = createFacade<HttpFactory>("http")

export default Http
