import type ConfigRepository from "../config/repository"
import Manager from "../support/manager"
import type { Contract } from "./contract"
import ConsoleLogger from "./drivers/console"
import NullLogger from "./drivers/null"
import StackLogger from "./drivers/stack"
import LogError from "./error"

export default class LogManager extends Manager<Contract, Contract> implements Contract {
    debug(message: string, context?: Record<string, unknown>): void {
        this.write("debug", message, context)
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.write("info", message, context)
    }

    warn(message: string, context?: Record<string, unknown>): void {
        this.write("warn", message, context)
    }

    error(message: string, context?: Record<string, unknown>): void {
        this.write("error", message, context)
    }

    /**
     * Write through the active driver, wrapping any driver failure in a `LogError`.
     */
    protected write(level: keyof Contract, message: string, context?: Record<string, unknown>): void {
        try {
            this.resolve(this.active)[level](message, context)
        } catch (e) {
            throw new LogError(e)
        }
    }

    /**
     * Returns the driver as-is; no wrapping is needed for log drivers.
     */
    protected createDriver(raw: Contract): Contract {
        return raw
    }

    /**
     * Returns the human-readable driver type label used in error messages.
     */
    protected driverType(): string {
        return "Log driver"
    }

    /**
     * Creates a LogManager from the application config, registering the built-in console, null, and stack drivers.
     */
    static fromConfig(config: ConfigRepository): LogManager {
        const active = config.get<string>("logging.default", "console")
        const manager = new LogManager({}, active, config)

        manager.extend("console", (cfg) => {
            const level = cfg.get<"debug" | "info" | "warn" | "error">("logging.drivers.console.level", "debug")
            return new ConsoleLogger(level ?? "debug")
        })

        manager.extend("null", (_cfg) => new NullLogger())

        manager.extend("stack", (cfg) => {
            const names = cfg.get<string[]>("logging.drivers.stack.drivers", []) ?? []
            return new StackLogger(names.map((name) => manager.resolve(name)))
        })

        // Manager constructor only accepts pre-built drivers for active validation;
        // re-set after custom creators are registered so the configured name resolves correctly.
        manager.active = active

        return manager
    }
}
