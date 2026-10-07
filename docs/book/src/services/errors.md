# Errors

**ErrorsProvider** catches uncaught errors — window errors, unhandled promise rejections, and (in React) render errors — and dispatches them onto the **Events** bus as a normalized **ArchitectError**, so you can observe them from one place instead of wiring `window.addEventListener` yourself.

It's included in `defaultProviders`:

```typescript
import { Application, defaultProviders } from "@artisansdk/architect"

Application.configure().withProviders(defaultProviders).run()
```

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
  readonly source: "window" | "promise" | "react" | "hashing" | "encryption"
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

`errorFallback` renders in place of the crashed subtree. Dispatch to the **Events** bus is a separate side effect — it only fires if `"events"` is bound in the container, which `ErrorsProvider` (or `EventsProvider`) provides. Without either, the fallback still renders; the error just isn't dispatched anywhere.

## Bringing your own events wiring

If you're not using `defaultProviders`, `ErrorsProvider` still only needs `"events"` to exist — it registers a `Bus` itself, guarded so it won't replace one you've already bound:

```typescript
import { Application, ErrorsProvider } from "@artisansdk/architect"

Application.configure()
  .withProviders([new ErrorsProvider()])
  .run()
```

See [Events](./events.md) for the `Bus` API itself.
