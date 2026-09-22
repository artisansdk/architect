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

Run a callback within a timing window.

```typescript
import { Timebox } from "@artisansdk/architect"

// Resolves no sooner than 100ms, however fast the callback returns.
const user = await Timebox.make(100, () => authenticate(email, password))
```

A `[start, end]` tuple also delays the callback: it doesn't begin until `start` has elapsed, and the timebox doesn't resolve until `end` has — both measured from the moment the timebox is awaited:

```typescript
// Waits 50ms, runs the callback, then pads out to 200ms total.
const user = await Timebox.make([50, 200], () => authenticate(email, password))
```

`make()` returns the timebox, not a promise — nothing runs until you await it, and the callback runs once no matter how often you await. A callback that overruns the window isn't delayed further, and one that throws still throws only after the window has elapsed — an error is exactly the case whose timing you're hiding.

Call `returnEarly()` on the timebox from inside the callback to skip the remaining wait, once you know there's nothing left to hide:

```typescript
const user = await Timebox.make(100, async (timebox) => {
  const user = await authenticate(email, password)
  timebox.returnEarly() // succeeded, no need to pad
  return user
})
```

Because the timebox is returned before it runs, you can also set it up front — `returnEarly()` before awaiting skips both waits, and `dontReturnEarly()` restores them:

```typescript
const timebox = Timebox.make([50, 200], () => authenticate(email, password))

if (!config.get("auth.timing_protection")) timebox.returnEarly()

const user = await timebox
```

> Note: The window is a floor, not a precise deadline — JavaScript timers drift by a few milliseconds, so keep it comfortably larger than the variance you're masking.
