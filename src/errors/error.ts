export type Source = "window" | "promise" | "react" | "hashing" | "encryption"

export default class ArchitectError extends Error {
    // Bus event label — lets listeners subscribe via the class or the "error" string
    static label = "error"

    readonly source: Source
    readonly errorInfo?: unknown

    constructor(error: unknown, source: Source, errorInfo?: unknown) {
        super(error instanceof Error ? error.message : String(error), { cause: error })
        this.name = "ArchitectError"
        this.source = source
        this.errorInfo = errorInfo

        // Adopt the original stack so reports point at the throw site, not this wrapper
        if (error instanceof Error && error.stack) {
            this.stack = error.stack
        }
    }
}
