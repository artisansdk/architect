import type Encrypter from "../../encryption/encrypter"
import { createFacade } from "./facade"

/**
 * Facade for the Encrypter bound as `encrypter`.
 */
export const Crypt = createFacade<Encrypter>("encrypter")

export default Crypt
