# @artisansdk/architect

[![npm version](https://img.shields.io/npm/v/%40artisansdk%2Farchitect.svg)](https://www.npmjs.com/package/@artisansdk/architect)
[![CI](https://github.com/artisansdk/architect/actions/workflows/publish.yml/badge.svg)](https://github.com/artisansdk/architect/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/github/license/artisansdk/architect.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-book-red)](https://artisansdk.github.io/architect/)

A Laravel-inspired application container for frontend apps: a shared dependency-injection container, service providers with a `register → boot → destroy` lifecycle, and thin `useService(...)` runtime adapters for React, Solid, Svelte, and Vue.

It doesn't replace your framework's state tools — it gives you one structured place to register services and application infrastructure, then resolve them from components and startup code instead of ad hoc singleton modules.

```sh
bun add @artisansdk/architect
```

```tsx
import "reflect-metadata";
import { Application, ServiceProvider, ContainerContract as Container } from "@artisansdk/architect";
import { ContextProvider, useService } from "@artisansdk/architect/react";
import ReactDOM from "react-dom/client";

class Counter {
  protected count = 0;
  increment() { return ++this.count; }
  current() { return this.count; }
}

class CounterProvider extends ServiceProvider {
  register(container: Container) {
    container.singleton(Counter, Counter);
  }
}

function App() {
  const counter = useService(Counter);
  return <button onClick={() => counter.increment()}>Count: {counter.current()}</button>;
}

const application = Application.configure({ config: { app: { name: "Demo" } } })
  .withProviders([new CounterProvider()]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ContextProvider application={application}><App /></ContextProvider>
);
```

## Documentation

Full guides and API reference: **[artisansdk.github.io/architect](https://artisansdk.github.io/architect/)**

- [Quick Start](https://artisansdk.github.io/architect/quick-start.html)
- [Core Concepts](https://artisansdk.github.io/architect/concepts/application.html) — Application lifecycle, Service Providers, Container
- [Built-in Services](https://artisansdk.github.io/architect/services/config.html) — Config, Cache, Store, Events, Logging, Scheduler
- [Framework Adapters](https://artisansdk.github.io/architect/adapters.html) — React, Vue, Solid, Svelte
- [Facades](https://artisansdk.github.io/architect/facades.html) · [Utilities](https://artisansdk.github.io/architect/utilities.html)

## Examples

Runnable framework examples live under `examples/` (`react`, `solid`, `svelte`, `vue`):

```sh
cd examples/react
bun install
bun run dev
```

## Development

```sh
bun test
bun run fix
```

## Licensing

Copyright (c) 2026 [Artisan Made, Co](https://www.artisanmade.io) and Joseph Raub

This package is released under the [MIT](LICENSE) license. Please see the LICENSE file distributed with every copy of the code for commercial licensing terms.
