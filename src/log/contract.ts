/**
 * Monolog / RFC 5424 severities, least to most severe. `warn` stands in for Monolog's `warning`
 * to match the native console.
 */
export const levels = ["debug", "info", "notice", "warn", "error", "critical", "alert", "emergency"] as const

export type LogLevel = (typeof levels)[number]

export interface Contract {
    /**
     * Log a debug-level message for detailed diagnostic information.
     */
    debug(message: string, context?: Record<string, unknown>): void

    /**
     * Log an informational message about normal application flow.
     */
    info(message: string, context?: Record<string, unknown>): void

    /**
     * Log a normal but significant event.
     */
    notice(message: string, context?: Record<string, unknown>): void

    /**
     * Log a warning about a recoverable or unexpected condition.
     */
    warn(message: string, context?: Record<string, unknown>): void

    /**
     * Log an error indicating a failure that requires attention.
     */
    error(message: string, context?: Record<string, unknown>): void

    /**
     * Log a critical condition, such as an unavailable component or an unexpected exception.
     */
    critical(message: string, context?: Record<string, unknown>): void

    /**
     * Log a condition that needs action immediately, such as the whole site being down.
     */
    alert(message: string, context?: Record<string, unknown>): void

    /**
     * Log that the system is unusable.
     */
    emergency(message: string, context?: Record<string, unknown>): void
}
