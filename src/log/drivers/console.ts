import { type Contract, type LogLevel, levels } from "../contract"

/** Native console method each severity writes through; the console has no notice or critical. */
const OUTPUT = {
    debug: "debug",
    info: "info",
    notice: "info",
    warn: "warn",
    error: "error",
    critical: "error",
    alert: "error",
    emergency: "error",
} as const satisfies Record<LogLevel, "debug" | "info" | "warn" | "error">

export default class ConsoleLogger implements Contract {
    protected threshold: number

    constructor(level: LogLevel = "debug") {
        this.threshold = levels.indexOf(level)
    }

    debug(message: string, context?: Record<string, unknown>): void {
        this.write("debug", message, context)
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.write("info", message, context)
    }

    notice(message: string, context?: Record<string, unknown>): void {
        this.write("notice", message, context)
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.write("warn", message, context)
    }

    error(message: string, context?: Record<string, unknown>): void {
        this.write("error", message, context)
    }

    critical(message: string, context?: Record<string, unknown>): void {
        this.write("critical", message, context)
    }

    alert(message: string, context?: Record<string, unknown>): void {
        this.write("alert", message, context)
    }

    emergency(message: string, context?: Record<string, unknown>): void {
        this.write("emergency", message, context)
    }

    /**
     * Writes to the native console when the level meets or exceeds the configured threshold.
     */
    protected write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (levels.indexOf(level) >= this.threshold) {
            console[OUTPUT[level]](message, ...this.spread(context))
        }
    }

    /**
     * Returns the context as a single-element array, or an empty array when absent.
     */
    protected spread(context?: Record<string, unknown>): unknown[] {
        return context !== undefined ? [context] : []
    }
}
