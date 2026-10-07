import type { Container } from "../container/contract"
import type { Contract as Logger } from "../log/contract"
import LogManager from "../log/manager"
import { methodExists } from "../support/reflect"
import ServiceProvider from "../support/service-provider"

/**
 * Central place errors go once nothing closer has handled them. Reporting defaults to the
 * log and rendering defaults to rethrowing; an error opts out of either by implementing
 * `Reportable` or `Renderable`.
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

    report(error: unknown): void {
        if (methodExists(error, "report")) {
            error.report()
            return
        }

        this.log.error(error instanceof Error ? error.message : String(error), { error })
    }

    render(error: unknown): unknown {
        if (methodExists(error, "render")) {
            return error.render()
        }

        throw error
    }
}

export class ErrorHandlerProvider extends ServiceProvider {
    register(container: Container): void {
        container.singleton("errors", (c) => new ErrorHandler(c.make(LogManager)))
        container.singleton(ErrorHandler, (c) => c.make<ErrorHandler>("errors"))
    }
}
