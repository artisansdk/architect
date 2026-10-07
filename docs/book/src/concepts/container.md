# Service Container

The **Service Container** is a powerful tool for managing class dependencies and performing dependency injection. The container resolves constructor dependencies automatically using TypeScript's `design:paramtypes` reflection metadata. Enable it in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

And import `reflect-metadata` once at your entry point:

```typescript
import "reflect-metadata"
```

## Binding

### Singleton

Resolved once; the same instance is returned on every subsequent `make()`.

```typescript
container.singleton(UserRepository, UserRepository)
```

Additionally a factory can be passed to construct the instance when it is first resolved, then the result will be cached for future resolution.

```typescript
container.singleton(UserRepository, () => new UserRepository({ /* config */ }))
```

### Transient

A new instance is created on every `make()`.

```typescript
container.bind(RequestHandler, RequestHandler)
```

### Constant value

Registers an existing value directly. Use this for configuration objects, third-party instances, or anything already constructed.

```typescript
container.instance(ApiConfig, { url: "https://api.example.com", timeout: 5000 })
```

### Reactive

Registers a singleton whose resolved value is guaranteed to be a [Valtio](https://valtio.dev) proxy, and tags the binding `"reactive"`. This is the only binding kind the container is allowed to modify — and only once, going in: the concrete is wrapped the moment it's built into the singleton, not re-touched on later `make()` calls. Every other binding kind returns exactly what you registered.

```typescript
container.reactive(Menu, Menu)
container.reactive("cart", { items: [] })
```

- **Always a singleton.** There is no transient `reactive()` — a fresh proxy per resolution would defeat sharing reactive state across everything that resolves it.
- The container detects Valtio proxies on the way in and wraps whatever isn't one already you may pass a plain class, object, or factory, or an already-proxied value and the container will handle it.

### Fluent binding

The fluent API gives you more control over scope and factory behaviour:

```typescript
// Bind to a class with explicit scope
container.bind(MyService).to(MyServiceImpl).inSingletonScope()
container.bind(MyService).to(MyServiceImpl).inTransientScope()

// Bind to a constant value
container.bind("config.url").toConstantValue("https://api.example.com")

// Bind to a factory that receives the container
container.bind(MyService).to((container) => {
  const config = container.make(ApiConfig)
  return new MyService(config.url)
})
```

## Resolving

```typescript
const service = container.make(UserRepository)

// Alias
const service = container.get(UserRepository)
```

## Identifiers

Bindings can be keyed by class, string, or symbol:

```typescript
container.singleton(UserRepository, UserRepository)         // class key
container.instance("api.url", "https://api.example.com")   // string key
container.instance(Symbol("db"), connection)               // symbol key
```

## Aliases

`container.alias(alias, target)` gives a binding another identifier. The alias comes first; the target is the identifier to resolve. Both can be a class, string, or symbol.

```typescript
container.singleton(UserRepository, UserRepository)
container.alias("users", UserRepository)

container.make("users") === container.make(UserRepository) // true
```

Aliases resolve the target each time, preserving its scope: a singleton returns the same instance, while a transient creates a new instance. You can declare an alias before binding its target, as long as the target is bound before resolution. `alias()` returns the container for chaining.

## Auto-wiring

When you bind a class, the container reads its constructor parameter types from metadata and resolves each one automatically:

```typescript
class ApiClient {
  constructor(protected config: ApiConfig, protected logger: Logger) {}
}

container.singleton(ApiConfig, ApiConfig)
container.singleton(Logger, Logger)
container.singleton(ApiClient, ApiClient)

// ApiConfig and Logger are injected automatically
const client = container.make(ApiClient)
```

## Manual injection tokens

When a constructor parameter is typed as an interface or primitive, metadata can't infer the token. Use `@inject()` to specify it explicitly:

```typescript
import { inject } from "@artisansdk/architect"

class ApiClient {
  constructor(
    @inject("api.url") protected url: string,
    protected logger: Logger,
  ) {}
}
```

## Checking bindings

```typescript
container.bound(UserRepository)  // true / false
container.has("api.url")         // alias for bound()
```
