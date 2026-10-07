import type { Features } from "../../feature/features"
import { createFacade } from "./facade"

/**
 * Facade for the {@link Features} bound as `"feature"` — `Feature.define(...)`, `Feature.active(...)`, etc.
 */
export const Feature = createFacade<Features>("feature")

export default Feature
