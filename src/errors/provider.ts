import type { Container } from "../container/contract"
import { Bus } from "../events/bus"
import LogManager from "../log/manager"
import ServiceProvider from "../support/service-provider"
import ArchitectError from "./error"
import ErrorHandler from "./handler"

export class ErrorsProvider extends ServiceProvider {
    protected controller?: AbortController

    register(container: Container) {
        container.singleton("errors", (c) => new ErrorHandler(c.make(LogManager)))
        container.singleton(ErrorHandler, (c) => c.make<ErrorHandler>("errors"))

        if (!container.bound("events")) {
            container.singleton("events", () => new Bus())
        }
    }

    boot(container: Container): void {
        if (typeof window === "undefined") {
            return
        }

        const bus = container.make<Bus>("events")
        this.controller = new AbortController()
        const { signal } = this.controller

        const uncaught = (error: ArchitectError) => {
            void bus.dispatch(error)

            // Report only: rendering rethrows, and a throw from inside this listener would come
            // straight back as another window error. A failing logger is dropped for the same reason.
            try {
                container.make<ErrorHandler>("errors").report(error)
            } catch {}
        }

        window.addEventListener(
            "error",
            (event) => {
                // Same-origin filename filter — drops extension/third-party-script noise and
                // censored cross-origin "Script error." events. Assumes app bundles are served
                // from the page's own origin.
                if (!event.filename?.startsWith(window.location.origin)) {
                    return
                }

                uncaught(new ArchitectError(event.error ?? event.message, "window"))
            },
            { signal },
        )

        window.addEventListener(
            "unhandledrejection",
            (event) => {
                uncaught(new ArchitectError(event.reason, "promise"))
            },
            { signal },
        )
    }

    destroy(): void {
        this.controller?.abort()
    }
}
