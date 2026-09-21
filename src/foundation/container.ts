import type { Container as Contract, Identifier } from "../container/contract"

/**
 * The container of the Application that most recently ran. Facades are created at module load —
 * long before any Application exists — so they resolve through make(), rather than holding a
 * container reference of their own. run() publishes here via setContainer(); stop() clears it.
 */
let current: Contract | null = null

export function setContainer(container: Contract | null): void {
    current = container
}

export function getContainer(): Contract | null {
    return current
}

export function make<T>(identifier: Identifier<T>): T {
    const container = getContainer()
    if (!container) {
        throw new Error("Application container is not available. Call run() first.")
    }

    return container.make<T>(identifier)
}
