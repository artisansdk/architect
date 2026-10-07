# Features

**Features** brings [Laravel Pennant](https://laravel.com/docs/pennant)-style feature flags to Architect. You define a feature with a value or a resolver. The **first resolved value is persisted per scope**, so a random A/B assignment stays sticky for that browser or user.

`FeatureProvider` is **opt-in**. It is not part of `defaultProviders`, and it depends on the `"store"` binding from `StoreProvider`:

```typescript
import { Application, defaultProviders, FeatureProvider } from "@artisansdk/architect"

Application.configure()
  .withProviders([...defaultProviders, new FeatureProvider()])
  .run()
```

## Defining features

Define features from a `ServiceProvider`'s `boot()` hook:

```typescript
import { Feature } from "@artisansdk/architect/facades"

boot() {
  Feature.define("dark-mode", true)                                     // static value
  Feature.define("new-checkout", () => Math.random() < 0.1)             // 10% rollout
  Feature.define("checkout-variant", () => (Math.random() < 0.5 ? "a" : "b")) // A/B variant
  Feature.define("beta", (scope) => scope.startsWith("staff:"))         // scope-aware
  Feature.define("remote", async () => (await fetch("/flags/remote")).ok) // async resolver
}
```

`define(name)` with no resolver means "always on".

## Checking features

The API is async because flags are read from and written to the store:

```typescript
await Feature.active("new-checkout")       // boolean
await Feature.inactive("new-checkout")     // boolean
await Feature.value("checkout-variant")     // "a" | "b"

await Feature.when(
  "checkout-variant",
  (variant) => renderCheckout(variant),
  () => renderLegacyCheckout(),
)
```

- Any value other than `false` counts as **active**. A resolver that returns `null` or `undefined` is stored as `false`.
- A feature that was never defined is `false`, and that value is **not** stored. If you define it later, it resolves normally.
- Concurrent first reads share a single resolution, so `Promise.all([value(x), value(x)])` can never assign two different variants.

## Scopes

By default, features resolve for the `"global"` scope, which is the current browser or device. Use `for()` to resolve per user, team or tenant. The resolver receives the scope string:

```typescript
await Feature.for("user:42").active("beta")
await Feature.for(`team:${team.id}`).value("checkout-variant")
```

## Overrides

```typescript
await Feature.activate("new-checkout")            // force on (stores true)
await Feature.activate("checkout-variant", "b")   // force a specific variant
await Feature.deactivate("new-checkout")          // force off (stores false)
await Feature.for("user:42").activate("beta")     // override for one scope

await Feature.forget("new-checkout")              // drop the stored value; re-resolves on next read
await Feature.purge("checkout-variant")           // drop the stored value for every scope (end the experiment)
await Feature.purge()                             // drop the stored values of every feature
```

## Persistence

Flags are stored in the store under the key `feature:<name>:<scope>`. With the default `memory` store, assignments only last until the page reloads. Set `feature.store` to keep them sticky across reloads, without changing the app's default store:

```typescript
// config/feature.ts
export default {
  store: "local", // "memory" | "local" | "indexed", or a custom driver registered via Store.extend()
}
```

If `feature.store` is not set, the active store driver is used.

## Using the class directly

`Features` is also bound by class. You can construct it around any `StoreAdapter`, which is handy in tests:

```typescript
import { Features, MemoryStoreAdapter } from "@artisansdk/architect"

const features = new Features(new MemoryStoreAdapter()).define("beta", true)
await features.active("beta") // true
```
