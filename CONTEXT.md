# Architect Core

A dependency injection library for frontend applications. It provides a lifecycle that guarantees the container and its registered services are fully resolved before the UI framework renders, along with service providers, configuration, storage/cache management, and adapters for React, Solid, Svelte, and Vue.

## Language

**Application**:
The central orchestrator — a fluent builder consumers configure with `.withProviders([])`, `.withConfig()`, `.withRoot()`, and `.withRenderer()` before calling `.run()`.
_Avoid_: app instance, container app

**Lifecycle**:
The fixed sequence the Application follows: register all providers → boot all providers → mount renderer. Shutdown runs in exact reverse. No phase may be skipped or reordered.

**ServiceProvider**:
The unit of wiring — a class that encapsulates registration and boot for one feature area. Consumers subclass it and pass instances to `.withProviders([])`. This is the primary wiring API.
_Avoid_: plugin, module, service class

**DeferrableServiceProvider**:
A ServiceProvider subclass that declares which bindings it owns via `provides()`. The Application skips `register()`/`boot()` until one of those identifiers is resolved from the container (by `make()`, `get()`, or anything that calls through them), at which point both run once and every other declared identifier resolves normally from then on. An empty `provides()` (the default) disables deferral — the provider boots eagerly. `bound()`/`has()` don't know about pending deferred bindings; only resolution triggers the boot.

**Register/boot contract**:
The rule that `register()` must only bind into the container — never resolve. `boot()` may safely resolve any binding because all providers' `register()` calls have completed first. Violating this in `register()` risks resolving `undefined` for bindings added by later providers.

**destroy()**:
The third ServiceProvider lifecycle method, called on `Application.stop()` in reverse **boot** order (not registration order) — and only for providers that actually booted; a **DeferrableServiceProvider** nothing ever resolved never boots, so its `destroy()` is skipped too. `register()` and `boot()` are `void` — there's no cleanup-callback return value to track anymore. Whatever `destroy()` needs (a timer handle, an `AbortController`, a subscription) is tracked as an instance field by the provider itself, set during `register()`/`boot()`.

**Provider ownership**:
The principle that each ServiceProvider is the sole owner of registration, booting, and cleanup for its feature area. No other code binds or unbinds what a provider manages.

**ContainerContract**:
The interface all container implementations must satisfy. Exposes `bind()`, `singleton()`, `transient()`, `instance()`, `make()`, `bound()`, and `flush()`.
_Avoid_: IoC container, DI container (use "container")

**Tag**:
A label attached to one or more bindings via `container.tag(identifiers, ...tags)`, independent of when those bindings are registered — tagging can happen before or after `bind()`/`singleton()`/`instance()`. A tag with no registered transform (see **extendTag**) is just an inert label, usable for grouped resolution: `container.get(tagName)` returns an object keyed by each tagged identifier's string form.

**extendTag**:
Registers a transform run on a tagged binding's resolved value the first time it resolves — applied once and cached alongside the binding (a singleton/constant binding's transformed value is reused on every later `make()`; a transient binding's transform re-runs on every resolution, matching transient's meaning). Same shape as **Driver** registration via `Manager.extend()`.

**reactive() / "reactive" tag**:
`container.reactive(identifier, concrete)` registers a singleton and guarantees its resolved value is a Valtio proxy, tagging the identifier `"reactive"`. This is the one place the container's "you get back exactly what you registered" rule bends on purpose — it's an explicit, named opt-in, not a silent hook any provider can attach. **Reactive bindings are always singletons** — there is no transient `reactive()`, since a fresh proxy per resolution would defeat sharing reactive state across consumers; the scope isn't a parameter. It detects Valtio proxies (via `getVersion()`) and wraps whatever isn't one already — a plain object/class or an already-proxied value both work, no config needed either way. The React runtime's `useService` checks `container.tagged(identifier).includes("reactive")` and, if present, runs the resolved value through Valtio's `useProxy`; untagged bindings (via plain `bind`/`singleton`) are returned unchanged. `valtio` is a regular dependency of the package (not an optional peer) — `reactive()` is always available.

**BuiltinContainer**:
The only shipped container implementation. Resolves constructor dependencies via TypeScript `design:paramtypes` reflection metadata and optional `@inject` decorators. Requires `emitDecoratorMetadata: true` in tsconfig.

**ConfigRepository**:
A typed key-value store with dot-notation path access (e.g. `config.get<string>("app.name")`). Backed by a plain object; no reactivity.
_Avoid_: config store, config object, Repository (ambiguous)

**StoreManager**:
An abstraction over persistent storage backends — localStorage, IndexedDB, and extensible to native file systems (Tauri, React Native) via `extend()`. The active driver is swapped at runtime with `.use()`. Unlike **CacheManager**, it reads a single flat `store.driver` config key — no per-store config map.
_Avoid_: StorageManager (the exported class is `StoreManager`)

**Cache**:
The TTL-aware wrapper around a raw storage **Adapter**. Wraps every stored value in a `{v, e}` envelope where `e` is the absolute expiry timestamp in milliseconds (or `null` for no expiry). Expiry is checked lazily on `get` and `keys`. Per-call TTL is passed in seconds to `set(key, value, ttl?)`; `null` or omitted means no expiry; `0` expires immediately. **CacheManager** creates one **Cache** per configured driver.
_Avoid_: TtlAdapter (the class is `Cache`)

**CacheManager**:
An abstraction for TTL-based caching. Manages a set of named **Cache** drivers — each a **Cache** wrapping a raw storage **Adapter**. The active driver is swapped at runtime with `.use()`. With `local` or `indexed` drivers, values survive page reload but are still subject to TTL expiry on read. **Not designed as a primary data store.**
_Avoid_: cache store (use "CacheManager" or "cache driver")

**Driver**:
A named backend implementation registered with StoreManager or CacheManager. Built-in drivers: `memory`, `local`, `indexed`. Custom drivers are registered from a ServiceProvider's `boot()` hook via `manager.extend(name, factory)`, where the factory receives the ConfigRepository and returns an Adapter. Drivers are resolved lazily on first access and then cached.

**Fallback chain**:
The ordered list of drivers a Manager tries when the preferred driver is unavailable. Enables graceful degradation (e.g. IndexedDB → localStorage → memory) without consumer awareness.

**Renderer**:
A framework-specific adapter that mounts and unmounts the root component. Adapters are provided for React, Solid, Svelte, and Vue. Passed to `.withRenderer()`.

**LogManager**:
An abstraction over logging backends. Manages a set of named **Drivers** — each implementing the log **Contract** (`debug`, `info`, `warn`, `error`). The active driver is swapped at runtime with `.use()`. Built-in drivers: `console`, `null`, `stack`. Custom drivers are registered from a ServiceProvider's `boot()` hook via `manager.extend(name, factory)`. Drivers are resolved lazily on first use and then cached.
_Avoid_: Logger (the class is `LogManager`), logging service

**ConsoleLogger**:
The built-in log driver that writes to the browser console using native methods (`console.debug`, `console.info`, `console.warn`, `console.error`). Respects a configured minimum level threshold — messages below the threshold are silently dropped. Configured via `logging.drivers.console.level` (default: `"debug"`).

**StackLogger**:
A built-in log driver that fans out each log call to an ordered list of other drivers. Errors thrown by any individual driver are swallowed so that a logging failure cannot crash the application. Configured via `logging.drivers.stack.drivers` (an array of driver names).

**NullLogger**:
A built-in log driver that discards all messages. Useful in tests to silence output without changing application wiring.

**HttpFactory**:
The `fetch`-backed HTTP client fronted by the `Http` **Facade**, bound as `"http"` by `HttpProvider` (in `defaultProviders`). Models Laravel's `Illuminate\Http\Client\Factory`: verb methods (`get`/`post`/…) open a **PendingRequest**, dispatch it, and resolve to a **Response**. Holds the registered fakes and the recorder.
_Avoid_: HttpClient, HttpManager (it is not a **Manager** — there are no swappable drivers)

**PendingRequest**:
A configured-but-unsent request. Fluent methods (`withToken`, `baseUrl`, `asForm`, `withQueryParameters`, `timeout`, …) mutate and return `this`; a verb method sends it. Owns URL building and body encoding. Created fresh per call — never shared.

**Response**:
The result of a sent request — the http package's own class, exported as `Response` (shadows the global; the class body refers to the native one as `globalThis.Response`). Wraps a native `Response` plus its already-read body text so accessors (`status`, `ok`, `successful`, `failed`, `json`, `header`, `throw`) stay synchronous. `ok()` is exactly 200; `successful()` is any 2xx.

**Http fake**:
A canned response registered on the **HttpFactory** via `Http.fake({ pattern: value })`, so an app builds and tests without a live API. Patterns are `*`-wildcard URL globs matched loosely on protocol; first match wins. `preventStrayRequests()` turns an unmatched request into a throw; `recorded()` returns the `[request, response]` history.

**Facade**:
A static proxy that forwards calls to a service resolved from the container — no instance caching of its own, every call re-resolves via `Application.make()`. Usable from `boot()` hooks onward — not in `register()` (register/boot contract). Calling a facade before `.run()` throws. Built-in facades: `App`, `Config`, `Cache`, `Store`, `Event`, `Log`.
_Avoid_: static accessor, global service

**Macro**:
A named function added to a Facade at runtime via `facade.macro(name, fn)`. Takes precedence over instance methods of the same name. Scoped per facade accessor; cleared only by an explicit `flushMacros()`/`flushAllMacros()` call — nothing clears macros automatically on application shutdown.

**ArchitectError**:
An `Error` subclass that normalizes an uncaught error into `{ source: "window" | "promise" | "react", cause, errorInfo? }`. Adopts the original error's `message`/`stack` when it's a real `Error`. Static `label = "error"` so it can be listened for on the **Bus** by class or by the string `"error"`.

**ErrorsProvider**:
Included in `defaultProviders`. Registers `"events"` (a **Bus**) if nothing else already has, then wires `window.addEventListener("error"/"unhandledrejection", ...)` in `boot()` to dispatch an **ArchitectError** onto it — same-origin-filtered for window errors. A no-op under SSR (`boot()` checks for `window`). React's `ErrorBoundary` (wrapped around the tree by `ApplicationProvider`/`ContextProvider`) dispatches a third source, `"react"`, the same way — but only if `"events"` is bound, independent of whether the fallback UI renders.

## Relationships

- An **Application** runs one or more **ServiceProviders** in registration order
- A **DeferrableServiceProvider** extends **ServiceProvider**, deferring `register()`/`boot()` until a declared `provides()` identifier is resolved
- Each **ServiceProvider** binds into and resolves from one **ContainerContract**
- A **BuiltinContainer** implements **ContainerContract**
- A **Facade** resolves its backing service from the current **Application**'s **ContainerContract**
- An **HttpFactory** opens a **PendingRequest** per call, which resolves to a **Response**; an **Http fake** short-circuits dispatch before `fetch` is called
- A **Macro** extends a **Facade** without modifying the underlying service
- A **StoreManager**, **CacheManager**, and **LogManager** each manage a set of named **Drivers** with a **Fallback chain**
- A **StackLogger** fans out log calls to multiple named **Drivers** — errors are swallowed per driver
- An **Application** holds exactly one **Renderer**, which mounts one root component

## Example dialogue

> **Dev:** "I need to add a real-time data service that polls an external API every 30 seconds."
>
> **Domain expert:** "Write a **ServiceProvider**. In `register()`, bind your polling service class into the container. In `boot()`, start the interval — `boot()` is where you call things that depend on other bindings being present, and it's `void`, so track the interval handle on the provider instance. Clear it in `destroy()`; the **Application** calls that on shutdown, once per provider, in reverse provider order."
>
> **Dev:** "Can I access the `Config` **Facade** to read the poll interval from config?"
>
> **Domain expert:** "Yes — **Facades** are safe in `boot()`. Don't use them in `register()`, that's a **register/boot contract** violation."
>
> **Dev:** "And if this service is only needed on certain routes, can I avoid booting it eagerly?"
>
> **Domain expert:** "Make it a **DeferrableServiceProvider** and declare the binding in `provides()`. The **Application** won't call `register()`/`boot()` until something actually resolves that binding from the container."

## Flagged ambiguities

- "Repository" was used as a synonym for **ConfigRepository** — resolved: always say **ConfigRepository**; "Repository" is too generic.
- "intake" appeared as a module name in `src/config/` — resolved: renamed to `discovery.ts`; "intake" was AI-generated with no domain meaning.
- **StoreManager** and **CacheManager** were described as structurally identical — resolved: they share the same adapter shape today, but **CacheManager** is intentionally separate because it will add TTL and eviction (see `.scratch/cache-ttl-eviction/`).
