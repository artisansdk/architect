# Utilities

Architect ships several Laravel-inspired utility classes. Each is a separate subpath export — import only what you use.

## Str

String manipulation utilities, matching Laravel's `Str` helper. All methods are static functions on the `Str` object.

```typescript doctest
import { Str } from "@artisansdk/architect"

Str.slug("Hello World")              // "hello-world"
Str.camel("user_created")            // "userCreated"
Str.snake("UserCreated")             // "user_created"
Str.kebab("UserCreated")             // "user-created"
Str.studly("user_created")           // "UserCreated"
Str.title("hello world")             // "Hello World"
Str.headline("user_created_event")   // "User Created Event"
Str.limit("Long sentence here", 10)  // "Long sente..."
Str.lower("HELLO")                   // "hello"
Str.upper("hello")                   // "HELLO"
Str.random(16)                       // random alphanumeric string
Str.contains("hello world", "world") // true
Str.startsWith("hello", "hel")       // true
Str.endsWith("hello", "llo")         // true
Str.replace("world", "there", "hello world") // "hello there"
Str.slug("Héllo Wörld")              // "hello-world"
Str.trim("  hello  ")               // "hello"
Str.squish("hello   world")          // "hello world"
Str.after("user@example.com", "@")   // "example.com"
Str.before("user@example.com", "@")  // "user"
Str.between("<div>", "<", ">")       // "div"
Str.wordCount("hello world")         // 2
Str.isUrl("https://example.com")     // true
Str.isJson('{"key":"value"}')        // true
Str.toBase64("hello")                // "aGVsbG8="
Str.fromBase64("aGVsbG8=")           // "hello"
```

`registerGlobalHelpers()` makes any utility available on `globalThis` so it's accessible anywhere without importing. Pass only what you need — anything you don't import is treeshaken out of the bundle:

```typescript
import { registerGlobalHelpers, Str, Num, Arr } from "@artisansdk/architect"

registerGlobalHelpers({ Str, Num, Arr })

// Anywhere in the app, no import needed:
Str.slug("Hello World")
Num.currency(9.99, "USD")
```

The object shorthand `{ Str, Num, Arr }` uses the variable names as the keys on `globalThis`. You can rename a helper if needed:

```typescript
registerGlobalHelpers({ S: Str }) // → globalThis.S
```

## Arr

Array utilities, matching Laravel's `Arr` helper:

```typescript doctest
import { Arr } from "@artisansdk/architect"

Arr.wrap("hello")          // ["hello"]
Arr.wrap(["hello"])        // ["hello"]
Arr.wrap(null)             // []

Arr.flatten([[1, 2], [3]]) // [1, 2, 3]
Arr.first([1, 2, 3])       // 1
Arr.last([1, 2, 3])        // 3

const users = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]

Arr.pluck(users, "name")   // ["Alice", "Bob"]
Arr.keyBy(users, "id")     // { 1: { id: 1, name: "Alice" }, 2: { ... } }
```

## Num

Number formatting utilities, matching Laravel's `Number` helper:

```typescript doctest
import { Num } from "@artisansdk/architect"

Num.format(1234567.89)          // "1,234,567.89"
Num.format(1234.5, 2)           // "1,234.50"
Num.currency(9.99, "USD")       // "$9.99"
Num.currency(9.99, "EUR", "de") // locale-specific format
Num.percentage(75)              // "75%"
Num.percentage(33.3, 1)         // "33.3%"
Num.fileSize(1536)              // "2 KB"
Num.fileSize(1048576, 1)        // "1.0 MB"
Num.abbreviate(1500)            // "2K"
Num.abbreviate(1500000, 1)      // "1.5M"
Num.clamp(150, 0, 100)          // 100
Num.clamp(-5, 0, 100)           // 0
Num.between(5, 1, 10)           // true
Num.between(15, 1, 10)          // false
```

## Collection

An immutable, chainable wrapper around arrays, matching Laravel's `Collection`:

```typescript doctest
import { Collection } from "@artisansdk/architect"

const users = new Collection([
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
])

users.filter((u) => u.age > 20).map((u) => u.name).toArray()
// ["Alice", "Bob"]

users.first()              // { id: 1, name: "Alice", age: 30 }
users.last()               // { id: 2, name: "Bob", age: 25 }
users.count()              // 2
users.pluck("name")        // Collection ["Alice", "Bob"]
users.keyBy("id")          // Collection { 1: { ... }, 2: { ... } }
users.groupBy("age")       // Collection { 25: [...], 30: [...] }
users.sum("age")           // 55
users.avg("age")           // 27.5
users.contains((u) => u.name === "Alice") // true
users.toArray()            // original array
```

## LazyCollection

Like `Collection` but lazily evaluated — values are not computed until you iterate or call `toArray()`. Useful for large datasets where you want to avoid building intermediate arrays:

```typescript
import { LazyCollection } from "@artisansdk/architect"

const result = new LazyCollection(largeArray)
  .filter((x) => x.active)
  .map((x) => x.id)
  .take(100)
  .toArray()
```

## Fluent

A generic dot-notation key-value wrapper. Useful for wrapping configuration objects or arbitrary records with a clean read/write API:

```typescript doctest
import { Fluent } from "@artisansdk/architect"

const obj = new Fluent({
  user: { name: "Alice", age: 30 },
  settings: { theme: "dark" },
})

obj.get("user.name")              // "Alice"
obj.get("user.missing", "guest")  // "guest"
obj.get<number>("user.age")       // 30
obj.has("settings.theme")         // true
obj.set("user.age", 31)           // returns this (chainable)
obj.toArray()                     // { user: { name: "Alice", age: 31 }, ... }
```

## Signal

A minimal observable value box — get/set/subscribe, no dependency tracking or batching:

```typescript
import { Signal } from "@artisansdk/architect"

const count = new Signal(0)

const unsubscribe = count.subscribe((value) => console.log("count is now", value))

count.set(1)              // logs "count is now 1"
count.update((n) => n + 1) // logs "count is now 2"
count.get()                // 2

unsubscribe()
```

`set()` is a no-op if the new value is `Object.is`-equal to the current one — listeners aren't notified. In React, [`useSignal(signal)`](./adapters.md#hooks) subscribes a component to a `Signal` and re-renders on change.

## Pipeline

Send a value through a series of transform functions, matching Laravel's `Pipeline`:

```typescript
import { send } from "@artisansdk/architect"

// Each pipe is a function: (passable, next) => result
// Call next(passable) to pass to the next stage.
const validate = (user, next) => {
  if (!user.name) throw new Error("Name is required")
  return next(user)
}

const normalizeEmail = (user, next) => {
  return next({ ...user, email: user.email.toLowerCase() })
}

const result = send(user)
  .through([validate, normalizeEmail])
  .thenReturn()
```

Use `then()` to provide a final destination instead of returning the passable:

```typescript
const result = send(user)
  .through([validate, normalizeEmail])
  .then((user) => repository.save(user))
```

The pipeline is **synchronous**. If you need async pipes, resolve promises inside each pipe before calling `next`:

```typescript
const fetchProfile = async (user, next) => {
  const profile = await api.getProfile(user.id)
  return next({ ...user, profile })
}

// Once any pipe awaits before calling next, the whole chain's result becomes
// a Promise — await the call site, not the individual pipes.
const result = await send(user)
  .through([validate, fetchProfile])
  .thenReturn()
```

## Timebox

Run a callback within a timing window: no sooner than a start, held to no less than an end, and optionally cut off at a deadline.

```typescript
import { Timebox } from "@artisansdk/architect"

// Resolves no sooner than 100ms, however fast the callback returns.
const user = await Timebox.make(100, () => authenticate(email, password)).run()
```

### The window

Every time in a timebox is in milliseconds and measured from the moment it is run.

| Window | Callback starts | Resolves no sooner than |
| --- | --- | --- |
| `make(200, fn)` | immediately | 200ms |
| `make([50, 200], fn)` | at 50ms | 200ms |
| `make([50, false], fn)` | at 50ms | whenever `fn` settles |
| `make(false, fn)` / `make(0, fn)` | immediately | whenever `fn` settles |

```typescript
// Waits 50ms, runs the callback, then pads out to 200ms total.
const user = await Timebox.make([50, 200], () => authenticate(email, password)).run()
```

The end is a floor, not a ceiling. A callback that overruns it isn't delayed further, and isn't stopped either — that's what [`deadline()`](#deadline) is for. An end of `false` or `0` is no floor at all.

The window can be reshaped after construction:

```typescript
Timebox.make(false, () => save(form))
  .delay(3000)    // start at 3000ms             → [3000, false]
  .duration(5000) // stay open 5000ms past start → [3000, 8000]
  .extend(2000)   // push the end out by 2000ms  → [3000, 10000]
```

- `delay(ms)` sets the start.
- `duration(ms)` sets the end to `ms` past the start. It reads the start as it stands, so call `delay()` first.
- `extend(ms)` adds `ms` to the end.

### Running

`Timebox.make(window, callback)` is sugar for `new Timebox(window, callback)`. Either way you get the timebox, not a promise — nothing runs until you call `run()`, and every `run()` runs the callback again.

`then()`, `catch()` and `finally()` are builder methods: they queue handlers and hand the timebox back, so a whole chain can be built before anything runs.

```typescript
const user = await Timebox.make(100, () => authenticate(email, password))
  .catch(() => null)
  .finally(() => metrics.increment("auth.attempt"))
  .run()
```

The queued handlers run against the settled callback once the window has elapsed, never before it. A callback that throws still rejects only after the window has elapsed — an error is exactly the case whose timing you're hiding.

> Note: a timebox is a builder, not a thenable. `await timebox` hangs — await `timebox.run()`.

Use `wrap()` where something expects a callback rather than a promise. It closes the chain and hands back a closure that runs the timebox when invoked, passing whatever it is called with on to the callback after the timebox:

```tsx
<button
  onClick={Timebox.make(300, (timebox, event: React.MouseEvent) => save(event.currentTarget.form))
    .catch((error) => toast.error(error.message))
    .wrap()}
/>
```

`run()` takes the same arguments directly: `timebox.run(event)`. The closure runs the window afresh on every invocation, replaying the queued handlers each time.

### Inside the callback

The callback is handed the timebox of its own run:

- `timebox.signal` — an `AbortSignal` that aborts when a condition stops holding or the deadline passes. Its `reason` is the error the run rejects with.
- `timebox.elapsed` — milliseconds since the run began, start delay included. `0` on a timebox that hasn't been run.

Both are read-only. To let the callback change the timebox it is handed, build it [`mutable()`](#mutability).

The timebox can stop waiting on a callback, but it can't stop the work the callback started. Hand the signal to whatever can be cancelled:

```typescript
const report = await Timebox.make(200, (timebox) => fetch("/report", { signal: timebox.signal }))
  .deadline(5000)
  .run()
```

### Returning early

By default a run resolves no sooner than the end of its window. `returnEarly()` drops that floor, as if the window had been built with an end of `false` — the start delay is still waited out. Call it during the build to switch the floor off for every run, and `dontReturnEarly()` to restore it:

```typescript
const timebox = Timebox.make([50, 200], () => authenticate(email, password))

if (!config.get("auth.timing_protection")) timebox.returnEarly()

const user = await timebox.run()
```

A callback can also call it on its own run, once it knows there's nothing left to hide — but only on a timebox built `mutable()`. On an immutable one it rejects with a `TypeError`, like any other mutator:

```typescript
const user = await Timebox.make(100, async (timebox) => {
  const user = await authenticate(email, password)
  timebox.returnEarly() // succeeded, no need to pad
  return user
})
  .mutable()
  .run()
```

Failures are held to the floor too. A thrown error, an aborted condition and a passed deadline all reject no sooner than the end of the window, unless `returnEarly()` was called.

### Conditions

`when(closure)` lets the callback run only while the closure is truthy, and `unless(closure)` only while it is falsy. Every condition has to hold. A closure may be async — it's judged by what it resolves to.

A condition is read once, when the callback's start comes round — after the start delay, not before it. If it doesn't hold, the callback never runs and the run rejects with an `AbortError`:

```typescript
await Timebox.make([250, false], () => autosave(draft))
  .unless(() => draft.isClean()) // still nothing to save 250ms later? don't.
  .run()
```

To keep reading the conditions while the callback runs, turn on polling — either with `polling(ms = 10)` or by passing the interval as the second argument to `when()` / `unless()`. The moment a condition stops holding, the signal aborts and the run rejects with an `AbortError`:

```typescript
await Timebox.make(200, (timebox) => sync(queue, { signal: timebox.signal }))
  .when(() => navigator.onLine, 50) // checked at the start, then every 50ms
  .run()
```

Polling is off by default, and `polling(false)` or `polling(0)` turns it back off. There is one interval for the whole timebox, so polling one condition polls them all. It's a poll, not a signal — the abort lands up to `ms` late. A condition that throws rejects the run with what it threw.

### Deadline

Without a deadline, a callback may run on past the end of the window for as long as it likes. `deadline(ms)` aborts one still running `ms` into the run: the signal aborts and the run rejects with a `TimeoutError`.

```typescript
const user = await Timebox.make([50, 200], () => authenticate(email, password))
  .deadline() // defaults to the end of the window: 200ms from the run
  .run()
```

A deadline can't be sooner than the end of the window — that throws a `RangeError`, as does running a timebox whose window was since pushed out past its deadline. `deadline(false)` or `deadline(0)` lifts it. On a window with no end, there's nothing to default to, so pass the milliseconds.

### Mutability

A timebox is immutable while it runs: the callback can read the timebox it is handed but not rewrite it under the run that's measuring it, and a mutator called from inside one rejects with a `TypeError`. Configure it before `run()`. That goes for `returnEarly()` and `dontReturnEarly()` too.

Call `mutable()` during the build to let the callback reshape its own run, and `immutable()` to lock it again:

```typescript
const user = await Timebox.make(100, async (timebox) => {
  const user = await authenticate(email, password)
  if (user.mfa) timebox.extend(200) // more to hide, so hide it for longer
  return user
})
  .mutable()
  .run()
```

Each `run()` works on a copy of the timebox with a signal of its own, so what a callback does to the timebox it's handed lasts for that run and no longer: a `returnEarly()` or an `extend()` from inside one invocation of a `wrap()` closure doesn't reach the next one, and two runs of the same timebox in flight at once don't tread on each other. Anything set before `run()` is part of the build and applies to every run.

> Note: the mutators return the timebox for chaining, so mind an arrow-bodied callback — returning the timebox from a callback rejects rather than resolving to it.

### Available methods

| Method | Does |
| --- | --- |
| `Timebox.make(window, callback)` | Build a timebox. Alias for `new Timebox(window, callback)`. |
| `run(...args)` | Run the window and resolve with the callback's result. Arguments reach the callback after the timebox. |
| `wrap()` | A closure that calls `run()` with whatever it is called with. |
| `then(fn, fn?)` / `catch(fn)` / `finally(fn)` | Queue a handler for when the window closes. |
| `delay(ms)` | Set the start of the window. |
| `duration(ms)` | Set the end of the window to `ms` past its start. |
| `extend(ms)` | Push the end of the window out by `ms`. |
| `deadline(ms?)` | Abort a callback still running at `ms`. Defaults to the end; `false` / `0` lifts it. |
| `when(closure, polling?)` | Run the callback only while the closure is truthy. |
| `unless(closure, polling?)` | Run the callback only while the closure is falsy. |
| `polling(ms = 10)` | Re-read the conditions every `ms` while the callback runs; `false` / `0` turns it off. |
| `returnEarly()` | Drop the floor: return as soon as the callback settles. |
| `dontReturnEarly()` | Restore the floor. |
| `mutable()` / `immutable()` | Let the callback change its timebox. Timeboxes are immutable by default |
| `signal` | The run's `AbortSignal`. |
| `elapsed` | Milliseconds since the run began. |

How a run can reject:

| Cause | Rejects with |
| --- | --- |
| The callback throws or rejects | whatever it threw |
| A condition doesn't hold | `DOMException` named `AbortError` |
| A condition throws | whatever it threw |
| The deadline passes | `DOMException` named `TimeoutError` |
| A mutator is called on a running, immutable timebox | `TypeError` |
| The deadline is sooner than the end of the window | `RangeError` |

### Recipes

**Hide how long a login took.** A wrong email fails faster than a wrong password, and the difference tells an attacker which accounts exist. Hold every failure to the same floor:

```typescript
const user = await Timebox.make(300, async (timebox) => {
  const user = await authenticate(email, password)
  timebox.returnEarly() // only a success gets to be fast
  return user
})
  .mutable()
  .catch(() => null)
  .run()
```

**Keep a spinner from flashing.** Hold a fast response until the spinner has been on screen long enough to read:

```typescript
setLoading(true)

const rows = await Timebox.make(400, () => api.rows())
  .finally(() => setLoading(false))
  .run()
```

**Debounce a search and drop stale requests.** Each keystroke builds its own timebox. The start delay is the debounce: if the query has moved on by the time it elapses, the request is never sent. Polling covers the request already in flight:

```typescript
let latest = ""

function onInput(query: string) {
  latest = query

  return Timebox.make([250, false], (timebox) => api.search(query, { signal: timebox.signal }))
    .when(() => latest === query, 25)
    .then((results) => render(results))
    .catch((error) => {
      if (error.name !== "AbortError") throw error
    })
    .run()
}
```

**Stop work when the component unmounts.** An `unless()` on a flag, polled, turns an unmount into an abort:

```tsx
useEffect(() => {
  let unmounted = false

  Timebox.make(false, (timebox) => loadDashboard({ signal: timebox.signal }))
    .unless(() => unmounted, 50)
    .then(setDashboard)
    .catch(() => {})
    .run()

  return () => {
    unmounted = true
  }
}, [])
```

**Give a request a hard timeout.** No floor, just a ceiling:

```typescript
const report = await Timebox.make(false, (timebox) => fetch("/report", { signal: timebox.signal }))
  .deadline(5000)
  .run()
```

**Only work while a condition lasts, and tell the failures apart.** Sync while online and the tab is visible, for at most ten seconds:

```typescript
try {
  await Timebox.make(false, (timebox) => sync(queue, { signal: timebox.signal }))
    .when(() => navigator.onLine)
    .unless(() => document.hidden)
    .polling(100)
    .deadline(10_000)
    .run()
} catch (error) {
  if (error.name === "AbortError") retryLater() // went offline or hidden
  else if (error.name === "TimeoutError") report("sync is slow")
  else throw error
}
```

**Confirm a destructive click with a grace period.** The delete starts three seconds after the click, and not at all if it was undone in the meantime:

```tsx
<button
  onClick={Timebox.make([3000, false], (timebox, event: React.MouseEvent) => destroy(id))
    .unless(() => undone.current)
    .catch(() => {})
    .wrap()}
>
  Delete
</button>
```

> Note: The window is a floor, not a precise deadline — JavaScript timers drift by a few milliseconds, so keep it comfortably larger than the variance you're masking.
