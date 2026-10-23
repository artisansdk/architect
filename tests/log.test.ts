import { describe, expect, test } from "bun:test"
import ConfigRepository from "@/config/repository"
import BuiltinContainer from "@/container/adapters/builtin"
import ConsoleLogger from "@/log/drivers/console"
import NullLogger from "@/log/drivers/null"
import StackLogger from "@/log/drivers/stack"
import LogManager from "@/log/manager"
import { LogProvider } from "@/log/provider"

describe("ConsoleLogger", () => {
    test("delegates to native console methods", () => {
        const logger = new ConsoleLogger("debug")
        const calls: string[] = []

        const orig = {
            debug: console.debug,
            info: console.info,
            warn: console.warn,
            error: console.error,
        }

        console.debug = () => calls.push("debug")
        console.info = () => calls.push("info")
        console.warn = () => calls.push("warn")
        console.error = () => calls.push("error")

        try {
            logger.debug("d")
            logger.info("i")
            logger.warn("w")
            logger.error("e")
        } finally {
            Object.assign(console, orig)
        }

        expect(calls).toEqual(["debug", "info", "warn", "error"])
    })

    test("suppresses messages below the threshold", () => {
        const logger = new ConsoleLogger("warn")
        const calls: string[] = []

        const orig = { debug: console.debug, info: console.info, warn: console.warn, error: console.error }
        console.debug = () => calls.push("debug")
        console.info = () => calls.push("info")
        console.warn = () => calls.push("warn")
        console.error = () => calls.push("error")

        try {
            logger.debug("nope")
            logger.info("nope")
            logger.warn("yes")
            logger.error("yes")
        } finally {
            Object.assign(console, orig)
        }

        expect(calls).toEqual(["warn", "error"])
    })

    test("a notice threshold keeps notice and above, routing extra levels to the nearest console method", () => {
        const logger = new ConsoleLogger("notice")
        const calls: string[] = []

        const orig = { debug: console.debug, info: console.info, warn: console.warn, error: console.error }
        console.debug = () => calls.push("debug")
        console.info = () => calls.push("info")
        console.warn = () => calls.push("warn")
        console.error = () => calls.push("error")

        try {
            logger.debug("nope")
            logger.info("nope")
            logger.notice("n")
            logger.warn("w")
            logger.error("e")
            logger.critical("c")
            logger.alert("a")
            logger.emergency("em")
        } finally {
            Object.assign(console, orig)
        }

        expect(calls).toEqual(["info", "warn", "error", "error", "error", "error"])
    })

    test("passes context as second argument", () => {
        const logger = new ConsoleLogger("debug")
        const received: unknown[] = []

        const orig = console.info
        console.info = (_msg: string, ...args: unknown[]) => received.push(...args)

        try {
            logger.info("msg", { userId: 42 })
        } finally {
            console.info = orig
        }

        expect(received).toEqual([{ userId: 42 }])
    })
})

describe("NullLogger", () => {
    test("discards all messages without throwing", () => {
        const logger = new NullLogger()
        expect(() => {
            logger.debug("d")
            logger.info("i")
            logger.warn("w")
            logger.error("e")
        }).not.toThrow()
    })
})

describe("StackLogger", () => {
    test("fans out to all drivers in order", () => {
        const calls: string[] = []
        const a = {
            debug: () => calls.push("a:debug"),
            info: () => calls.push("a:info"),
            warn: () => {},
            error: () => {},
        }
        const b = {
            debug: () => calls.push("b:debug"),
            info: () => calls.push("b:info"),
            warn: () => {},
            error: () => {},
        }
        const stack = new StackLogger([a, b])

        stack.debug("msg")
        stack.info("msg")

        expect(calls).toEqual(["a:debug", "b:debug", "a:info", "b:info"])
    })

    test("swallows errors from individual drivers", () => {
        const throwing = {
            debug: () => {
                throw new Error("boom")
            },
            info: () => {
                throw new Error("boom")
            },
            warn: () => {
                throw new Error("boom")
            },
            error: () => {
                throw new Error("boom")
            },
        }
        const stack = new StackLogger([throwing])

        expect(() => stack.info("msg")).not.toThrow()
        expect(() => stack.error("msg")).not.toThrow()
    })

    test("warn and error fan out to all drivers", () => {
        const calls: string[] = []
        const a = {
            debug: () => {},
            info: () => {},
            warn: () => calls.push("a:warn"),
            error: () => calls.push("a:error"),
        }
        const b = {
            debug: () => {},
            info: () => {},
            warn: () => calls.push("b:warn"),
            error: () => calls.push("b:error"),
        }
        const stack = new StackLogger([a, b])
        stack.warn("msg")
        stack.error("msg")
        expect(calls).toEqual(["a:warn", "b:warn", "a:error", "b:error"])
    })
})

describe("LogManager", () => {
    test("defaults to console driver with debug threshold", () => {
        const manager = LogManager.fromConfig(new ConfigRepository({}))
        expect(manager).toBeTruthy()
        expect(() => manager.info("hello")).not.toThrow()
    })

    test("respects logging.default config", () => {
        const manager = LogManager.fromConfig(new ConfigRepository({ logging: { default: "null" } }))
        expect(() => manager.error("silent")).not.toThrow()
    })

    test("configures console threshold from logging.drivers.console.level", () => {
        const calls: string[] = []
        const manager = LogManager.fromConfig(
            new ConfigRepository({
                logging: { default: "console", drivers: { console: { level: "error" } } },
            }),
        )

        const orig = { debug: console.debug, info: console.info, warn: console.warn, error: console.error }
        console.debug = () => calls.push("debug")
        console.info = () => calls.push("info")
        console.warn = () => calls.push("warn")
        console.error = () => calls.push("error")

        try {
            manager.debug("nope")
            manager.info("nope")
            manager.warn("nope")
            manager.error("yes")
        } finally {
            Object.assign(console, orig)
        }

        expect(calls).toEqual(["error"])
    })

    test("stack driver fans out to configured drivers", () => {
        const calls: string[] = []
        const manager = LogManager.fromConfig(
            new ConfigRepository({
                logging: {
                    default: "stack",
                    drivers: { stack: { drivers: ["null"] } },
                },
            }),
        )

        manager.extend("null", (_cfg) => ({
            debug: () => calls.push("null:debug"),
            info: () => calls.push("null:info"),
            warn: () => {},
            error: () => {},
        }))

        manager.use("stack")
        manager.debug("msg")

        expect(calls).toContain("null:debug")
    })

    test("custom driver registered via extend()", () => {
        const calls: string[] = []
        const manager = LogManager.fromConfig(new ConfigRepository({ logging: { default: "custom" } }))

        manager.extend("custom", (_cfg) => ({
            debug: (msg: string) => calls.push(`debug:${msg}`),
            info: (msg: string) => calls.push(`info:${msg}`),
            warn: () => {},
            error: () => {},
        }))

        manager.info("hello")
        expect(calls).toEqual(["info:hello"])
    })

    test("warn and error delegate to the active driver", () => {
        const calls: string[] = []
        const manager = LogManager.fromConfig(new ConfigRepository({ logging: { default: "spy" } }))
        manager.extend("spy", (_cfg) => ({
            debug: () => {},
            info: () => {},
            warn: (msg: string) => calls.push(`warn:${msg}`),
            error: (msg: string) => calls.push(`error:${msg}`),
        }))
        manager.warn("w")
        manager.error("e")
        expect(calls).toEqual(["warn:w", "error:e"])
    })

    test("throws with 'Log driver' message for unknown driver", () => {
        const manager = LogManager.fromConfig(new ConfigRepository({ logging: { default: "ghost" } }))
        expect(() => manager.debug("msg")).toThrow("Log driver [ghost] is not defined.")
    })
})

describe("LogProvider", () => {
    test("registers LogManager as singleton under 'log' and LogManager class", () => {
        const container = new BuiltinContainer()
        container.instance("config", new ConfigRepository({}))

        const provider = new LogProvider()
        provider.register(container)

        const byString = container.make<LogManager>("log")
        const byClass = container.make(LogManager)

        expect(byString).toBeInstanceOf(LogManager)
        expect(byString).toBe(byClass)
    })
})
