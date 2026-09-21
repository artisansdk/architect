# Config

**ConfigRepository** is a typed key-value store with dot-notation path access. It's registered automatically by the Application — you don't need a provider for it.

## Reading values

```typescript
import { Config } from "@artisansdk/architect/support/facades"

Config.get("app.name")               // string | null
Config.get<string>("app.name")       // string | null
Config.get("app.timeout", 30)        // returns 30 if not set
Config.get("app.timeout", () => 30)  // lazy default
```

Dot notation traverses nested objects — `"app.name"` reads `{ app: { name: "..." } }`.

## Checking existence

```typescript
Config.has("app.name")         // true if set and not null
Config.has(["app.name", "app.url"])  // true if all are set
```

## Writing values

```typescript
Config.set("app.name", "My App")
Config.set({ "app.name": "My App", "app.debug": true })
```

## Arrays

```typescript
Config.prepend("app.middleware", LogMiddleware)  // add to front
Config.push("app.middleware", AuthMiddleware)    // add to end
```

## Getting multiple keys

```typescript
Config.getMany(["app.name", "app.url"])
// → { "app.name": "...", "app.url": "..." }

Config.getMany({ "app.name": "default", "app.url": null })
// → uses per-key defaults
```

## Inline config

Pass config directly to `Application.configure()`:

```typescript
Application.configure({
  config: {
    app: { name: "My App", debug: false },
    cache: { default: "memory" },
  },
})
```

Or register it with `use()`, which treats any object that isn't a **ServiceProvider** as config and deep merges each call:

```typescript
Application
  .use({ app: { name: "My App" } })
  .use({ app: { debug: false } })      // merges — `name` survives
  .use({ cache: { default: "memory" } })
```

## File-based config

In a Vite project, place config files in a `config/` directory:

```typescript
// config/app.ts
export default {
  name: import.meta.env.VITE_APP_NAME ?? "My App",
  debug: import.meta.env.DEV,
}
```

The Application loads these automatically via `import.meta.glob`. The filename becomes the top-level key — `config/app.ts` is available under `"app.*"`.

File-based and inline config combine: discovered files load first, then inline config (from `configure({ config })` or `use()`) is deep merged over them, so inline values win on conflicting keys and unrelated keys from both sources survive.

## Environment variables

Use the `env()` helper to read environment variables with an optional default:

```typescript
import { env } from "@artisansdk/architect"

const url = env("VITE_API_URL", "http://localhost:3000")
```

`env()` is separate from file-based config — it reads directly from `import.meta.env`.

## Using ConfigRepository directly

In a ServiceProvider, the ConfigRepository is bound as `"config"` and by class:

```typescript
import { ConfigRepository, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const config = container.make(ConfigRepository)
  const timeout = config.get<number>("api.timeout", 5000)
}
```
