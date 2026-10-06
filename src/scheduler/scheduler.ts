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
 * A single scheduled action. Register via `Scheduler.task()`, then chain `.in()`,
 * `.immediately()`, `.every()`, `.when()`, and `.unless()` to configure it.
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

    protected isNameTaken: (n: string) => boolean

    constructor(handler: () => void, isNameTaken: (n: string) => boolean = () => false) {
        this.handler = handler
        this.isNameTaken = isNameTaken
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

    /**
     * Assign a tag so the task can be cancelled as a group via `Scheduler.cancel()`.
     * Throws if a named task already uses the string — names and tags share one namespace.
     */
    tag(t: string): this {
        if (this.isNameTaken(t)) {
            throw new Error(`Scheduler: tag "${t}" conflicts with an existing task name`)
        }
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

    /** Alias for the anonymous `task(handler)` form. Defaults to one-shot. */
    do(handler: () => void): Task {
        const task = new Task(handler, (n) => this.named.has(n))
        this.tasks.add(task)
        return task
    }

    /**
     * Register an anonymous or named task. If a task with the same name already exists it is
     * removed and a warning is logged before the new task is registered. Throws if the
     * name is already in use as a tag — names and tags share one namespace.
     */
    task(handler: () => void): Task
    task(name: string, handler: () => void): Task
    task(nameOrHandler: string | (() => void), handler?: () => void): Task {
        if (typeof nameOrHandler === "function") return this.do(nameOrHandler)

        const name = nameOrHandler
        if (!handler) {
            throw new Error(`Scheduler: task "${name}" was registered without a handler`)
        }

        if ([...this.tasks].some((t) => t.taskTag === name)) {
            throw new Error(`Scheduler: task "${name}" conflicts with an existing tag`)
        }

        if (this.named.has(name)) {
            console.warn(`Scheduler: task "${name}" already registered — overwriting`)
            const existing = this.named.get(name)
            if (existing) this.remove(existing)
        }
        const task = this.do(handler).name(name)
        this.named.set(name, task)
        return task
    }

    protected remove(task: Task): void {
        this.tasks.delete(task)
        if (task.taskName) this.named.delete(task.taskName)
    }

    /**
     * Cancel a task by reference, or by string: the task with that name, or every
     * task carrying that tag. Names and tags never collide, so a string matches one or the other.
     */
    cancel(ref: Task | string): void {
        if (ref instanceof Task) {
            this.remove(ref)
            return
        }
        for (const t of [...this.tasks].filter((t) => t.taskName === ref || t.taskTag === ref)) {
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
