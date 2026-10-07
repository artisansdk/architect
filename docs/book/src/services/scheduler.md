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
  scheduler.do(() => showModal()).in(1, "minutes")

  // Run every hour, starting after a 5-minute delay
  scheduler.do(() => syncData()).in(5, "minutes").every(1, "hours")
}
```

## Timing

### Delay before first run — `.in()`

`.in()` sets when the task first becomes eligible to run. It accepts a numeric offset with a unit, a `Date`, or any object with an `epochMilliseconds` property (e.g. `Temporal.Instant` or `Temporal.ZonedDateTime`).

```typescript
scheduler.do(fn).in(30, "seconds")
scheduler.do(fn).in(new Date("2026-07-01T09:00:00"))
scheduler.do(fn).in(Temporal.Now.instant().add({ hours: 1 }))
```

Supported units: `"milliseconds"`, `"seconds"`, `"minutes"`, `"hours"`.

### Recurring tasks — `.every()`

`.every()` makes a task recurring. The schedule advances on a fixed cadence — the next tick is always computed from the last scheduled fire, not from the last successful run. A task whose conditions fail at a given tick will be offered again at the next interval.

```typescript
scheduler.do(() => pollApi()).every(30, "seconds")
```

Tasks without `.every()` are one-shot by default and are removed after their first run.

## Conditions

### `.when()`

The handler only runs when the condition is truthy:

```typescript
scheduler.do(fn).every(1, "hours").when(() => isOnline())
```

Supports an optional comparison operand and value:

```typescript
scheduler.do(fn).every(1, "hours").when(() => retryCount, "<", 5)
```

Supported operands: `=`, `==`, `===`, `!=`, `!==`, `<>`, `>`, `<`, `>=`, `<=`.

### `.unless()`

The handler only runs when the condition is falsy — the inverse of `.when()`:

```typescript
scheduler.do(fn).in(1, "minutes").unless(() => alreadyShownToday())
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
scheduler.do(() => showModal()).tag("popups").in(1, "minutes")
scheduler.do(() => showBanner()).tag("popups").every(1, "hours")

// Drop all popup tasks at once:
scheduler.cancelTag("popups")
```

Names and tags are separate namespaces. `cancel()` matches by name only; `cancelTag()` matches by tag only.

## Cancellation

```typescript
// By reference
const task = scheduler.do(fn).every(5, "minutes")
scheduler.cancel(task)

// By name
scheduler.cancel("review-prompt")

// By tag
scheduler.cancelTag("popups")
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
    .in(0, "seconds")
}
```
