import ArchitectError from "../../errors/error"

/**
 * Thrown when the cipher isn't supported or the key is the wrong length for it.
 */
export default class UnsupportedCipherError extends ArchitectError {
    constructor(message: string) {
        super(message, "encryption")
        this.name = "UnsupportedCipherError"
    }
}
