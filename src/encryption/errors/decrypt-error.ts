import ArchitectError from "../../errors/error"

/**
 * Thrown when a payload is malformed, its MAC or tag doesn't verify, or no key can decrypt it.
 */
export default class DecryptError extends ArchitectError {
    constructor(message: string) {
        super(message, "encryption")
        this.name = "DecryptError"
    }
}
