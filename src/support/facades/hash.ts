import type HashManager from "../../hashing/manager"
import { createFacade } from "./facade"

/**
 * Facade for the HashManager bound as `hash`.
 */
export const Hash = createFacade<HashManager>("hash")

export default Hash
