# Facades

A **Facade** is a static proxy that forwards calls to a service resolved from the container. Facades are safe to use from `boot()` hooks onward — calling one before the Application has run throws.

## Built-in facades

| Facade | Proxies |
|--------|---------|
| `App` | The active `ContainerContract` itself |
| `Config` | `ConfigRepository` | 
| `Cache` | `CacheManager` | 
| `Store` | `StoreManager` | 
| `Event` | `Bus` | 
| `Log` | `LogManager` |
| `Http` | `HttpFactory` |

```typescript
import { App, Config, Cache, Store, Event, Log, Http } from "@artisansdk/architect/support/facades"
```

## Creating a custom facade

```typescript
import { createFacade } from "@artisansdk/architect/facade"
import type MyService from "./my-service"

export const MyFacade = createFacade<MyService>("my-service")
```

The string `"my-service"` is the container binding key. Bind it in a ServiceProvider:

```typescript
register(container) {
  container.singleton("my-service", MyService)
}
```

## Macros

A **Macro** is a named function added to a Facade at runtime. It takes precedence over instance methods of the same name.

```typescript
import { Config } from "@artisansdk/architect/facades"

Config.macro("required", (instance, key: string) => {
  const value = instance.get(key)
  if (value === null) throw new Error(`Config key "${key}" is required.`)
  return value
})

// Now callable as a regular method
const name = Config.required("app.name")
```

The macro receives the resolved service instance as its first argument, followed by any arguments passed at the call site.

### Scoping

Macros are scoped per facade — a macro on `Config` does not appear on `Cache`.

### Checking and removing macros

```typescript
Config.hasMacro("required")  // true
Config.flushMacros()         // remove all macros from this facade
```

## Resolution, not caching

A facade holds no instance of its own — every property or method access resolves the accessor fresh from the current Application's container (`Application.make(accessor)`). There's nothing to clear on shutdown or manually flush for tests.

Whether you get the *same* underlying instance across calls depends entirely on how that binding was registered, same as calling `container.make(...)` directly: a `singleton()` binding returns the same instance every time; a `bind()` (transient) binding returns a new one on each resolution.
