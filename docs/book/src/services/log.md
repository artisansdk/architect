# Logging

**LogManager** routes log messages to one or more named drivers. Drivers are resolved lazily and can be swapped at runtime with `.use()`. Three drivers ship out of the box: `console`, `null`, and `stack`.

`LogProvider` is a core provider — like config, every application registers it automatically, so `"log"` is always bound. Framework code (e.g. the Scheduler) logs through it rather than calling `console` directly, and your services should too:

```typescript
import { Application } from "@artisansdk/architect"

Application.configure().run() // "log" is bound
```

## Basic usage

Use the `Log` facade from any `boot()` hook or service:

```typescript
import { Log } from "@artisansdk/architect/support/facades"

Log.debug("Fetching user", { userId: 42 })
Log.info("User loaded")
Log.warn("Cache miss — falling back to API")
Log.error("Request failed", { status: 500, url: "/api/users" })
```

All four methods accept an optional structured context object as their second argument.

## Drivers

| Driver | Behaviour |
|--------|-----------|
| `console` | Writes to the browser console using native `console.debug/info/warn/error`. Respects a minimum level threshold. |
| `null` | Discards all messages. Useful in tests. |
| `stack` | Fans out each call to an ordered list of other drivers. Errors thrown by individual drivers are swallowed. |

## Configuration

```typescript
Application.configure({
  config: {
    logging: {
      default: "console",
      drivers: {
        console: { level: "warn" }, // suppress debug and info in production
      },
    },
  },
})
```

### Level threshold

`ConsoleLogger` supports a minimum level. Messages below the threshold are silently dropped.

| Level | What passes |
|-------|-------------|
| `"debug"` | All messages (default) |
| `"info"` | `info`, `warn`, `error` |
| `"warn"` | `warn`, `error` |
| `"error"` | `error` only |

## Fan-out with the stack driver

Use `stack` to write to multiple drivers simultaneously. Errors thrown by any individual driver are caught and swallowed — a logging failure will never crash the application.

```typescript
Application.configure({
  config: {
    logging: {
      default: "stack",
      drivers: {
        stack: { drivers: ["console", "sentry"] },
        console: { level: "debug" },
        sentry: {},
      },
    },
  },
})
```

## Registering a custom driver

Register custom drivers from a `ServiceProvider`'s `boot()` hook. The factory receives `ConfigRepository` and must return an object implementing the log `Contract`:

```typescript
import { LogManager, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const manager = container.make(LogManager)

  manager.extend("sentry", (config) => {
    return new SentryLogger(config.get("logging.drivers.sentry.dsn"))
  })
}
```

The log `Contract` requires four methods:

```typescript
interface Contract {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}
```

## Switching drivers at runtime

```typescript
import { Log } from "@artisansdk/architect/support/facades"

Log.use("null")   // silence all output
Log.use("stack")  // restore fan-out
```

## Using LogManager directly

```typescript
import { LogManager, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const log = container.make(LogManager)
  log.info("Provider booted")
}
```
