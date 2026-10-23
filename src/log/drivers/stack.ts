import type { Contract, LogLevel } from "../contract"

export default class StackLogger implements Contract {
    constructor(protected drivers: Contract[]) {}

    debug(message: string, context?: Record<string, unknown>): void {
        this.dispatch("debug", message, context)
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.dispatch("info", message, context)
    }

    notice(message: string, context?: Record<string, unknown>): void {
        this.dispatch("notice", message, context)
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.dispatch("warn", message, context)
    }

    error(message: string, context?: Record<string, unknown>): void {
        this.dispatch("error", message, context)
    }

    critical(message: string, context?: Record<string, unknown>): void {
        this.dispatch("critical", message, context)
    }

    alert(message: string, context?: Record<string, unknown>): void {
        this.dispatch("alert", message, context)
    }

    emergency(message: string, context?: Record<string, unknown>): void {
        this.dispatch("emergency", message, context)
    }

    /**
     * Forwards the log call to each driver in order, swallowing any individual driver errors.
     */
    protected dispatch(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        for (const driver of this.drivers) {
            try {
                driver[level](message, context)
            } catch {
                // swallow — a logging failure must not crash the application
            }
        }
    }
}
