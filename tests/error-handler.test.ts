import { describe, expect, mock, test } from "bun:test"
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
