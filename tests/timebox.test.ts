import { describe, expect, test } from "bun:test"
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
            expect(await Timebox.make(50, () => "ok")).toBe("ok")
        })

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("awaits async callbacks", async () => {
        expect(await Timebox.make(1, async () => "async")).toBe("async")
    })

    test("does not delay a callback that overruns the floor", async () => {
        const took = await elapsed(() => Timebox.make(20, () => wait(60)).then())

        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
        expect(took).toBeLessThan(150)
    })

    test("a tuple window delays the start of the callback", async () => {
        const began = performance.now()
        let startedAt = 0

        await Timebox.make([40, 80], () => {
            startedAt = performance.now() - began
        })

        expect(startedAt).toBeGreaterThanOrEqual(40 - SLOP)
    })

    test("a tuple window resolves no earlier than the end", async () => {
        const took = await elapsed(() => Timebox.make([20, 80], () => "ok").then())

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
    })

    test("the end is measured from the start of the window, not the callback", async () => {
        // Starts at 20ms, runs 30ms, so the callback ends at ~50ms and is padded to 80ms.
        const took = await elapsed(() => Timebox.make([20, 80], () => wait(30)).then())

        expect(took).toBeGreaterThanOrEqual(80 - SLOP)
        expect(took).toBeLessThan(80 + 100)
    })

    test("a callback overrunning the end of a tuple window resolves promptly", async () => {
        const took = await elapsed(() => Timebox.make([10, 30], () => wait(60)).then())

        expect(took).toBeGreaterThanOrEqual(70 - SLOP)
        expect(took).toBeLessThan(200)
    })

    test("throws the callback error only after the window elapsed", async () => {
        const began = performance.now()

        await expect(
            Timebox.make(50, () => {
                throw new Error("boom")
            }).then(),
        ).rejects.toThrow("boom")

        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("returnEarly() from inside the callback skips the trailing wait", async () => {
        const took = await elapsed(() =>
            Timebox.make(100, (timebox) => {
                timebox.returnEarly()
            }).then(),
        )

        expect(took).toBeLessThan(50)
    })

    test("returnEarly() set before awaiting skips both waits", async () => {
        const took = await elapsed(() =>
            Timebox.make([100, 200], () => "ok")
                .returnEarly()
                .then(),
        )

        expect(took).toBeLessThan(50)
    })

    test("dontReturnEarly() restores the waits", async () => {
        const took = await elapsed(() =>
            Timebox.make(50, () => "ok")
                .returnEarly()
                .dontReturnEarly()
                .then(),
        )

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("the window does not start until the timebox is awaited", async () => {
        const timebox = Timebox.make(60, () => "ok")
        await wait(60)

        const took = await elapsed(() => timebox.then())

        expect(took).toBeGreaterThanOrEqual(60 - SLOP)
    })

    test("runs the callback once however often it is awaited", async () => {
        let calls = 0
        const timebox = Timebox.make(1, () => ++calls)

        expect(await timebox).toBe(1)
        expect(await timebox).toBe(1)
        expect(calls).toBe(1)
    })

    test("catch() handles a rejection after the window", async () => {
        const began = performance.now()
        const caught = await Timebox.make(50, () => {
            throw new Error("boom")
        }).catch((error: Error) => error.message)

        expect(caught).toBe("boom")
        expect(performance.now() - began).toBeGreaterThanOrEqual(50 - SLOP)
    })

    test("finally() runs once the window closes", async () => {
        let closed = false

        expect(
            await Timebox.make(20, () => "ok").finally(() => {
                closed = true
            }),
        ).toBe("ok")
        expect(closed).toBe(true)
    })

    test("then(), catch() and finally() share one run of the callback", async () => {
        let calls = 0
        const timebox = Timebox.make(1, () => ++calls)

        await timebox.then()
        await timebox.catch(() => 0)
        await timebox.finally(() => {})
        await timebox

        expect(calls).toBe(1)
    })

    test("wrap() returns a thunk that runs the timebox when invoked", async () => {
        const callback = Timebox.make(50, () => "ok").wrap()
        const took = await elapsed(async () => {
            expect(await callback()).toBe("ok")
        })

        expect(took).toBeGreaterThanOrEqual(50 - SLOP)
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

    test("rejects an invalid window", async () => {
        await expect(Timebox.make([-1, 5], () => "ok").then()).rejects.toThrow(RangeError)
        await expect(Timebox.make([10, 5], () => "ok").then()).rejects.toThrow(RangeError)
        await expect(Timebox.make(-1, () => "ok").then()).rejects.toThrow(RangeError)
    })
})
