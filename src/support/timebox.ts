export type Window = number | [start: number, end: number]

export type Callback<T> = (timebox: Timebox<T>) => T | PromiseLike<T>

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
    static make<T>(window: Window, callback: Callback<T>): Timebox<T> {
        return new Timebox(window, callback)
    }

    /**
     * Build a timebox around a window and a callback. Nothing runs until it is awaited.
     */
    constructor(
        protected window: Window,
        protected callback: Callback<T>,
    ) {}

    /**
     * Await the timebox, running the callback inside its window.
     *
     * Thenable rather than a `Promise` subclass — `catch()` and `finally()` delegate to
     * the same underlying promise, so the callback runs once however often the timebox
     * is awaited.
     */
    // biome-ignore lint/suspicious/noThenProperty: being awaitable is the point
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): Promise<TResult1 | TResult2> {
        return this.resolve().then(onfulfilled, onrejected)
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
     * Normalize the value into the expected window.
     */
    protected normalize(value: number | [start: number, end: number]) {
        const [start, end] = typeof value === "number" ? [0, value] : value

        if (start < 0 || end < start) {
            throw new RangeError(`Invalid timebox window: [${start}, ${end}]`)
        }

        return [start, end]
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
        const [start, end] = this.normalize(this.window)

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
     * Resolve one promise behind `then()`, `catch()` and `finally()`, started on first use.
     */
    protected resolve(): Promise<T> {
        return (this.promise ??= this.run())
    }

    /**
     * Wrap the timebox in a thunk that runs it when invoked.
     *
     * For handing a timebox to something that takes a callback:
     *
     *     setState(state, Timebox.make(100, () => track(state)).wrap())
     *
     * Unlike awaiting the timebox, which runs the callback once and caches the result,
     * the thunk runs the window afresh on every invocation — a callback is expected to
     * be called more than once.
     */
    wrap(): () => Promise<T> {
        return () => this.run()
    }

    /**
     * Handle a rejection.
     */
    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ): Promise<T | TResult> {
        return this.resolve().catch(onrejected)
    }

    /**
     * Run a callback once the window closes.
     */
    finally(onfinally?: (() => void) | undefined | null): Promise<T> {
        return this.resolve().finally(onfinally)
    }

    /**
     * Skip the waits that haven't happened yet.
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
