import ArchitectError from "../../errors/error"

/**
 * Thrown when a value can't be encrypted, e.g. it can't be serialized.
 */
export default class EncryptError extends ArchitectError {
    constructor(message: string) {
        super(message, "encryption")
        this.name = "EncryptError"
    }
}
