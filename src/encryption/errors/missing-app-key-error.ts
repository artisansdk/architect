import ArchitectError from "../../errors/error"

/**
 * Thrown when the encrypter is resolved without an `app.key` configured.
 */
export default class MissingAppKeyError extends ArchitectError {
    constructor(message: string) {
        super(message, "encryption")
        this.name = "MissingAppKeyError"
    }
}
