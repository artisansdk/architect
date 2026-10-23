import { describe, expect, mock, test } from "bun:test"
import ArchitectError from "@/errors/error"
import ErrorHandler from "@/errors/handler"
import type { Contract as Logger } from "@/log/contract"
import LogError from "@/log/error"
import LogManager from "@/log/manager"

const logger = (error = mock()) => ({ error }) as unknown as Logger

describe("ErrorHandler", () => {
    test("reports to the log and rethrows by default", () => {
        const error = mock()
        const e = new Error("boom")
        expect(() => new ErrorHandler(logger(error)).handle(e)).toThrow(e)
        expect(error).toHaveBeenCalledWith("boom", { error: e })
    })

    test("uses report() and render() when the error implements them", () => {
        const error = mock()
        const e = Object.assign(new Error("boom"), { report: mock(), render: mock(() => "rendered") })
        expect(new ErrorHandler(logger(error)).handle(e)).toBe("rendered")
        expect(e.report).toHaveBeenCalledTimes(1)
        expect(error).not.toHaveBeenCalled()
    })

    test("logs at the level from level(), falling back to error for an unknown level", () => {
        const log = { warn: mock(), error: mock() } as unknown as Logger
        const handler = new ErrorHandler(log)
        handler.report(Object.assign(new Error("slow"), { level: () => "warn" }))
        handler.report(Object.assign(new Error("odd"), { level: () => "notice" }))
        expect(log.warn).toHaveBeenCalledTimes(1)
        expect(log.error).toHaveBeenCalledTimes(1)
    })

    test("skips reporting when ignore() is true, but still renders", () => {
        const error = mock()
        const e = Object.assign(new Error("noise"), { ignore: () => true, report: mock(), render: () => "rendered" })
        expect(new ErrorHandler(logger(error)).handle(e)).toBe("rendered")
        expect(e.report).not.toHaveBeenCalled()
        expect(error).not.toHaveBeenCalled()
    })

    test("reads concerns from the original error inside an ArchitectError", () => {
        const log = { warn: mock(), error: mock() } as unknown as Logger
        const handler = new ErrorHandler(log)
        handler.report(new ArchitectError(Object.assign(new Error("noise"), { ignore: () => true }), "window"))
        handler.report(new ArchitectError(Object.assign(new Error("slow"), { level: () => "warn" }), "promise"))
        expect(log.error).not.toHaveBeenCalled()
        expect(log.warn).toHaveBeenCalledTimes(1)
    })

    test("a failing logger is swallowed via LogError, the original error still renders", () => {
        const manager = new LogManager(
            {
                broken: logger(
                    mock(() => {
                        throw new Error("disk full")
                    }),
                ),
            },
            "broken",
        )
        const e = Object.assign(new Error("boom"), { render: () => "rendered" })
        expect(new ErrorHandler(manager).handle(e)).toBe("rendered")
    })
})

describe("LogError", () => {
    test("wraps driver failures, renders as a no-op, and is not reportable", () => {
        const cause = new Error("disk full")
        const manager = new LogManager(
            {
                broken: logger(
                    mock(() => {
                        throw cause
                    }),
                ),
            },
            "broken",
        )
        let thrown: unknown
        try {
            manager.error("x")
        } catch (e) {
            thrown = e
        }
        expect(thrown).toBeInstanceOf(LogError)
        expect((thrown as LogError).cause).toBe(cause)
        expect((thrown as LogError).render()).toBeUndefined()
        expect("report" in (thrown as object)).toBe(false)
    })
})
