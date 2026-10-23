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
Log.notice("User changed their email")
Log.warn("Cache miss — falling back to API")
Log.error("Request failed", { status: 500, url: "/api/users" })
Log.critical("Payment provider unreachable")
Log.alert("Checkout is down")
Log.emergency("App cannot start")
```

The levels follow Monolog (RFC 5424), from least to most severe: `debug`, `info`, `notice`, `warn`, `error`, `critical`, `alert`, `emergency`. Monolog calls `warn` `warning`. Here it's `warn`, to match the native console. Every method accepts an optional structured context object as its second argument.

## Drivers

| Driver | Behaviour |
|--------|-----------|
| `console` | Writes to the browser console using native `console.debug/info/warn/error`: `notice` goes to `console.info`, and `critical`, `alert` and `emergency` go to `console.error`. Respects a minimum level threshold. |
| `null` | Discards all messages. Useful in tests. |
| `stack` | Fans out each call to an ordered list of other drivers. Errors thrown by individual drivers are swallowed. |

## Configuration

```typescript
Application.configure({
  config: {
    logging: {
      default: "console",
      drivers: {
        console: { level: "notice" }, // suppress debug and info in production
      },
    },
  },
})
```

### Level threshold

`ConsoleLogger` supports a minimum level. Messages below the threshold are silently dropped, and the threshold level and everything more severe pass. The default is `"debug"`, which passes everything. For production, `"notice"` drops `debug` and `info` and keeps everything from `notice` up.

The threshold is set per driver, as with Monolog handlers. A custom driver that needs one can take a level from its own config and check it against the exported `logLevels`.

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

The log `Contract` requires one method per level:

```typescript
interface Contract {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  notice(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
  critical(message: string, context?: Record<string, unknown>): void
  alert(message: string, context?: Record<string, unknown>): void
  emergency(message: string, context?: Record<string, unknown>): void
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
