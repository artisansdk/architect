# Quick Start

This example wires up two services and mounts a React app. The same pattern applies to any framework.

```typescript doctest
import "reflect-metadata"
import { Application, ServiceProvider } from "@artisansdk/architect"
import { ContextProvider } from "@artisansdk/architect/react"
import { createRoot } from "react-dom/client"
import { createElement } from "react"
import App from "./App"

class ApiServiceProvider extends ServiceProvider {
  register(container) {
    container.singleton(ApiClient, ApiClient)
  }

  boot(container) {
    container.make(ApiClient).connect()
  }

  destroy(container) {
    container.make(ApiClient).disconnect()
  }
}

const application = Application
  .use({ api: { url: "https://api.example.com" } })
  .use(ApiServiceProvider)
```

```typescript
const root = createRoot(document.getElementById("root")!)
root.render(createElement(ContextProvider, { application }, createElement(App)))
```

The **Lifecycle** runs in this order every time:

1. `register()` on every **ServiceProvider** — bindings only, no resolving
2. `boot()` on every **ServiceProvider** — safe to resolve any binding
3. Framework renders the root component
4. On `beforeunload`, `destroy()` runs on every **ServiceProvider**, in reverse provider order

That's all there is to it. The rest of this guide covers each piece in depth.
