import ArchitectError from "../../errors/error"

/**
 * Thrown by a runtime when a value is longer than its algorithm can hash without truncating it.
 */
export default class PasswordTooLongError extends ArchitectError {
    constructor(message: string) {
        super(message, "hashing")
        this.name = "PasswordTooLongError"
    }
}
