# Features

**Features** is provides Archiect with feature flags. You define a feature with a value or a resolver. The **first resolved value is persisted per scope**, so a random A/B assignment stays sticky for that browser or user when stored with persistant storage.

`FeatureProvider` is **opt-in**. It is not part of `defaultProviders`, and it depends on the `"store"` binding from `StoreProvider`:

```typescript
import { Application, defaultProviders, FeatureProvider } from "@artisansdk/architect"

Application.configure()
  .withProviders([
    ...defaultProviders,
    FeatureProvider
    ])
  .run()
```

## Defining features

Define features from a `ServiceProvider`'s `boot()` hook:

```typescript
import { Feature } from "@artisansdk/architect/facades"

boot() {
  Feature.define("dark-mode", true) // static value
  Feature.define("new-checkout", () => Math.random() < 0.1) // 10% rollout
  Feature.define("checkout-variant", () => (Math.random() < 0.5 ? "a" : "b")) // A/B variant
  Feature.define("beta", (scope) => scope.startsWith("staff:"))  // scope-aware
  Feature.define("remote", async () => (await fetch("/flags/remote")).ok) // async resolver
}
```

`define(name)` with no resolver means "always on".

### Resolving a feature class

`Feature.instance(FeatureClass)` returns the class instance from the application container, including any configured constructor dependencies. It does not call `resolve()` or persist a feature value:

```typescript
class NewApi {
  resolve(scope: string) {
    return scope.startsWith("staff:")
  }
}

// Resolve the instance once
const instance = Feature.instance(NewApi)
// Define the feature 
Feature.define("new-api", (scope) => instance.resolve(scope))
```

Feature checks use string names, so register the resolver with `define()` as shown above.

`Feature.instance("new-api")` returns the registered resolver itself. Static definitions are returned as functions that return the defined value. As in Pennant 1.x, an unknown name produces a function returning that name. Calling these implementations directly bypasses feature storage and caching.

## Checking features

The API is async because flags are read from and written to the store:

```typescript
await Feature.active("new-checkout") // boolean
await Feature.inactive("new-checkout") // boolean
await Feature.value("checkout-variant") // "a" | "b"

await Feature.when(
  "checkout-variant",
  (variant) => renderCheckout(variant),
  () => renderLegacyCheckout(),
)

await Feature.unless(
  "checkout-variant",
  () => renderLegacyCheckout(),
  (variant) => renderCheckout(variant),
)
```

`unless()` runs its first callback when the feature is inactive. Its optional second callback receives the active feature value. Like `when()`, it returns the selected callback's result, or `undefined` when no callback matches.

Both methods pass the current scoped `Features` object to callbacks: `(value, features)` when active and `(features)` when inactive. `unless()` delegates to `when()` with the callbacks swapped.

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

Flags are stored under `feature:<encoded-name>:<serialized-scope>`. Feature names use `encodeURIComponent`, so names containing `:` cannot collide with scope separators. Ordinary names such as `new-checkout` retain their existing keys. Previously stored names containing characters changed by this encoding need migration or reassignment; legacy keys are not migrated automatically. With the default `memory` store, assignments only last until the page reloads. Set `feature.store` to keep them sticky across reloads, without changing the app's default store:

```typescript
// config/feature.ts
export default {
  store: "local", // "memory" | "local" | "indexed", or a custom driver registered via Store.extend()
}
```

If `feature.store` is not set, the default store driver is used.

## Using the class directly

`Features` is also bound by class. Construct it with a `FeatureDriver`. `FeatureStoreDriver` adapts any Architect `StoreAdapter`, which is handy in tests:

```typescript
import { Features, FeatureStoreDriver, MemoryStoreAdapter } from "@artisansdk/architect"

const features = new Features(new FeatureStoreDriver(new MemoryStoreAdapter())).define("beta", true)
await features.active("beta") // true
```


## Feature drivers and contracts

`Features` handles scoped interactions and cached values; `FeatureStoreDriver` handles feature definitions and persistence through an Architect store adapter. Storage operations are asynchronous.

`Features` accepts only a `FeatureDriver`. Wrap an Architect store adapter explicitly with `new FeatureStoreDriver(adapter)`, or supply a custom feature driver. `FeatureProvider` selects the store adapter through `feature.store`, falling back to the active store adapter, and wraps it in a `FeatureStoreDriver`.

```typescript
import { Features, FeatureStoreDriver, MemoryStoreAdapter } from "@artisansdk/architect"

const driver = new FeatureStoreDriver(new MemoryStoreAdapter())
const features = new Features(driver)
features.define("beta", false)

features.defined() // registered feature names
await features.stored() // names with persisted values, across all scopes
await features.for("user:42").all() // all defined features and their values for this scope
features.getDriver() // underlying feature driver
```

All contracts are exported from the package root and individual `feature/contracts/*` subpaths:

| Contract | Behavior |
| --- | --- |
| `FeatureDriver` (`Driver` in its subpath) | Defines `define`, `defined`, `getAll`, `get`, `set`, `setForAllScopes`, `delete`, and `purge`. |
| `CanListStoredFeatures` | Optional `stored()` capability. Calling `Features.stored()` without it throws. |
| `CanSetManyFeaturesForScopes` | Optional `setAll()` capability, receiving `{ feature, scope, value }` entries. Without it, `Features` calls `set()` for each entry. |
| `DefinesFeaturesExternally` | Optional `definedFeaturesForScope()` capability used by `all()`. Otherwise, locally defined feature names are used. |
| `FeatureScopeable` | Converts an object through `toFeatureIdentifier(driverName)` before passing it to the driver and resolver. |
| `FeatureScopeSerializeable` | Supplies a stable string through `featureScopeSerialize()` for storage and cache keys. The spelling matches Pennant. |
| `HasFlushableCache` | Optional synchronous `flushCache()` hook, called after clearing the shared `Features` cache. |

`FeatureStoreDriver` implements `FeatureDriver`, `CanListStoredFeatures`, and `CanSetManyFeaturesForScopes`. Custom drivers can implement the other capabilities as needed. Unlike Laravel's database driver, this driver uses Architect's memory, local-storage, IndexedDB, or custom store adapters.

### Object scopes

Strings, finite numbers, and `null` are supported directly. Numbers serialize to strings; `null` uses the reserved identifier `__architect_null`. Other objects must implement a scope hook. Serialization keeps the original object available to the resolver:

```typescript
import type { FeatureScopeSerializeable } from "@artisansdk/architect"

class User implements FeatureScopeSerializeable {
  constructor(public id: number, public staff: boolean) {}

  featureScopeSerialize(): string {
    return `user:${this.id}`
  }
}

features.define("beta", (user: User) => user.staff)
await features.for(new User(42, true)).active("beta")
```

Use `FeatureScopeable` when the resolver should receive a converted identifier instead. Its `toFeatureIdentifier(driverName)` result becomes the scope passed to the resolver and is then serialized for storage. A directly constructed `Features` instance uses the driver name `"store"` by default; the provider passes the explicit `feature.store` name when configured. Objects without a supported hook throw instead of silently sharing an `[object Object]` key.

The abstract `FeatureContract<TScope = string>` also accepts a scope type for class resolvers. Existing unannotated callbacks retain string scope inference. Match each resolver's scope type to the scopes supplied by your application; TypeScript cannot enforce this relationship across string feature names.

### Bulk operations and cache flushing

```typescript
await features.setAll([
  { feature: "beta", scope: "user:1", value: true },
  { feature: "beta", scope: "user:2", value: "variant-b" },
])

await features.getAll({ beta: ["user:1", "user:2"] })
// { beta: [true, "variant-b"] }, also cached for subsequent scoped reads

await features.for("user:1").activate(["beta", "new-search"])
await features.for("user:1").forget(["beta", "new-search"])
await features.activateForEveryone("beta")
await features.deactivateForEveryone(["beta", "new-search"])
await features.purge(["beta", "new-search"])
features.flushCache()
```

The “everyone” methods update existing stored scopes. Future scopes still use the registered resolver. `purge()` removes stored values across scopes but retains definitions. `flushCache()` clears cached resolutions across all views and calls the driver's optional cache hook; with `FeatureStoreDriver`, persisted assignments remain intact.
