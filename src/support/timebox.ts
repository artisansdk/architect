export type Window = number | [start: number, end: number]

export type Callback<T> = (timebox: Timebox<T>) => T | PromiseLike<T>

type Handler = ["then" | "catch" | "finally", any[]]

export class Timebox<T = unknown> {
    protected earlyReturn = false
    protected handlers: Handler[] = []

    /**
     * Run a callback within a timing window, measured from the moment the timebox is run.
     *
     * A number is a floor: it resolves no sooner than `milliseconds`. A tuple `[start, end]`
     * also delays the callback until `start` has elapsed.
     *
     *     await Timebox.make([50, 200], () => authenticate(email, password)).run()
     */
    static make<T>(window: Window, callback: Callback<T>): Timebox<T> {
        return new Timebox(window, callback)
    }

    /**
     * Build a timebox around a window and a callback. Nothing runs until `run()`.
     */
    constructor(
        protected window: Window,
        protected callback: Callback<T>,
    ) {}

    /**
     * Queue a handler for when the window closes.
     *
     * Chaining builds the timebox rather than running it: `then()`, `catch()` and
     * `finally()` record handlers and return the timebox, so the chain can be closed
     * with `wrap()` and handed to something that takes a callback. Handlers run against
     * the settled callback once the window has elapsed, never before it.
     *
     * ponytail: a builder, not a thenable — `await timebox` would hang. Await `run()`.
     */
    // biome-ignore lint/suspicious/noThenProperty: mirrors the promise chain it builds
    then(
        onfulfilled?: ((value: T) => any) | undefined | null,
        onrejected?: ((reason: any) => any) | undefined | null,
    ): this {
        return this.tap("then", [onfulfilled, onrejected])
    }

    /**
     * Record a handler to apply once the window closes.
     */
    protected tap(method: Handler[0], args: any[]): this {
        this.handlers.push([method, args])
        return this
    }

    /**
     * Replay the queued handlers onto the settled callback.
     */
    protected settle(promise: Promise<T>): Promise<T> {
        return this.handlers.reduce<Promise<T>>((chain, [method, args]) => (chain[method] as any)(...args), promise)
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
    protected normalize(value: Window): [start: number, end: number] {
        const [start, end] = typeof value === "number" ? [0, value] : value

        if (start < 0 || end < start) {
            throw new RangeError(`Invalid timebox window: [${start}, ${end}]`)
        }

        return [start, end]
    }

    /**
     * Wait out the window around the callback, then hand it to the queued handlers.
     *
     * The window is measured from here, not from construction, so a timebox can be built
     * and configured before its clock starts. A callback that overruns the window is not
     * delayed further, and one that throws still rejects only after the window elapsed —
     * an error is exactly the case whose timing is being hidden.
     */
    async run(): Promise<T> {
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

        return this.settle(failed ? Promise.reject(error) : Promise.resolve(result as T))
    }

    /**
     * Wrap the timebox in a thunk that runs it when invoked.
     *
     * For handing a timebox to something that takes a callback:
     *
     *     setState(state, Timebox.make(100, () => track(state))
     *         .then((result) => report(result))
     *         .catch((error) => warn(error))
     *         .wrap())
     *
     * The thunk runs the window afresh on every invocation — a callback is expected to
     * be called more than once — replaying the queued handlers each time.
     */
    wrap(): () => Promise<T> {
        return () => this.run()
    }

    /**
     * Handle a rejection.
     */
    catch(onrejected?: ((reason: any) => any) | undefined | null): this {
        return this.tap("catch", [onrejected])
    }

    /**
     * Run a callback once the window closes.
     */
    finally(onfinally?: (() => void) | undefined | null): this {
        return this.tap("finally", [onfinally])
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
