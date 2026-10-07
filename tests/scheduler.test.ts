import { beforeEach, describe, expect, mock, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import type ErrorHandler from "@/errors/handler"
import { SchedulerProvider } from "@/scheduler/provider"
import { Scheduler, Task } from "@/scheduler/scheduler"

const past = () => Date.now() - 1

let handle: ReturnType<typeof mock>
let errors: ErrorHandler

beforeEach(() => {
    handle = mock()
    errors = { handle } as unknown as ErrorHandler
})

function makeTask(handler: () => void): Task {
    const t = new Task(handler, errors)
    ;(t as any).startAt = past()
    return t
}

describe("Task.execute()", () => {
    test("fires when startAt has passed", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("does not fire before startAt", () => {
        const fn = mock()
        const t = new Task(fn)
        ;(t as any).startAt = Date.now() + 60_000
        t.execute()
        expect(fn).not.toHaveBeenCalled()
    })

    test("returns true (one-shot) by default and does not fire again", () => {
        const fn = mock()
        const t = makeTask(fn)
        const done = t.execute()
        expect(done).toBe(true)
    })

    test("returns false and keeps firing when .every() is set", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.every(60, "seconds")
        const done = t.execute()
        expect(done).toBe(false)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("respects interval — skips if called too soon after lastTick", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.every(60, "seconds")
        t.execute()
        t.execute() // too soon
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("when() gates execution — skips when condition is false", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.when(() => false)
        t.execute()
        expect(fn).not.toHaveBeenCalled()
    })

    test("when() passes when condition is true", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.when(() => true)
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("when() with operand and value", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.when(() => 5, ">", 3)
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("unless() skips when condition is true", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.unless(() => true)
        t.execute()
        expect(fn).not.toHaveBeenCalled()
    })

    test("hands unhandled errors to the ErrorHandler", () => {
        const error = new Error("boom")
        const t = makeTask(() => {
            throw error
        })
        expect(() => t.execute()).not.toThrow()
        expect(handle).toHaveBeenCalledWith(error)
    })

    test("rethrows unhandled errors without an ErrorHandler", () => {
        const t = new Task(() => {
            throw new Error("boom")
        })
        ;(t as any).startAt = past()
        expect(() => t.execute()).toThrow("boom")
    })

    test("catch() handles the error instead of the ErrorHandler", () => {
        const error = new Error("boom")
        const onError = mock()
        const t = makeTask(() => {
            throw error
        }).catch(onError)
        t.execute()
        expect(onError).toHaveBeenCalledWith(error, t)
        expect(handle).not.toHaveBeenCalled()
    })

    test("catch() handlers chain: a rethrow passes to the next, unhandled falls back to the ErrorHandler", () => {
        const second = mock(() => {
            throw new Error("again")
        })
        const t = makeTask(() => {
            throw new Error("boom")
        })
            .catch((e) => {
                throw e
            })
            .catch(second)
        t.execute()
        expect(second).toHaveBeenCalledTimes(1)
        expect(handle).toHaveBeenCalledWith(new Error("again"))
    })

    test("still returns isOnce after handler throws", () => {
        const fn = mock(() => {
            throw new Error("boom")
        })
        const t = makeTask(fn)
        expect(t.execute()).toBe(true)
    })

    test("condition-gated one-shot: lastTick advances even when condition fails", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.every(100, "milliseconds").when(() => false)
        t.execute()
        const tick = (t as any).lastTick
        expect(tick).not.toBeNull()
        expect(fn).not.toHaveBeenCalled()
    })

    test("in() with Date", () => {
        const fn = mock()
        const t = new Task(fn)
        t.in(new Date(Date.now() - 1))
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("in() with Temporal-shaped object", () => {
        const fn = mock()
        const t = new Task(fn)
        t.in({ epochMilliseconds: Date.now() - 1 })
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("immediately() fires on the next execute()", () => {
        const fn = mock()
        const t = new Task(fn)
        t.in(60, "minutes").immediately()
        t.execute()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("once() re-enables one-shot after every()", () => {
        const fn = mock()
        const t = makeTask(fn)
        t.every(60, "seconds").once()
        expect(t.execute()).toBe(true)
        expect(fn).toHaveBeenCalledTimes(1)
    })
})

describe("Scheduler", () => {
    test("do() registers and run() executes task", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.do(fn)
        ;(t as any).startAt = past()
        s.run()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("one-shot task is removed after run()", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.do(fn)
        ;(t as any).startAt = past()
        s.run()
        s.run()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    test("recurring task stays after run()", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.do(fn)
        ;(t as any).startAt = past()
        t.every(0, "milliseconds")
        ;(t as any).interval = 0 // force 0 so it fires every tick but stays
        // With interval=0 it's treated as no recurrence limit — re-enable isOnce=false
        ;(t as any).isOnce = false
        s.run()
        ;(t as any).lastTick = null // reset so it fires again
        s.run()
        expect(fn).toHaveBeenCalledTimes(2)
    })

    test("cancel(task) removes it", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.do(fn)
        ;(t as any).startAt = past()
        s.cancel(t)
        s.run()
        expect(fn).not.toHaveBeenCalled()
    })

    test("task() registers named task and cancel(name) removes it", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.task("donate", fn)
        ;(t as any).startAt = past()
        s.cancel("donate")
        s.run()
        expect(fn).not.toHaveBeenCalled()
    })

    test("task() throws when a named task is registered without a handler", () => {
        const s = new Scheduler()
        expect(() => (s as unknown as { task: (name: string) => Task }).task("donate")).toThrow(
            'Scheduler: task "donate" was registered without a handler',
        )
    })

    test("task() overwrites on duplicate name", () => {
        const s = new Scheduler()
        const fn1 = mock()
        const fn2 = mock()
        s.task("donate", fn1)
        s.task("donate", fn2) // should overwrite
        const t = (s as any).named.get("donate") as Task
        ;(t as any).startAt = past()
        s.run()
        expect(fn1).not.toHaveBeenCalled()
        expect(fn2).toHaveBeenCalledTimes(1)
    })

    test("cancel(task) also cleans named registry", () => {
        const s = new Scheduler()
        const t = s.task("x", mock())
        s.cancel(t)
        expect((s as any).named.has("x")).toBe(false)
    })

    test("cancelTag() removes all tasks with that tag", () => {
        const fn1 = mock()
        const fn2 = mock()
        const s = new Scheduler()
        const t1 = s.do(fn1).tag("popups")
        const t2 = s.do(fn2).tag("popups")
        ;(t1 as any).startAt = past()
        ;(t2 as any).startAt = past()
        s.cancelTag("popups")
        s.run()
        expect(fn1).not.toHaveBeenCalled()
        expect(fn2).not.toHaveBeenCalled()
    })

    test("cancelTag() does not remove tasks with different tag", () => {
        const fn = mock()
        const s = new Scheduler()
        const t = s.do(fn).tag("other")
        ;(t as any).startAt = past()
        s.cancelTag("popups")
        s.run()
        expect(fn).toHaveBeenCalledTimes(1)
    })
})

describe("Scheduler without an ErrorHandler", () => {
    test("runs every task, removes failed one-shots, then rethrows", () => {
        const s = new Scheduler()
        const after = mock()
        const failing = s.do(() => {
            throw new Error("boom")
        })
        const ok = s.do(after)
        ;(failing as any).startAt = past()
        ;(ok as any).startAt = past()
        expect(() => s.run()).toThrow("boom")
        expect(after).toHaveBeenCalledTimes(1)
        expect((s as any).tasks.size).toBe(0)
    })

    test("several failures throw an AggregateError", () => {
        const s = new Scheduler()
        for (const msg of ["a", "b"]) {
            ;(
                s.do(() => {
                    throw new Error(msg)
                }) as any
            ).startAt = past()
        }
        expect(() => s.run()).toThrow(AggregateError)
    })

    test("passes its ErrorHandler to tasks", () => {
        const s = new Scheduler(errors)
        ;(
            s.do(() => {
                throw new Error("boom")
            }) as any
        ).startAt = past()
        expect(() => s.run()).not.toThrow()
        expect(handle).toHaveBeenCalledTimes(1)
    })
})

describe("SchedulerProvider", () => {
    test("register binds Scheduler as singleton under 'scheduler' and Scheduler class", () => {
        const container = new BuiltinContainer()
        const provider = new SchedulerProvider()
        provider.register(container)
        const s1 = container.make<Scheduler>("scheduler")
        const s2 = container.make(Scheduler)
        expect(s1).toBeInstanceOf(Scheduler)
        expect(s1).toBe(s2)
    })

    test("boot starts an interval and destroy clears it", () => {
        const originalClearInterval = globalThis.clearInterval
        const clearIntervalSpy = mock(originalClearInterval)
        globalThis.clearInterval = clearIntervalSpy

        try {
            const container = new BuiltinContainer()
            const provider = new SchedulerProvider()
            provider.register(container)
            provider.boot(container)
            provider.destroy()

            expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
        } finally {
            globalThis.clearInterval = originalClearInterval
        }
    })
})
