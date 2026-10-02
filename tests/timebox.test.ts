import { describe, expect, spyOn, test } from "bun:test"
import { Timebox } from "@/support/timebox"

// Timer slop cuts both ways: allow a couple of ms under the floor, and a generous
// ceiling so a busy CI box doesn't fail the "didn't wait extra" assertions.
const SLOP = 3

const elapsed = async (fn: () => Promise<unknown>): Promise<number> => {
    const began = performance.now()
    await fn()
    return performance.now() - began
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("Timebox", () => {
    test("holds a fast callback to the floor", async () => {
        const took = await elapsed(async () => {
            expect(await Timebox.make(50, () => "ok").run()).toBe("ok")
        })

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("awaits async callbacks", async () => {
        expect(await Timebox.make(1, async () => "async").run()).toBe("async")
    })

    test("does not delay a callback that overruns the floor", async () => {
        const took = await elapsed(() => Timebox.make(20, () => wait(60)).run())

        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
        expect(took).toBeLessThan(150)
    })

    test("a tuple window delays the start of the callback", async () => {
        const began = performance.now()
        let startedAt = 0

        await Timebox.make([40, 80], () => {
            startedAt = performance.now() - began
        }).run()

        expect(startedAt).toBeGreaterThanOrEqual(40 - SLOP)
    })

    test("a tuple window resolves no earlier than the end", async () => {
        const took = await elapsed(() => Timebox.make([20, 80], () => "ok").run())

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
    })

    test("the end is measured from the start of the window, not the callback", async () => {
        // Starts at 20ms, runs 30ms, so the callback ends at ~50ms and is padded to 80ms.
        const took = await elapsed(() => Timebox.make([20, 80], () => wait(30)).run())

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
        expect(took).toBeLessThan(80 + 100)
    })

    test("a callback overrunning the end of a tuple window resolves promptly", async () => {
        const took = await elapsed(() => Timebox.make([10, 30], () => wait(60)).run())

        expect(took).toBeGreaterThanOrEqual(70 - SLOP)
        expect(took).toBeLessThan(200)
    })

    test("an end of false returns as soon as the callback settles", async () => {
        const took = await elapsed(() => Timebox.make([40, false], () => "ok").run())

        expect(took).toBeGreaterThanOrEqual(40 - SLOP)
        expect(took).toBeLessThan(40 + 100)
    })

    test("throws the callback error only after the window elapsed", async () => {
        const began = performance.now()

        await expect(
            Timebox.make(50, () => {
                throw new Error("boom")
            }).run(),
        ).rejects.toThrow("boom")

        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("returnEarly() from inside a mutable callback skips the trailing wait", async () => {
        const took = await elapsed(() =>
            Timebox.make(100, (timebox) => {
                timebox.returnEarly()
            })
                .mutable()
                .run(),
        )

        expect(took).toBeLessThan(50)
    })

    test("returnEarly() set before running drops the floor but keeps the start delay", async () => {
        const took = await elapsed(() =>
            Timebox.make([40, 300], () => "ok")
                .returnEarly()
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(40 - SLOP)
        expect(took).toBeLessThan(200)
    })

    test("a window of false or zero has no floor", async () => {
        expect(await elapsed(() => Timebox.make(false, () => "ok").run())).toBeLessThan(50)
        expect(await elapsed(() => Timebox.make(0, () => "ok").run())).toBeLessThan(50)
        expect(await elapsed(() => Timebox.make([0, 0], () => "ok").run())).toBeLessThan(50)
    })

    test("deadline() rejects a callback that hasn't returned in time", async () => {
        const began = performance.now()

        await expect(
            Timebox.make(30, () => wait(500))
                .deadline(60)
                .run(),
        ).rejects.toMatchObject({ name: "TimeoutError" })

        const took = performance.now() - began
        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
        expect(took).toBeLessThan(300)
    })

    test("deadline() aborts the signal handed to the callback", async () => {
        let signal: AbortSignal | undefined

        await expect(
            Timebox.make(20, (timebox) => {
                signal = timebox.signal
                return wait(300)
            })
                .deadline()
                .run(),
        ).rejects.toThrow("deadline")

        expect(signal?.aborted).toBe(true)
        expect(signal?.reason.name).toBe("TimeoutError")
    })

    test("deadline() can't be sooner than the end of the window", async () => {
        expect(() => Timebox.make(200, () => "ok").deadline(50)).toThrow(RangeError)

        // Nor can the window be pushed out past a deadline already set.
        await expect(
            Timebox.make(20, () => "ok")
                .deadline()
                .extend(50)
                .run(),
        ).rejects.toThrow(RangeError)
    })

    test("deadline(false) and deadline(0) lift the deadline", async () => {
        for (const off of [false, 0] as const) {
            expect(
                await Timebox.make(10, () => wait(40).then(() => "ok"))
                    .deadline()
                    .deadline(off)
                    .run(),
            ).toBe("ok")
        }
    })

    test("clears the deadline timer once the callback beats it", async () => {
        const cleared = spyOn(globalThis, "clearTimeout")

        try {
            await Timebox.make(10, () => "ok")
                .deadline(5_000)
                .run()

            expect(cleared).toHaveBeenCalled()
        } finally {
            cleared.mockRestore()
        }
    })

    test("deadline() leaves a callback that returns in time alone", async () => {
        expect(
            await Timebox.make(50, () => "ok")
                .deadline(100)
                .run(),
        ).toBe("ok")
    })

    test("deadline() defaults to the end of the window", async () => {
        await expect(
            Timebox.make([0, 50], () => wait(300))
                .deadline()
                .run(),
        ).rejects.toThrow("deadline")
    })

    test("deadline() has nothing to default to without a window end", async () => {
        expect(() => Timebox.make([50, false], () => "ok").deadline()).toThrow(RangeError)
    })

    test("the deadline is measured from the start of the window, not the callback", async () => {
        // Delayed 40ms, so a 60ms deadline leaves the callback only ~20ms to return.
        await expect(
            Timebox.make([40, 50], () => wait(100))
                .deadline(60)
                .run(),
        ).rejects.toThrow("deadline")
    })

    test("delay() moves the start of the window", async () => {
        const took = await elapsed(() =>
            Timebox.make(10, () => "ok")
                .delay(60)
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
    })

    test("when() runs the callback while the condition is truthy", async () => {
        expect(
            await Timebox.make(10, () => "ok")
                .when(() => true)
                .run(),
        ).toBe("ok")
    })

    test("when() aborts before the callback while the condition is falsy", async () => {
        let calls = 0
        const began = performance.now()

        await expect(
            Timebox.make(50, () => ++calls)
                .when(() => false)
                .run(),
        ).rejects.toMatchObject({ name: "AbortError" })

        // The abort is still held to the end of the window, like any other failure.
        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)
        expect(calls).toBe(0)
    })

    test("when() is read once the start delay is over, not before", async () => {
        let ready = false
        setTimeout(() => {
            ready = true
        }, 20)

        expect(
            await Timebox.make([50, 60], () => "ok")
                .when(() => ready)
                .run(),
        ).toBe("ok")
    })

    test("unless() inverts the condition", async () => {
        await expect(
            Timebox.make(10, () => "ok")
                .unless(() => true)
                .run(),
        ).rejects.toMatchObject({ name: "AbortError" })

        expect(
            await Timebox.make(10, () => "ok")
                .unless(() => false)
                .run(),
        ).toBe("ok")
    })

    test("every condition has to hold for the callback to run", async () => {
        await expect(
            Timebox.make(10, () => "ok")
                .when(() => true)
                .when(() => false)
                .run(),
        ).rejects.toMatchObject({ name: "AbortError" })
    })

    test("a condition that throws rejects the run with what it threw", async () => {
        await expect(
            Timebox.make(10, () => "ok")
                .when(() => {
                    throw new Error("unreadable")
                })
                .run(),
        ).rejects.toThrow("unreadable")
    })

    test("an abort returns early only when returnEarly() was called", async () => {
        const took = await elapsed(() =>
            Timebox.make(200, () => "ok")
                .when(() => false)
                .returnEarly()
                .catch(() => null)
                .run(),
        )

        expect(took).toBeLessThan(100)
    })

    test("dontReturnEarly() restores the waits", async () => {
        const took = await elapsed(() =>
            Timebox.make(50, () => "ok")
                .returnEarly()
                .dontReturnEarly()
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("the window does not start until the timebox is run", async () => {
        const timebox = Timebox.make(60, () => "ok")
        await wait(60)

        const took = await elapsed(() => timebox.run())

        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
    })

    test("runs the callback again on every run()", async () => {
        let calls = 0
        const timebox = Timebox.make(1, () => ++calls)

        expect(await timebox.run()).toBe(1)
        expect(await timebox.run()).toBe(2)
        expect(calls).toBe(2)
    })

    test("then() queues a handler instead of running the timebox", async () => {
        let calls = 0
        const timebox = Timebox.make(1, () => ++calls).then((value) => value * 10)
        await wait(20)

        expect(calls).toBe(0)
        expect(await timebox.run()).toBe(10)
    })

    test("catch() handles a rejection after the window", async () => {
        const began = performance.now()
        const caught = await Timebox.make(50, () => {
            throw new Error("boom")
        })
            .catch((error: Error) => error.message)
            .run()

        expect(caught).toBe("boom")
        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("finally() runs once the window closes", async () => {
        let closed = false

        expect(
            await Timebox.make(20, () => "ok")
                .finally(() => {
                    closed = true
                })
                .run(),
        ).toBe("ok")
        expect(closed).toBe(true)
    })

    test("queued handlers replay in order on every run", async () => {
        const seen: number[] = []
        let calls = 0
        const timebox = Timebox.make(1, () => ++calls)
            .then((value) => {
                seen.push(value)
                return value
            })
            .finally(() => seen.push(0))

        await timebox.run()
        await timebox.run()

        expect(seen).toEqual([1, 0, 2, 0])
    })

    test("polling() aborts the callback once a condition flips mid-run", async () => {
        let allowed = true
        let signal: AbortSignal | undefined
        setTimeout(() => {
            allowed = false
        }, 30)

        const began = performance.now()
        await expect(
            Timebox.make(100, (timebox) => {
                signal = timebox.signal
                return wait(500)
            })
                .when(() => allowed)
                .polling()
                .run(),
        ).rejects.toMatchObject({ name: "AbortError" })

        // Aborted at ~30ms, cancelled through the signal, and still held to the floor.
        const took = performance.now() - began
        expect(took).toBeGreaterThanOrEqual(100 - SLOP)
        expect(took).toBeLessThan(400)
        expect(signal?.aborted).toBe(true)
    })

    test("when() takes the polling interval as its second argument", async () => {
        let allowed = true
        setTimeout(() => {
            allowed = false
        }, 20)

        await expect(
            Timebox.make(10, () => wait(200))
                .unless(() => !allowed, 5)
                .run(),
        ).rejects.toMatchObject({ name: "AbortError" })
    })

    test("without polling the conditions are read only once", async () => {
        let allowed = true
        setTimeout(() => {
            allowed = false
        }, 20)

        expect(
            await Timebox.make(10, () => wait(60).then(() => "ok"))
                .when(() => allowed)
                .run(),
        ).toBe("ok")
    })

    test("polling(false) and polling(0) turn polling back off", async () => {
        for (const off of [false, 0] as const) {
            let allowed = true
            setTimeout(() => {
                allowed = false
            }, 20)

            expect(
                await Timebox.make(10, () => wait(60).then(() => "ok"))
                    .when(() => allowed, 5)
                    .polling(off)
                    .run(),
            ).toBe("ok")
        }
    })

    test("a polled callback still finishes when nothing flips", async () => {
        let signal: AbortSignal | undefined

        expect(
            await Timebox.make(10, (timebox) => {
                signal = timebox.signal
                return wait(40).then(() => "ok")
            })
                .when(() => true, 5)
                .run(),
        ).toBe("ok")
        expect(signal?.aborted).toBe(false)
    })

    test("each run aborts a signal of its own", async () => {
        const signals: AbortSignal[] = []
        let allowed = false
        const timebox = Timebox.make(1, (box) => {
            signals.push(box.signal)
        })
            .when(() => allowed)
            .catch(() => null)

        await timebox.run()
        allowed = true
        await timebox.run()

        expect(signals).toHaveLength(1)
        expect(signals[0].aborted).toBe(false)
        expect(timebox.signal.aborted).toBe(false)
    })

    test("elapsed counts from the run, start delay included", async () => {
        const timebox = Timebox.make([30, 40], (box) => box.elapsed)

        expect(timebox.elapsed).toBe(0)
        expect(await timebox.run()).toBeGreaterThanOrEqual(30 - SLOP)
    })

    test("duration() replaces the end of the window", async () => {
        const took = await elapsed(() =>
            Timebox.make(200, () => "ok")
                .duration(50)
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
        expect(took).toBeLessThan(150)
    })

    test("duration() is measured from the delayed start", async () => {
        const took = await elapsed(() =>
            Timebox.make(200, () => "ok")
                .delay(30)
                .duration(50)
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
        expect(took).toBeLessThan(150)
    })

    test("extend() pushes the end of the window out", async () => {
        const took = await elapsed(() =>
            Timebox.make(30, () => "ok")
                .extend(40)
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(70 - SLOP)
    })

    test("the timebox handed to the callback is immutable", async () => {
        await expect(
            Timebox.make(10, (timebox) => {
                timebox.extend(50)
            }).run(),
        ).rejects.toThrow(TypeError)
    })

    test("a callback that returns the timebox is rejected rather than hanging", async () => {
        await expect(
            Timebox.make(10, (timebox) => timebox.returnEarly())
                .mutable()
                .run(),
        ).rejects.toThrow("returned the timebox")
    })

    test("returnEarly() and dontReturnEarly() are closed to the callback of an immutable timebox", async () => {
        const began = performance.now()

        await expect(
            Timebox.make(50, (timebox) => {
                timebox.returnEarly()
            }).run(),
        ).rejects.toThrow("immutable")

        // The refused returnEarly() didn't take: the rejection is still held to the floor.
        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)

        await expect(
            Timebox.make(10, (timebox) => {
                timebox.dontReturnEarly()
            }).run(),
        ).rejects.toThrow(TypeError)
    })

    test("mutable() lets the callback extend the window it is running in", async () => {
        const took = await elapsed(() =>
            Timebox.make(20, (timebox) => {
                timebox.extend(60)
            })
                .mutable()
                .run(),
        )

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
    })

    test("immutable() undoes mutable()", async () => {
        await expect(
            Timebox.make(10, (timebox) => {
                timebox.extend(50)
            })
                .mutable()
                .immutable()
                .run(),
        ).rejects.toThrow(TypeError)
    })

    test("the timebox is mutable again once the run is over", async () => {
        const timebox = Timebox.make(10, () => "ok")
        await timebox.run()

        expect(() => timebox.extend(10)).not.toThrow()
    })

    test("returnEarly() from a callback does not leak into the next run", async () => {
        let first = true
        const thunk = Timebox.make(100, (timebox) => {
            if (first) timebox.returnEarly()
            first = false
        })
            .mutable()
            .wrap()

        expect(await elapsed(thunk)).toBeLessThan(50)
        expect(await elapsed(thunk)).toBeGreaterThanOrEqual(100 - SLOP)
    })

    test("a window a callback reshaped does not leak into the next run", async () => {
        let first = true
        const thunk = Timebox.make(20, (timebox) => {
            if (first) timebox.extend(100)
            first = false
        })
            .mutable()
            .wrap()

        expect(await elapsed(thunk)).toBeGreaterThanOrEqual(120 - SLOP)
        expect(await elapsed(thunk)).toBeLessThan(100)
    })

    test("a run finishing does not unlock another still in flight", async () => {
        let slowest = true
        let caught: unknown = "no throw"

        const timebox = Timebox.make(10, async (box) => {
            if (!slowest) return "fast"

            slowest = false
            await wait(60) // still running when the fast run finishes
            try {
                box.extend(1)
            } catch (error) {
                caught = error
            }

            return "slow"
        })

        const slow = timebox.run()
        await wait(10)
        await timebox.run()
        await slow

        expect(String(caught)).toContain("immutable")
    })

    test("wrap() returns a thunk that runs the timebox when invoked", async () => {
        const callback = Timebox.make(50, () => "ok").wrap()
        const took = await elapsed(async () => {
            expect(await callback()).toBe("ok")
        })

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("wrap() hands the callback whatever the closure is called with", async () => {
        const onClick = Timebox.make(1, (timebox, event: { type: string }, count: number) => {
            return `${event.type}:${count}:${timebox.elapsed >= 0}`
        }).wrap()

        expect(await onClick({ type: "click" }, 2)).toBe("click:2:true")
    })

    test("wrap() does not run until the thunk is invoked", async () => {
        let calls = 0
        Timebox.make(1, () => ++calls).wrap()
        await wait(20)

        expect(calls).toBe(0)
    })

    test("the wrapped thunk runs the window afresh on every invocation", async () => {
        let calls = 0
        const callback = Timebox.make(20, () => ++calls).wrap()

        expect(await callback()).toBe(1)
        expect(await callback()).toBe(2)
        expect(calls).toBe(2)
    })

    test("rejects an invalid window on construction", () => {
        expect(() => Timebox.make([-1, 5], () => "ok")).toThrow(RangeError)
        expect(() => Timebox.make([10, 5], () => "ok")).toThrow(RangeError)
        expect(() => Timebox.make(-1, () => "ok")).toThrow(RangeError)
    })
})
