export class Timebox<T = unknown> implements PromiseLike<T> {
    protected earlyReturn = false
    protected promise?: Promise<T>

    /**
     * Run a callback within a timing window, measured from the moment the timebox is awaited.
     *
     * A number is a floor: it resolves no sooner than `milliseconds`. A tuple `[start, end]`
     * also delays the callback until `start` has elapsed.
     *
     *     await Timebox.make([50, 200], () => authenticate(email, password))
     */
    static make<T>(
        milliseconds: number | [start: number, end: number],
        callback: (timebox: Timebox<T>) => T | Promise<T>,
    ): Timebox<T> {
        return new Timebox(milliseconds, callback)
    }

    /**
     * Build a timebox around a window and a callback. Nothing runs until it is awaited.
     */
    constructor(
        protected window: number | [start: number, end: number],
        protected callback: (timebox: Timebox<T>) => T | Promise<T>,
    ) {}

    /**
     * Await the timebox, running the callback inside its window.
     *
     * Thenable rather than a `Promise` subclass, so there is no `.catch()` or `.finally()`
     * — await it, or pass both handlers here. The callback runs once however often the
     * timebox is awaited.
     */
    // biome-ignore lint/suspicious/noThenProperty: being awaitable is the point
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): PromiseLike<TResult1 | TResult2> {
        this.promise ??= this.run()

        return this.promise.then(onfulfilled, onrejected)
    }

    /**
     * Pause for the given number of milliseconds.
     *
     * ponytail: setTimeout is the ceiling here — slop is ~1-5ms (nested browser timers clamp
     * to 4ms), so a timebox is a floor, not a precise deadline. Only a busy-wait improves on
     * it, and burning a core to shave milliseconds isn't worth it. Override to fake the clock.
     */
    protected async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Wait out the window around the callback, once the timebox is awaited.
     *
     * The window is measured from here, not from construction, so a timebox can be built
     * and configured before its clock starts. A callback that overruns the window is not
     * delayed further, and one that throws still throws only after the window elapsed —
     * an error is exactly the case whose timing is being hidden.
     */
    protected async run(): Promise<T> {
        const [start, end] = typeof this.window === "number" ? [0, this.window] : this.window
        if (start < 0 || end < start) {
            throw new RangeError(`Invalid timebox window: [${start}, ${end}]`)
        }

        const began = performance.now()
        if (!this.earlyReturn && start > 0) await this.sleep(start)

        let result: T | undefined
        let error: unknown
        let failed = false
        try {
            result = await this.callback(this)
        } catch (e) {
            error = e
            failed = true
        }

        const remainder = end - (performance.now() - began)
        if (!this.earlyReturn && remainder > 0) await this.sleep(remainder)

        if (failed) throw error
        return result as T
    }

    /**
     * Skip the waits that haven't happened yet.
     *
     * Called from inside the callback the leading delay has already elapsed, so only the
     * trailing pad is dropped. Called before the timebox is awaited, both are.
     */
    returnEarly(): this {
        this.earlyReturn = true
        return this
    }

    /**
     * Restore the waits, undoing an earlier `returnEarly()`.
     */
    dontReturnEarly(): this {
        this.earlyReturn = false
        return this
    }
}
