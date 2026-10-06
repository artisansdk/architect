# Frameworks

Architect provides adapters for React, Vue, Solid, and Svelte. Each adapter integrates the Application container with the framework's component tree so any component can resolve services without prop-drilling.

## React

```bash
npm install @artisansdk/architect react
```

With JSX (`main.tsx`):

```tsx
import "reflect-metadata"
import React from "react"
import ReactDOM from "react-dom/client"
import { Application } from "@artisansdk/architect"
import { ContextProvider } from "@artisansdk/architect/react"
import App from "./App"

const app = Application.configure()
  .withProviders([new AppProvider()])

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContextProvider application={app}>
      <App />
    </ContextProvider>
  </React.StrictMode>
)
```

Without JSX (`main.ts`):

```typescript
import "reflect-metadata"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { Application } from "@artisansdk/architect"
import { ContextProvider } from "@artisansdk/architect/react"
import App from "./App"

const app = Application.configure()
  .withProviders([new AppProvider()])

const root = createRoot(document.getElementById("root")!)
root.render(
  createElement(ContextProvider, { application: app }, createElement(App))
)
```

### Resolving services in components

```tsx
import { useService } from "@artisansdk/architect/react"
import { UserService } from "./services/user"

function Profile() {
  const userService = useService(UserService)
  // ...
}
```

### Reactive services

Bindings registered with `container.reactive(...)` (see [Container](./concepts/container.md#reactive)) are automatically subscribed to — `useService` detects the `"reactive"` tag and wraps the result in Valtio's `useProxy`, so the component re-renders on mutation with no extra code:

```tsx
// provider
container.reactive(Menu, Menu)

// component — mutating menu re-renders this component, same call as any other service
const menu = useService(Menu)
```

Services registered with `bind`/`singleton` are returned as-is; use component state, signals, or another framework mechanism for those.

### Error boundaries

`ApplicationProvider`/`ContextProvider` wrap your tree in an `ErrorBoundary` — pass `errorFallback` to render something in place of a crashed subtree. See [Errors](./services/errors.md) for how caught errors get dispatched onto the **Events** bus.

### Using an existing container

If you already have a container (e.g. in tests or SSR), pass it directly:

```tsx
<ContextProvider container={myContainer}>
  <App />
</ContextProvider>
```

### Hooks

| Hook | Description |
|------|-------------|
| `useService(Token)` | Resolve a binding from the Service Container |
| `useContainer()` | Access the raw `ContainerContract` |
| `useSignal(signal)` | Read a [`Signal`](./utilities.md)'s current value and subscribe to changes |

## Vue

```bash
npm install @artisansdk/architect vue
```

`ContextProvider` renders its default slot, so it needs an explicit render function to receive children — mounting it directly as `createApp(ContextProvider, props)` leaves the slot empty and renders nothing:

```typescript
import "reflect-metadata"
import { createApp, h } from "vue"
import { Application } from "@artisansdk/architect"
import { ContextProvider } from "@artisansdk/architect/vue"
import App from "./App.vue"

const application = Application.configure()
  .withProviders([new AppProvider()])

createApp({
  render: () => h(ContextProvider, { application }, () => h(App)),
}).mount("#root")
```

### Resolving services in components

```typescript
import { useService } from "@artisansdk/architect/vue"
import { UserService } from "./services/user"

const userService = useService(UserService)
```

Or inject the container directly:

```typescript
import { inject } from "vue"
import { containerKey } from "@artisansdk/architect/vue"
import { UserService } from "./services/user"

const container = inject(containerKey)!
const userService = container.make(UserService)
```

## Solid

```bash
npm install @artisansdk/architect solid-js
```

```typescript
import "reflect-metadata"
import { render } from "solid-js/web"
import { Application } from "@artisansdk/architect"
import { ContextProvider } from "@artisansdk/architect/solid"

const application = Application.configure()
  .withProviders([new AppProvider()])

render(
  () => <ContextProvider application={application}><App /></ContextProvider>,
  document.getElementById("root")!
)
```

## Svelte

```bash
npm install @artisansdk/architect svelte
```

Svelte has no `ContextProvider` component. Call `application.run()` yourself, pass the resulting `container` into your root component as a prop, and call `provideContainer(...)` inside it before any `useService(...)` calls:

```typescript
// main.ts
import "reflect-metadata"
import { Application } from "@artisansdk/architect"
import App from "./App.svelte"

const application = Application.configure()
  .withProviders([new AppProvider()])

const running = application.run()

new App({
  target: document.getElementById("root")!,
  props: { container: running.container },
})

window.addEventListener("beforeunload", running.stop, { once: true })
```

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { provideContainer, useService } from "@artisansdk/architect/svelte"
  import { UserService } from "./services/user"

  export let container: unknown

  provideContainer(container as never)
  const userService = useService(UserService)
</script>
```
