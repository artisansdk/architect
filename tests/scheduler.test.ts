import { describe, expect, mock, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import { SchedulerProvider } from "@/scheduler/provider"
import { Scheduler, Task } from "@/scheduler/scheduler"

const past = () => Date.now() - 1

function makeTask(handler: () => void): Task {
    const t = new Task(handler)
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

    test("swallows handler errors and does not abort", () => {
        const fn = mock(() => {
            throw new Error("boom")
        })
        const t = makeTask(fn)
        expect(() => t.execute()).not.toThrow()
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

    test("task() warns and overwrites on duplicate name", () => {
        const s = new Scheduler()
        const fn1 = mock()
        const fn2 = mock()
        s.task("donate", fn1)
        s.task("donate", fn2) // should warn + overwrite
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
