# Errors

**ErrorsProvider** catches uncaught errors — window errors, unhandled promise rejections, and (in React) render errors — and dispatches them onto the **Events** bus as a normalized **ArchitectError**, so you can observe them from one place instead of wiring `window.addEventListener` yourself. Each one is also reported to the [ErrorHandler](#errorhandler), so it's logged.

It's part of the core alongside config and the [log](./log.md): every app registers it, so you don't add it to your providers.

## What it catches

| Source | Trigger | Notes |
|--------|---------|-------|
| `"window"` | `window.addEventListener("error", ...)` | Filtered to same-origin script files — drops extension/third-party-script noise and censored cross-origin `"Script error."` events |
| `"promise"` | `window.addEventListener("unhandledrejection", ...)` | |
| `"react"` | `ErrorBoundary`'s `componentDidCatch` | Only if you're using `@artisansdk/architect/react`'s `ErrorBoundary` (wrapped around your app by `ApplicationProvider`/`ContextProvider`) |

`ErrorsProvider.boot()` is a no-op when `window` is undefined, so it's safe under SSR — it just won't catch anything until it runs in a browser.

## Listening

`ArchitectError` sets a static `label = "error"`, so you can listen by the class or the string:

```typescript
import { Event } from "@artisansdk/architect/support/facades"
import { ArchitectError } from "@artisansdk/architect"

Event.listen(ArchitectError, (error) => {
  console.error(`[${error.source}]`, error.message, error.cause)
  reportToSentry(error)
})

// Equivalent — same channel
Event.listen("error", (error) => { /* ... */ })
```

## ArchitectError shape

```typescript
class ArchitectError extends Error {
  readonly source: "window" | "promise" | "react"
  readonly cause: unknown        // the original thrown value (inherited from Error)
  readonly errorInfo?: unknown   // React's componentStack info, only present for source "react"
}
```

`message` and `stack` are adopted from the original error when it's a real `Error` instance, so reports point at the throw site rather than the wrapper.

## React error boundaries

`ApplicationProvider`/`ContextProvider` from `@artisansdk/architect/react` wrap your app in an `ErrorBoundary` automatically:

```tsx
import { ContextProvider } from "@artisansdk/architect/react"

<ContextProvider application={application} errorFallback={(error) => <p>Something broke.</p>}>
  <App />
</ContextProvider>
```

`errorFallback` renders in place of the crashed subtree, and the error is dispatched to the **Events** bus. It's also reported to the `ErrorHandler`.

## Events wiring

`ErrorsProvider` registers a `Bus` as `"events"` itself, guarded so it won't replace one you've already bound. See [Events](./events.md) for the `Bus` API itself.

## ErrorHandler

Every app has an `ErrorHandler`, registered by `ErrorsProvider` and bound as `"errors"` and `ErrorHandler`. Framework code, such as the [scheduler](./scheduler.md), sends it any error that nothing closer handled.

- `report(error)` calls `error.report()` if the error implements (`Reportable`). Otherwise it logs the error with `log.error`.
- `render(error)` calls `error.render()` and returns its result if the error implements (`Renderable`). Otherwise it rethrows the error.
- `handle(error)` reports the error, then renders it.
- `level()` (`Level`) picks the level `report()` logs at, using any of the [log levels](./log.md) from `"debug"` to `"emergency"`. An unknown level falls back to `"error"`.
- `ignore()` (`Ignorable`) returning `true` skips reporting entirely, including the error's own `report()`. It still renders.

Uncaught errors reach the handler wrapped in an `ArchitectError`, so the handler reads these methods from the original error in `cause`.

```typescript
class QuotaExceeded extends Error implements Renderable, Level {
  level() {
    return "warn" as const
  }

  render() {
    toast("You're out of credits")
  }
}

class RequestAborted extends Error implements Ignorable {
  ignore() {
    return true
  }
}
```

When a log driver throws, `LogManager` throws a `LogError` in its place. `LogError` has a no-op `render()` and no `report()`. If `report()` fails with a `LogError`, `handle()` renders that `LogError` (which does nothing) and then renders the original error as usual, so a broken logger can't crash the app or hide the original error.
