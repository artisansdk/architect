# Application & Lifecycle

`Application` is the central orchestrator. You register providers and config on it, then call `run()` to start the lifecycle.

## Registering with `use()`

`use()` inspects whatever you hand it and routes it to the right place:

```typescript
import { Application, defaultProviders } from "@artisansdk/architect"

const application = Application
  .use(defaultProviders)              // an array of providers
  .use(AuthProvider)                  // a provider class — instantiated for you
  .use(new ApiProvider())             // a provider instance
  .use({ app: { name: "My App" } })   // anything else is config, deep merged
```

The rule is simple: anything that is (or produces) a **ServiceProvider** is registered as a provider; any other object is treated as config. Arrays recurse, so `[AuthProvider, new ApiProvider(), [OtherProvider]]` all register correctly. Repeated config objects deep merge rather than replace. Plain functions are rejected — pass a class, an instance, or a config object.

`Application.use()` is a static entry point that creates an application with default options, so you only need `configure()` when you want to change them.

## Configuration

`Application.configure()` accepts an options object and returns the same builder:

```typescript
const application = Application.configure({
  basePath: "./src",
  config: { app: { name: "My App" } },
}).use(AuthProvider)
```

| Option | Type | Description |
|--------|------|-------------|
| `config` | `Record<string, unknown>` | Inline config. Deep merged over any file-based config discovered at `basePath`, with inline values winning. See [Config](../services/config.md#file-based-config). |
| `basePath` | `string` | Root path for config file discovery (default `"./"`) |
| `container` | `{ factory?: (() => ContainerContract) \| null }` | Supply a factory to use a custom container implementation instead of the built-in one |

`withProviders()` remains available and now accepts classes as well as instances:

```typescript
Application.configure().withProviders([AuthProvider, new ApiProvider()])
```

## Running

```typescript
const { container, stop } = application.run()
```

`run()` returns `{ container, stop }`. The Application registers a `beforeunload` listener that calls `stop()` automatically, so you rarely need to call it yourself.

## Lifecycle Order

The fixed sequence is:

1. **Register** — every provider's `register()` runs in the order they were added
2. **Boot** — every provider's `boot()` runs after all `register()` calls complete
3. **Shutdown** — every provider's `destroy()` runs, in reverse provider order

No phase can be skipped or reordered. This guarantee is why `boot()` can safely resolve any binding — all providers have already registered by the time any `boot()` runs.

## Resolving from outside providers

After `run()`, you can resolve bindings anywhere via the static `Application.make()`:

```typescript
const service = Application.make(MyService)
```

This reads from the current Application's container. It throws if called before `run()`.
