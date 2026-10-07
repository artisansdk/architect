# Scheduler

The **Scheduler** runs registered tasks on a fixed 1-second tick. Each task is configured with a timing rule, optional conditions, and a handler. Tasks are one-shot by default and are automatically removed after their handler runs.

`SchedulerProvider` is **opt-in** — it is not included in `defaultProviders`. Add it explicitly:

```typescript
import { Application, defaultProviders, SchedulerProvider } from "@artisansdk/architect"

Application.configure()
  .withProviders([...defaultProviders, new SchedulerProvider()])
  .run()
```

## Basic usage

Register tasks from a `ServiceProvider`'s `boot()` hook:

```typescript
import { Scheduler, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const scheduler = container.make(Scheduler)

  // Run once after 1 minute
  scheduler.task(() => showModal()).in(1, "minutes")

  // Run every hour, starting after a 5-minute delay
  scheduler.task(() => syncData()).in(5, "minutes").every(1, "hours")
}
```

## Registering tasks — `.task()`

`task(handler)` registers an anonymous task; `task(name, handler)` registers a named task. Both return a `Task` so you can chain timing, conditions, and tags. Tasks default to one-shot and become eligible on the next scheduler tick.

```typescript
scheduler.task(() => refreshData()).every(30, "seconds")
scheduler.task("refresh", () => refreshData()).every(30, "seconds")
```

### `.do()` alias

`do(handler)` is an alias for the anonymous `task(handler)` form. It returns the same kind of configurable `Task`; use `task(name, handler)` when you need a name.

```typescript
scheduler.do(() => refreshData()).every(30, "seconds")
// Equivalent registration using task():
scheduler.task(() => refreshData()).every(30, "seconds")
```

## Timing

### Start on the next tick — `.immediately()`

Call `immediately()` on the returned task to make its first run eligible now. The handler runs on the next scheduler tick, subject to its conditions; it is not invoked synchronously. `SchedulerProvider` ticks once per second.

```typescript
scheduler.task(() => syncData()).immediately().every(5, "minutes")

// Clear a previously configured delay before the first run:
const reminder = scheduler.task(() => showReminder()).in(10, "minutes")
reminder.immediately()
```

This is the default timing for a new task. `immediately()` resets the start time; it does not remove conditions or change the recurring interval.

### Delay before first run — `.in()`

`.in()` sets when the task first becomes eligible to run. It accepts a numeric offset with a unit, a `Date`, or any object with an `epochMilliseconds` property (e.g. `Temporal.Instant` or `Temporal.ZonedDateTime`).

```typescript
scheduler.task(fn).in(30, "seconds")
scheduler.task(fn).in(new Date("2026-07-01T09:00:00"))
scheduler.task(fn).in(Temporal.Now.instant().add({ hours: 1 }))
```

Supported units: `"milliseconds"`, `"seconds"`, `"minutes"`, `"hours"`.

### Recurring tasks — `.every()`

`.every()` makes a task recurring. The schedule advances on a fixed cadence — the next tick is always computed from the last scheduled fire, not from the last successful run. A task whose conditions fail at a given tick will be offered again at the next interval.

```typescript
scheduler.task(() => pollApi()).every(30, "seconds")
```

Tasks without `.every()` are one-shot by default and are removed after their first run.

## Conditions

### `.when()`

The handler only runs when the condition is truthy:

```typescript
scheduler.task(fn).every(1, "hours").when(() => isOnline())
```

Supports an optional comparison operand and value:

```typescript
scheduler.task(fn).every(1, "hours").when(() => retryCount, "<", 5)
```

Supported operands: `=`, `==`, `===`, `!=`, `!==`, `<>`, `>`, `<`, `>=`, `<=`.

### `.unless()`

The handler only runs when the condition is falsy — the inverse of `.when()`:

```typescript
scheduler.task(fn).in(1, "minutes").unless(() => alreadyShownToday())
```

Conditions do not affect the schedule. If a condition fails at a scheduled tick, the interval still advances and the task is offered again at the next fire time.

## Named tasks

Register a task by name to cancel it later without holding a reference. If a name is already in use, the existing task is replaced by the new one.

```typescript
scheduler.task("review-prompt", () => showModal()).in(1, "minutes")

// Later:
scheduler.cancel("review-prompt")
```

## Tags

Tag tasks to cancel them as a group:

```typescript
scheduler.task(() => showModal()).tag("popups").in(1, "minutes")
scheduler.task(() => showBanner()).tag("popups").every(1, "hours")

// Drop all popup tasks at once:
scheduler.cancel("popups")
```

Names and tags share one namespace, so `cancel("x")` is never ambiguous. Registering a task under a name already used as a tag, or tagging with a name already used by a task, throws.

## Cancellation

Use `scheduler.cancel(taskOrNameOrTag)` to cancel by task reference, name, or tag. Cancelling a tag removes all tasks carrying it. An unmatched reference or string is a no-op.

```typescript
// By reference
const task = scheduler.task(fn).every(5, "minutes")
scheduler.cancel(task)

// By name
scheduler.cancel("review-prompt")

// By tag
scheduler.cancel("popups")
```

## One-shot vs recurring

| Configuration | Behaviour |
|---------------|-----------|
| No `.every()` | One-shot — runs once when conditions pass, then auto-removed. |
| `.every(n, unit)` | Recurring — stays registered, fires on a fixed cadence. |
| `.once()` | Explicit one-shot (same as default, useful for clarity). |

## Error handling

If a task handler throws and nothing handles it, the error goes to the app's `ErrorHandler` (see [errors](./errors.md)), which reports it to the log and rethrows it unless the error implements `report()`/`render()`. The scheduler itself never logs. A `Scheduler` constructed without an `ErrorHandler` rethrows instead. In every case the rest of the tasks in the tick still run, the error is thrown once the tick finishes, and a one-shot task is still removed.

Chain `.catch()` to handle the error yourself. Like a promise chain, handlers run in order — the first handles the error, one that rethrows passes its error to the next, and anything left unhandled falls back to the `ErrorHandler`:

```typescript
scheduler
  .do(() => sync())
  .every(30, "seconds")
  .catch((error, task) => report(error))
```

Unlike [Timebox](../utilities.md#timebox), a task only has `.catch()` — there is no `.then()` or `.finally()`. A task's handler returns nothing to chain on, and a recurring task never settles; put follow-up work at the end of the handler itself.

## Using Scheduler directly

```typescript
import { Scheduler, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const scheduler = container.make(Scheduler)
  scheduler.task("alert", () => showAlert())
    .when(() => !alreadySeenToday())
    .immediately()
}
```
