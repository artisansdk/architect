# Features

**Features** provides Archiect with feature flags. You define a feature with a value or a resolver. The **first resolved value is persisted per scope**, so a random A/B assignment stays sticky for that browser or user when stored with persistant storage.

`FeatureProvider` is **opt-in**. It is not part of `defaultProviders`, and it depends on the `"store"` binding from `StoreProvider`:

```typescript
import { Application, defaultProviders, FeatureProvider } from "@artisansdk/architect"

Application.configure()
  .use(defaultProviders)
  .use(FeatureProvider)
  .run()
```

## Defining features

Define features from a `ServiceProvider`'s `boot()` hook:

```typescript
import { Feature, Lottery } from "@artisansdk/architect/facades"

boot() {
  Feature.define("dark-mode", true) // static value
  Feature.define("new-checkout", Lottery.odds(1, 10)) // 10% rollout
  Feature.variant("checkout-variant", ["a", "b"]) // A/B variant
  Feature.variant("pricing-page", { a: 2, b: 1, c: 1 }) // weighted variants: a 50%, b 25%, c 25%
  Feature.define("beta", (scope) => scope.startsWith("staff:"))  // scope-aware
  Feature.define("remote", async () => (await fetch("/flags/remote")).ok) // async resolver
}
```

`define(name)` with no resolver means "always on". Resolvers receive the scope and then the feature name: `(scope, feature) => ...`.

### Lotteries

`Lottery.odds(chances, outOf)` wins `chances` in `outOf`, as in Pennant. `Lottery.pick(values)` draws one value, equally from a list or by weight from a map. A lottery knows nothing about scopes: `draw()` is random, and `draw(seed)` always gives the same result for the same seed.

When a lottery defines a feature, the scope decides how it draws:

| Scope | Draw | Same result on another device? |
| --- | --- | --- |
| `"global"` (the default) | Random, persisted after the first resolve | Only if the store is shared; each browser draws once |
| Any other, e.g. `"user:42"` from `resolveScopeUsing()` or `for()` | Seeded by the feature name and scope | Yes, for the same scope |
| `null` (e.g. signed out) | Not drawn; resolves to `false` | — |

Seeding with the feature name keeps a user's groups independent across features. The hash is fast but not cryptographic, so a determined user could predict their group; don't gate anything secret on it.

To ramp a rollout from 10% to 50%, raise the odds and `purge()` the feature. Users with a per-user scope who were in the 10% stay in, because their seed doesn't change.

The `Lottery` facade is bound as `"lottery"` by `FeatureProvider`. The class itself is still exported from `@artisansdk/architect` for use outside the container.

### Variants

`Feature.variant(name, values)` is shorthand for `Feature.define(name, Lottery.pick(values))`. It defines a feature that picks one of several mutually exclusive variants:

```typescript
Feature.variant("pricing-page", ["a", "b", "c"]) // a third each
Feature.variant("pricing-page", { a: 2, b: 1, c: 1 }) // a 50%, b 25%, c 25%

await Feature.value<"a" | "b" | "c">("pricing-page")
```

The first pick is persisted per scope, like any feature. How long a user keeps their variant depends on the scope and the store:

| Scope and store | Same variant for |
| --- | --- |
| `"global"` with `memory` | The session |
| `"global"` with `local` / `indexed` | Every session in this browser |
| A per-user scope | Every device, for the same user |

Changing the weights only affects scopes that haven't picked yet. To re-bucket everyone, `purge()` the feature. Use `activate(name, "b")` to force a variant. An empty list, a negative or non-finite weight, or weights that are all zero throw when the feature is defined.

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

Feature checks use string names, so register the resolver with `define()` as shown above. A class that extends `FeatureContract` can be defined directly, `Feature.define("new-api", Feature.instance(NewApi))`; its `resolve(scope, feature)` receives the feature name second.

`Feature.instance("new-api")` returns the registered resolver itself. Static definitions are returned as functions that return the defined value. An unknown name produces a function returning that name. Calling these implementations directly bypasses feature storage and caching.

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

### In React

`useFeature(name, scope?)` from `@artisansdk/architect/react` returns whether a feature is active and re-renders when it changes: after a response sync, an Echo push, `activate()`, `flushCache()`, or any other write to the default store. It returns `false` until the first check finishes, so gated UI stays hidden until access is known:

```tsx
import { useFeature } from "@artisansdk/architect/react"

function Nav() {
  const reporting = useFeature("reporting")
  return reporting ? <ReportingLink /> : null
}
```

`useFeatures()` checks several at once. A list returns a tuple, and an object of local names to feature names returns the same keys:

```tsx
const [reporting, beta] = useFeatures(["reporting", "beta"])
const { canReport, isBeta } = useFeatures({ canReport: "reporting", isBeta: "beta-ui" })
```

Inline lists and objects are fine; checks re-run only when the feature names change or the store does.

Without `scope`, both check the default scope set by `resolveScopeUsing()`. Other frameworks can subscribe to `Feature.changes()`, a `Signal` counter that every write and cache flush increments.

## Scopes

By default, features resolve for the `"global"` scope, which is the current browser or device. Use `for()` to resolve per user, team or tenant. The resolver receives the scope string:

```typescript
await Feature.for("user:42").active("beta")
await Feature.for(`team:${team.id}`).value("checkout-variant")
```

### Default scope

Change the scope used when `for()` is not called with `resolveScopeUsing()`. The callback receives the store's driver name and runs on every check, so it always reflects the current user:

```typescript
Feature.resolveScopeUsing((driver) => auth.user()?.id ?? null)

await Feature.active("beta") // checks the signed-in user, or the null scope when signed out
```

### Multiple scopes

`for()` accepts an array. `active()` and `inactive()` are true only when every scope agrees. Updates apply to every scope. Reading a value (`value`, `values`, `all`, `when`, `unless`) with more than one scope throws, because there is no single value to return. As in Pennant, an empty array is the null scope, not the default scope.

```typescript
await Feature.for([alice, bob]).activate("beta")
await Feature.for([alice, bob]).active("beta") // true when active for both
```

### Null scope

`null` is a valid scope, stored under `__architect_null`. As in Pennant, a resolver that declares a scope parameter is not called for a `null` scope; the feature resolves to `false`, and that value is stored. Static values and resolvers without parameters still resolve. To receive `null`, give the parameter a default:

```typescript
Feature.define("beta", (user: User) => user.staff) // null scope: false, resolver not called
Feature.define("banner", (user: User | null = null) => user === null) // receives null
```

JavaScript has no runtime parameter types, so a default value takes the place of Pennant's nullable type hint.

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

## Server-owned features (Laravel Pennant)

When the server decides some features, for example with Laravel Pennant, write its values with `sync()` instead of resolving them. A resolver runs once and is then persisted, so it would miss later changes on the server. `sync()` takes a list of active names or a name → value map:

```typescript
await Feature.for(user).sync(["simulator", "scanner"]) // list: each name is true
await Feature.for(user).sync({ simulator: true, checkout: "b" }) // map: values as sent
```

Ownership decides what happens to features the server leaves out:

- A feature the server **sends** is written with the server's value, overwriting any local value.
- A feature **defined locally** with `define()` is client-owned. If the server leaves it out, its stored value or resolver stands, so a local `Lottery` keeps working.
- A feature that is **stored but not defined locally** came from the server. If the server stops sending it, the server revoked it: it is forgotten and reads `false`.

Don't `define()` a server-owned feature on the client: the server could still grant it, but leaving it out would no longer revoke it.

### Syncing from responses

Set `feature.sync` to `true` and, with `FeatureProvider` booted and the `"http"` binding from `defaultProviders`, every JSON response from Architect's HTTP client is checked for features. They are synced before the response is returned, so access is gained or lost on the next request, whichever endpoint it hits. A sync that fails is logged and never fails the request. It is off by default; without it, call `Feature.syncResponse()` yourself where you want it.

By default, `JsonApiUserFeatures` reads `data.attributes.features` from a JSON:API `users` resource:

```json
{ "data": { "type": "users", "id": "42", "attributes": { "features": ["simulator", "scanner"] } } }
```

On the Laravel side, put the active names on the user resource:

```php
'features' => collect(Feature::for($this->resource)->all())->filter()->keys(),
```

Use another shape by implementing `ExtractsFeatures` (or extending `JsonApiUserFeatures`). `features(body)` returns a list, a map, or `null` when the body carries none. The optional `scope(body)` names the scope they belong to; implement it for login responses, which arrive before the app knows the user, so the default scope would still be the signed-out one:

```typescript
import type { ExtractsFeatures } from "@artisansdk/architect"

class UserFeatures implements ExtractsFeatures {
  features(body: any) {
    return body?.user?.flags ?? null
  }

  scope(body: any) {
    return body?.user ? `user:${body.user.id}` : undefined // undefined: the default scope
  }
}

Feature.extractFeaturesUsing(new UserFeatures())
```

Using `fetch` or another HTTP client? Pass its parsed body yourself: `await Feature.syncResponse(await response.json())`.

`HttpFactory.globalResponseMiddleware(callback)` is the hook this uses; it runs a callback on every response, faked or real, before it is returned.

### Fetching from a features endpoint

If features aren't on the user resource, `FeatureRemoteDriver` fetches them from an endpoint and keeps them in a store adapter:

```typescript
import { FeatureRemoteDriver } from "@artisansdk/architect"
import { Feature, Http, Store } from "@artisansdk/architect/facades"

Feature.extend("remote", () =>
  new FeatureRemoteDriver(Store.driver("local"), async () => (await Http.timeout(3).get("/features")).json()),
)
// config/feature.ts: { store: "remote" }
```

```php
Route::middleware('auth')->get('/features', fn (Request $request) => Feature::for($request->user())->all());
```

The fetcher receives the scope and returns a list or a map. Each scope is fetched once per session, before its first check, and the same ownership rules apply. If the fetch fails, stored and local values are used and the next check tries again; give the fetcher a timeout, since first checks wait for it. `Feature.flushCache()` refetches. `activate()` and the other local writes are never sent to the server, and the next fetch overwrites them. `all()` includes features only the server knows about.

### Pushing changes

To update a signed-in user without waiting for their next request, broadcast when Pennant changes their features and call `sync()` from the listener:

```php
Event::listen([FeatureUpdated::class, FeatureDeleted::class], function ($event) {
    if ($event->scope instanceof User) {
        broadcast(new FeaturesChanged($event->scope)); // broadcastWith(): the user's active feature names
    }
});
```

```typescript
Echo.private(`App.Models.User.${user.id}`).listen("FeaturesChanged", (event) => Feature.for(user).sync(event.features))
```

Pennant's `FeatureUpdatedForAllScopes` and purge events carry no user, so for those, call `Feature.flushCache()` (with `FeatureRemoteDriver`) or rely on the next response.

## Persistence

Flags are stored under `feature:<encoded-name>:<serialized-scope>`. Feature names use `encodeURIComponent`, so names containing `:` cannot collide with scope separators. Ordinary names such as `new-checkout` retain their existing keys. Previously stored names containing characters changed by this encoding need migration or reassignment; legacy keys are not migrated automatically. With the default `memory` store, assignments only last until the page reloads. Set `feature.store` to keep them sticky across reloads, without changing the app's default store:

```typescript
// config/feature.ts
export default {
  store: "local", // "memory" | "local" | "indexed", or a custom driver registered via Store.extend()
}
```

If `feature.store` is not set, the default store driver is used.

Use `store()` to work with another store driver, including a custom one registered with `Store.extend()`. Each store keeps its own definitions, as in Pennant, so define features on the store you check them with:

```typescript
const remote = Feature.store("redis")
remote.define("beta", (user: User) => user.staff)
await remote.for(user).active("beta")
```

Register a feature driver that isn't a store adapter with `extend()`, such as `FeatureRemoteDriver` (see [Fetching from a features endpoint](#fetching-from-a-features-endpoint)). The factory runs once, when the store is first used:

```typescript
Feature.extend("remote", (config) => new MyFeatureDriver(config.get("feature.url")))
await Feature.store("remote").active("beta")
```

`Feature` is backed by `FeatureManager`, bound as `"feature"` and by class. Like Pennant's manager, it holds the stores, `extend()`, `resolveScopeUsing()` and a `flushCache()` that clears every store, and sends every other call to the default store.

## Using the class directly

`Features` is also bound by class, resolving to the default store. Construct it with a `FeatureDriver`. `FeatureStoreDriver` adapts any Architect `StoreAdapter`, which is handy in tests:

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
| `ExtractsFeatures` | Maps a parsed response body to server-owned features (`features(body)`) and optionally their scope (`scope(body)`). Set with `Feature.extractFeaturesUsing()`. |
| `FeatureScopeable` | Converts an object through `toFeatureIdentifier(driverName)` before passing it to the driver and resolver. |
| `FeatureScopeSerializable` | Supplies a stable string through `featureScopeSerialize()` for storage and cache keys. |
| `HasFlushableCache` | Optional synchronous `flushCache()` hook, called after clearing the shared `Features` cache. |

`FeatureStoreDriver` implements `FeatureDriver`, `CanListStoredFeatures`, and `CanSetManyFeaturesForScopes`. `FeatureRemoteDriver` extends it with `DefinesFeaturesExternally` and `HasFlushableCache`. `sync()` needs `CanListStoredFeatures` to find revoked features. Custom drivers can implement the other capabilities as needed. Unlike Laravel's database driver, this driver uses Architect's memory, local-storage, IndexedDB, or custom store adapters.

### Object scopes

Strings, finite numbers, and `null` are supported directly. Numbers serialize to strings; `null` uses the reserved identifier `__architect_null`. Other objects must implement a scope hook. Serialization keeps the original object available to the resolver:

```typescript
import type { FeatureScopeSerializable } from "@artisansdk/architect"

class User implements FeatureScopeSerializable {
  constructor(public id: number, public staff: boolean) {}

  featureScopeSerialize(): string {
    return `user:${this.id}`
  }
}

features.define("beta", (user: User) => user.staff)
await features.for(new User(42, true)).active("beta")
```

Use `FeatureScopeable` when the resolver should receive a converted identifier instead. Its `toFeatureIdentifier(driverName)` result becomes the scope passed to the resolver and is then serialized for storage. As in Pennant, the driver name is the store's name: `feature.store` when configured, otherwise the active store driver (for example `"local"`). The same name identifies the default store, so `Feature.store("local")` returns it. A directly constructed `Features` instance uses the driver name `"store"` unless you pass one as its fifth argument. Objects without a supported hook throw instead of silently sharing an `[object Object]` key.

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
