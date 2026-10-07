import type { Renderable } from "../errors/concerns/renderable"

/**
 * Thrown when a log driver fails. Renders as a no-op so a broken logger never crashes the
 * app, and deliberately has no `report()` so the error handler decides what to do with it.
 */
export default class LogError extends Error implements Renderable {
    constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause), { cause })
        this.name = "LogError"
    }

    render(): void {}
}
