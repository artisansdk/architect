import type { Contract as Logger } from "../log/contract"
import { methodExists } from "../support/reflect"
import ArchitectError from "./error"

/**
 * Central place errors go once nothing closer has handled them. Reporting defaults to the
 * log and rendering defaults to rethrowing; an error opts out of either by implementing
 * `Reportable` or `Renderable`, picks the log level with `Level`, or skips reporting with `Ignorable`.
 */
export default class ErrorHandler {
    constructor(protected log: Logger) {}

    /**
     * Report then render the error. A failure while reporting (e.g. a `LogError`) is
     * rendered on its own first, so a broken logger never hides the original error.
     */
    handle(error: unknown): unknown {
        try {
            this.report(error)
        } catch (failure) {
            this.render(failure)
        }

        return this.render(error)
    }

    /**
     * Concerns are read from the original error when it arrives wrapped in an `ArchitectError`,
     * so an uncaught error behaves the same as one handed over directly.
     */
    report(error: unknown): void {
        const original = error instanceof ArchitectError ? error.cause : error

        if (methodExists(original, "ignore") && original.ignore()) {
            return
        }

        if (methodExists(original, "report")) {
            original.report()
            return
        }

        const level = methodExists(original, "level") ? (original.level() as keyof Logger) : "error"
        // An unknown level falls back to `error` rather than losing the report
        const write = typeof this.log[level] === "function" ? this.log[level] : this.log.error
        write.call(this.log, error instanceof Error ? error.message : String(error), { error })
    }

    render(error: unknown): unknown {
        if (methodExists(error, "render")) {
            return error.render()
        }

        throw error
    }
}
