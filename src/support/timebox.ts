export type Window = number | false | [start: number, end: number | false]

export type Callback<T, A extends unknown[] = []> = (timebox: Timebox<T, A>, ...args: A) => T | PromiseLike<T>

type Handler = ["then" | "catch" | "finally", any[]]

export type Condition<T, A extends unknown[] = []> = (timebox: Timebox<T, A>) => unknown

export class Timebox<T = unknown, A extends unknown[] = []> {
    protected earlyReturn = false
    protected locked = true
    protected running = false
    protected began?: number
    protected interval?: number
    protected controller = new AbortController()
    protected whens: Condition<T, A>[] = []
    protected handlers: Handler[] = []
    protected window: { start: number; end: number; deadline?: number }

    /**
     * Run a callback within a timing window, measured from the moment the timebox is run.
     *
     * A number is a floor: it resolves no sooner than `milliseconds`. A tuple `[start, end]`
     * also delays the callback until `start` has elapsed. An end of `false` or `0` is no
     * floor at all: the timebox returns the moment the callback settles.
     *
     *     await Timebox.make([50, 200], () => authenticate(email, password)).run()
     */
    static make<T, A extends unknown[] = []>(window: Window, callback: Callback<T, A>): Timebox<T, A> {
        return new Timebox(window, callback)
    }

    /**
     * Build a timebox around a window and a callback. Nothing runs until `run()`.
     */
    constructor(
        window: Window,
        protected callback: Callback<T, A>,
    ) {
        const [start, end] = this.normalize(window)

        this.window = {
            start: start,
            end: end,
        }
    }

    /**
     * The signal of the run in flight, aborted when a condition stops holding or the
     * deadline passes.
     *
     * The timebox can stop waiting on its callback but cannot stop the work the callback
     * started, so hand this to whatever can be cancelled:
     *
     *     Timebox.make(200, (timebox) => fetch(url, { signal: timebox.signal }))
     *
     * Its `reason` is the error the run rejects with.
     */
    get signal(): AbortSignal {
        return this.controller.signal
    }

    /**
     * The milliseconds since the run began, start delay included. Zero until it is run.
     */
    get elapsed(): number {
        return this.began === undefined ? 0 : performance.now() - this.began
    }

    /**
     * Queue a handler for when the window closes.
     *
     * Chaining builds the timebox rather than running it: `then()`, `catch()` and
     * `finally()` record handlers and return the timebox, so the chain can be closed
     * with `wrap()` and handed to something that takes a callback. Handlers run against
     * the settled callback once the window has elapsed, never before it.
     *
     * note: `await timebox` would hang. Await `timebox.run()`.
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
        this.guard()
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
     * it, and burning a core to shave milliseconds isn't worth it. Override to fake the clock;
     * the deadline and the poll hold raw timers, since they have to be cleared.
     */
    protected async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Guard against mutations once the timebox is running.
     *
     * A running timebox hands itself to its callback, and by default it's immutable.
     */
    protected guard(): void {
        if (this.running && this.locked) {
            throw new TypeError("Timebox is immutable while running: call mutable() before run()")
        }
    }

    /**
     * Abort the run unless every condition still holds.
     *
     * Conditions are awaited, so an async one is judged by what it resolves to rather
     * than by the promise, which is always truthy. A condition that throws aborts with
     * what it threw: the poll calls this from a timer, where nothing else would catch it.
     */
    protected async permit(): Promise<void> {
        try {
            for (const closure of this.whens) {
                if (!(await closure(this))) {
                    throw new DOMException("Timebox aborted: a condition does not hold", "AbortError")
                }
            }
        } catch (error) {
            // A slow check can land after the run is over, with nothing left to abort.
            if (this.running) this.controller.abort(error)
        }
    }

    /**
     * Refuse a deadline that would cut the window short.
     */
    protected bound(): void {
        const { end, deadline } = this.window

        if (deadline !== undefined && deadline < end) {
            throw new RangeError(`Invalid timebox deadline: ${deadline}ms is before the end of the window at ${end}ms.`)
        }
    }

    /**
     * Normalize the value into the expected window.
     */
    protected normalize(value: Window): [start: number, end: number] {
        const [start, end] = Array.isArray(value) ? value : [0, value]

        if (start < 0 || (end !== false && end !== 0 && end < start)) {
            throw new RangeError(`Invalid timebox window: [${start}, ${end}]. End should be greater than start.`)
        }

        // An end of `false` is no floor to pad out to: a zero end is always already
        // elapsed, so the timebox returns the moment the callback settles.
        return [start, end === false ? 0 : end]
    }

    /**
     * Copy the timebox for a single invocation to run against.
     *
     * Everything a run writes — whether it is running, whether it was told to return
     * early, a window its own callback reshaped, the signal it aborts — belongs to that
     * invocation and not to the timebox it was built from. A timebox can be run again,
     * and more than once at a time, so a run that wrote to the original would reach into
     * every other one.
     *
     * `Object.assign` carries the fields across, so a new one needs listing here only
     * when a run can write through it.
     */
    protected fork(): this {
        return Object.assign(Object.create(Object.getPrototypeOf(this)) as this, this, {
            window: { ...this.window },
            whens: [...this.whens],
            handlers: [...this.handlers],
            controller: new AbortController(),
        })
    }

    /**
     * Wait out the window around the callback, then hand it to the queued handlers.
     *
     * The window is measured from here, not from construction, so a timebox can be built
     * and configured before its clock starts. A callback that overruns the window is not
     * delayed further, and one that throws still rejects only after the window elapsed —
     * an error is exactly the case whose timing is being hidden.
     *
     * The run gets a copy of the timebox to work on, so what the callback does to the
     * timebox it is handed under `mutable()` — `returnEarly()`, or a window change —
     * lasts as long as that run and no longer. Arguments are passed on to the callback
     * after the timebox.
     */
    run(...args: A): Promise<T> {
        return this.fork().invoke(args)
    }

    /**
     * Run the window on this copy of the timebox.
     */
    protected async invoke(args: A): Promise<T> {
        this.bound()

        const { start, deadline } = this.window

        this.began = performance.now()
        if (start > 0) await this.sleep(start)

        let result: T | undefined
        let error: unknown
        let failed = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let poll: ReturnType<typeof setInterval> | undefined
        this.running = true
        try {
            // The callback runs only if the conditions hold once its start comes round.
            await this.permit()
            this.signal.throwIfAborted()

            const aborted = new Promise<never>((_, reject) => {
                this.signal.addEventListener("abort", () => reject(this.signal.reason), { once: true })
            })

            if (deadline !== undefined) {
                timer = setTimeout(
                    () =>
                        this.controller.abort(
                            new DOMException(`Timebox exceeded its ${deadline}ms deadline`, "TimeoutError"),
                        ),
                    Math.max(deadline - this.elapsed, 0),
                )
            }

            if (this.interval !== undefined && this.whens.length > 0) {
                // The interval keeps its own cadence however long a check takes, and a
                // tick is skipped rather than stacked while a slow one is still out.
                let checking = false
                poll = setInterval(async () => {
                    if (checking) return
                    checking = true
                    await this.permit()
                    checking = false
                }, this.interval)
            }

            const value = this.callback(this, ...args)

            // The mutators return the timebox for chaining, so an arrow-bodied callback
            // leaks it easily — and awaiting one hangs, since `then()` queues a handler
            // rather than resolving. Say so rather than stalling for good.
            if (value instanceof Timebox) {
                throw new TypeError(
                    "Timebox callback returned the timebox: give the callback a block body, or return a value",
                )
            }

            result = await Promise.race([value, aborted])
        } catch (e) {
            error = e
            failed = true
        } finally {
            // Clear the timers once the race is over, whoever won it.
            clearTimeout(timer)
            clearInterval(poll)
            this.running = false
        }

        // Read the end back off the window rather than the copy taken at the top: a
        // mutable timebox may have been extended by its own callback. An abort is padded
        // out like any other failure, so it can't be told apart by how long it took.
        const remainder = this.window.end - this.elapsed
        if (remainder > 0 && !this.earlyReturn) await this.sleep(remainder)

        return this.settle(failed ? Promise.reject(error) : Promise.resolve(result as T))
    }

    /**
     * Wrap the timebox in a closure that runs it when invoked.
     *
     * For handing a timebox to something that takes a callback. Whatever the closure is
     * called with reaches the callback after the timebox:
     *
     *     <button onClick={Timebox.make(300, (timebox, event: MouseEvent) => save(event))
     *         .catch((error) => warn(error))
     *         .wrap()} />
     *
     * The closure runs the window afresh on every invocation — a callback is expected to
     * be called more than once — replaying the queued handlers each time.
     */
    wrap(): (...args: A) => Promise<T> {
        return (...args) => this.run(...args)
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
     * Let the callback run only while the closure is truthy.
     *
     * Read once, when the callback's start comes round: if it doesn't hold, the callback
     * never runs and the run rejects with an `AbortError`. Pass `polling` milliseconds to
     * keep reading it while the callback runs, aborting the moment it stops holding:
     *
     *     Timebox.make([50, 200], (timebox) => sync(timebox.signal))
     *         .when(() => navigator.onLine, 25)
     *         .run()
     *
     * ponytail: one interval for every condition, so polling one polls them all. Hold an
     * interval per condition if they ever need different rates.
     */
    when(closure: Condition<T, A>, polling: number | false = false): this {
        this.guard()
        this.whens.push(closure)

        return polling ? this.polling(polling) : this
    }

    /**
     * Let the callback run only while the closure is falsy.
     */
    unless(closure: Condition<T, A>, polling: number | false = false): this {
        return this.when(async (timebox) => !(await closure(timebox)), polling)
    }

    /**
     * Drop the floor: return the moment the callback settles, as `make(false)` would.
     *
     * The start delay is still waited out. A callback that knows there is nothing left
     * to hide can call it on its own run, once the timebox was built `mutable()`.
     */
    returnEarly(): this {
        this.guard()
        this.earlyReturn = true

        return this
    }

    /**
     * Restore the floor, undoing an earlier `returnEarly()`.
     */
    dontReturnEarly(): this {
        this.guard()
        this.earlyReturn = false

        return this
    }

    /**
     * Wait the ms to run the closure, modifies the start window.
     */
    delay(ms: number): this {
        this.guard()
        this.window.start = ms

        return this
    }

    /**
     * Set how long the window stays open once the callback starts, replacing its end.
     *
     * Measured from the start of the window, so `delay(3000).duration(5000)` closes
     * 8000ms into the run.
     *
     * ponytail: reads the start as it stands — call `delay()` first. Store the duration
     * and resolve the end in `invoke()` if the order ever needs not to matter.
     */
    duration(ms: number): this {
        this.guard()
        this.window.end = this.window.start + ms

        return this
    }

    /**
     * Push the end of the window out by the ms.
     */
    extend(ms: number): this {
        this.guard()
        this.window.end += ms

        return this
    }

    /**
     * Keep reading the conditions every ms while the callback runs, rather than once.
     *
     * Off by default: a condition read once at the start is enough when it is config.
     * Turn it on when a condition tracks something that can change mid-run, and pass
     * `false` or `0` to turn it back off. Without a `when()` or `unless()` there is
     * nothing to poll.
     *
     * ponytail: a poll, not a signal — the abort lands up to `ms` late.
     */
    polling(ms: number | false = 10): this {
        this.guard()
        this.interval = ms || undefined

        return this
    }

    /**
     * Let the callback change the timebox it is handed.
     */
    mutable(): this {
        this.guard()
        this.locked = false

        return this
    }

    /**
     * Keep the callback from changing the timebox it is handed. The default.
     */
    immutable(): this {
        this.guard()
        this.locked = true

        return this
    }

    /**
     * Abort a callback still running once the ms have passed, measured from the run.
     *
     * Without one a callback may run on past the end of the window for as long as it
     * likes. With one the signal is aborted and the run rejects with a `TimeoutError`.
     *
     * Defaults to the end of the window, and can't be sooner than it: a deadline inside
     * the window would cut short the time the window promises. Pass `false` or `0` to
     * lift it again.
     */
    deadline(ms: number | false | null = null): this {
        this.guard()

        if (ms === null && this.window.end === 0) {
            throw new RangeError("Timebox has no window end to use as a deadline")
        }

        this.window.deadline = ms === null ? this.window.end : ms || undefined
        this.bound()

        return this
    }
}
