import { compareOp } from "../support/compare"
import type { Contract } from "./contract"

type TimeUnit = "milliseconds" | "seconds" | "minutes" | "hours"

const toMs: Record<TimeUnit, number> = {
    milliseconds: 1,
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
}

type Condition = {
    fn: () => unknown
    operand: string
    value: unknown
    negate?: boolean
}

/**
 * A single scheduled action. Chain `.in()`, `.every()`, `.when()`, and `.unless()`
 * to configure timing and conditions before registering via `Scheduler.do()` or `Scheduler.task()`.
 */
export class Task {
    protected handler: () => void
    protected conditions: Condition[] = []
    protected startAt: number = Date.now()
    protected interval: number = 0
    protected lastTick: number | null = null
    protected isOnce: boolean = true
    taskName: string | null = null
    taskTag: string | null = null

    constructor(handler: () => void) {
        this.handler = handler
    }

    /** Explicitly mark this task as one-shot (the default). */
    once(): this {
        this.isOnce = true
        return this
    }

    /** Assign a unique name so the task can be cancelled by string via `Scheduler.cancel()`. */
    name(n: string): this {
        this.taskName = n
        return this
    }

    /** Assign a tag so the task can be cancelled as a group via `Scheduler.cancelTag()`. */
    tag(t: string): this {
        this.taskTag = t
        return this
    }

    /**
     * Delay the first execution. Accepts a millisecond offset with an optional unit,
     * a `Date`, or any object with an `epochMilliseconds` property (e.g. `Temporal.Instant`).
     */
    in(amount: number | Date | { epochMilliseconds: number }, unit: TimeUnit = "milliseconds"): this {
        if (amount instanceof Date) {
            this.startAt = amount.getTime()
        } else if (typeof amount === "object" && "epochMilliseconds" in amount) {
            this.startAt = (amount as { epochMilliseconds: number }).epochMilliseconds
        } else {
            this.startAt = Date.now() + (amount as number) * toMs[unit]
        }
        return this
    }

    /**
     * Run the first execution as soon as possible.
     */
    immediately(): this {
        this.startAt = Date.now()
        return this
    }

    /**
     * Make the task recurring. The handler is offered on a fixed cadence — the schedule
     * advances every interval regardless of whether conditions passed on a given tick.
     */
    every(amount: number, unit: TimeUnit = "milliseconds"): this {
        this.interval = amount * toMs[unit]
        this.isOnce = false
        return this
    }

    /**
     * Add a condition that must be truthy for the handler to run.
     * Accepts a closure (evaluated each tick) or a plain value (captured at registration time).
     * Supports an optional comparison operand and value (e.g. `when(() => score, '>', 10)`).
     */
    when(fn: (() => unknown) | unknown, operand = "=", value: unknown = true): this {
        const resolve = typeof fn === "function" ? (fn as () => unknown) : () => fn
        this.conditions.push({ fn: resolve, operand, value })
        return this
    }

    /**
     * Add a condition that must be falsy for the handler to run.
     * Accepts a closure (evaluated each tick) or a plain value (captured at registration time).
     */
    unless(fn: (() => unknown) | unknown, operand = "=", value: unknown = true): this {
        const resolve = typeof fn === "function" ? (fn as () => unknown) : () => fn
        this.conditions.push({ fn: resolve, operand, value, negate: true })
        return this
    }

    /**
     * Called by `Scheduler.run()` on each tick. Returns `true` when the task should be
     * removed (i.e. it is a one-shot task and its handler ran). Handler errors are caught
     * and warned so a single bad task never aborts the rest of the tick.
     */
    execute(): boolean {
        const now = Date.now()
        if (now < this.startAt) return false
        if (this.interval > 0 && this.lastTick !== null && now - this.lastTick < this.interval) return false

        this.lastTick = now

        const passes = this.conditions.every((c) => {
            const ok = compareOp(c.fn(), c.operand, c.value)
            return c.negate ? !ok : ok
        })

        if (!passes) return false

        try {
            this.handler()
        } catch (e) {
            console.warn(`Scheduler: task "${this.taskName ?? "(anonymous)"}" threw —`, e)
        }

        return this.isOnce
    }
}

/**
 * Runs registered tasks on each tick. Opt-in via `SchedulerProvider`, which owns the
 * 1-second `setInterval` that drives `run()` and clears it on application shutdown.
 */
export class Scheduler implements Contract {
    protected tasks: Set<Task> = new Set()
    protected named: Map<string, Task> = new Map()

    /** Register a task and return it for further configuration. Defaults to one-shot. */
    do(handler: () => void): Task {
        const task = new Task(handler)
        this.tasks.add(task)
        return task
    }

    /**
     * Register a named task. If a task with the same name already exists it is
     * removed and a warning is logged before the new task is registered.
     */
    task(handler: () => void): Task
    task(name: string, handler: () => void): Task
    task(nameOrHandler: string | (() => void), handler?: () => void): Task {
        if (typeof nameOrHandler === "function") return this.do(nameOrHandler)

        const name = nameOrHandler
        if (this.named.has(name)) {
            console.warn(`Scheduler: task "${name}" already registered — overwriting`)
            const existing = this.named.get(name)
            if (existing) this.remove(existing)
        }
        const task = this.do(handler!).name(name)
        this.named.set(name, task)
        return task
    }

    protected remove(task: Task): void {
        this.tasks.delete(task)
        if (task.taskName) this.named.delete(task.taskName)
    }

    /**
     * Cancel a task by reference or by name. Passing a string matches the name
     * namespace only — use `cancelTag()` to cancel by tag.
     */
    cancel(ref: Task | string): void {
        if (ref instanceof Task) {
            this.remove(ref)
            return
        }
        const task = this.named.get(ref)
        if (task) this.remove(task)
    }

    /** Cancel all tasks carrying the given tag. */
    cancelTag(tag: string): void {
        for (const t of [...this.tasks].filter((t) => t.taskTag === tag)) {
            this.remove(t)
        }
    }

    /** Execute all registered tasks for this tick; auto-removes completed one-shot tasks. */
    run(): void {
        const done: Task[] = []
        for (const t of this.tasks) {
            if (t.execute()) done.push(t)
        }
        for (const t of done) {
            this.remove(t)
        }
    }
}
