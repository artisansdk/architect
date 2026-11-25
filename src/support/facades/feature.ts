import type FeatureManager from "../../feature/manager"
import { createFacade } from "./facade"

/**
 * Facade for the {@link FeatureManager} bound as `"feature"` — `Feature.define(...)`, `Feature.store(...)`, etc.
 */
export const Feature = createFacade<FeatureManager>("feature")

export default Feature
