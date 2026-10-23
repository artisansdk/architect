# Events

The **Bus** is a pub/sub event bus with support for string events, class-based events, wildcard listeners, and deferred dispatch via queuing.

Register it by including `EventsProvider` in your providers:

```typescript
import { Application, EventsProvider } from "@artisansdk/architect"

Application.configure()
  .withProviders([new EventsProvider()])
  .run()
```

Every app has `"events"` bound: the core [`ErrorsProvider`](./errors.md) registers it, guarded so it won't replace an existing binding. `EventsProvider` is only necessary when you want to bind the bus yourself.

## Listening

```typescript
import { Event } from "@artisansdk/architect/support/facades"

const off = Event.listen("user.created", (payload) => {
  console.log(payload)
})

// Stop listening
off()
```

## Dispatching

```typescript
await Event.dispatch("user.created", { id: 42, name: "Alice" })

// Alias
await Event.fire("user.created", { id: 42 })
```

## Listen once

```typescript
Event.once("app.ready", () => {
  console.log("App is ready")
})
```

## Wildcard listeners

```typescript
Event.listen("*", (eventName, data) => {
  console.log(eventName, data)
})
```

## Class-based events

Define event classes for type safety:

```typescript
class UserCreated {
  constructor(public readonly id: number, public readonly name: string) {}
}

Event.listen(UserCreated, (event) => {
  console.log(event.id, event.name)
})

await Event.dispatch(new UserCreated(42, "Alice"))
```

Add a static `label` to control the event name (minification-safe):

```typescript
class UserCreated {
  static readonly label = "user.created"
  constructor(public readonly id: number) {}
}
```

## Dispatchable mixin

Make a class dispatch itself:

```typescript
import { Dispatchable } from "@artisansdk/architect"

class UserCreated extends Dispatchable {
  constructor(public readonly id: number) {}
}

// Constructs the instance for you — pass constructor args, not an instance
await UserCreated.dispatch(42)
```

## Subscribers

Group related listeners into a subscriber class:

```typescript
import { type EventSubscriber, type Bus } from "@artisansdk/architect"

class UserSubscriber implements EventSubscriber {
  subscribe(bus: Bus) {
    return {
      "user.created": this.onUserCreated,
      "user.deleted": this.onUserDeleted,
    }
  }

  onUserCreated(event: unknown) { /* ... */ }
  onUserDeleted(event: unknown) { /* ... */ }
}

Event.subscribe(new UserSubscriber())
// or pass the class — subscriber will be instantiated automatically
Event.subscribe(UserSubscriber)
```

## Listening for the first truthy response

```typescript
const result = await Event.until("form.validate", formData)
// Returns the first non-null, non-false listener return value
```

## Queued events

Push an event to a queue without dispatching immediately. Flush later to dispatch all queued payloads in order:

```typescript
Event.push("analytics.track", { event: "page_view", url: "/home" })
Event.push("analytics.track", { event: "page_view", url: "/about" })

// Later, when the analytics service is ready:
await Event.flush("analytics.track")
```

## Using Bus directly

```typescript
import { Bus, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  // "events" is the only registered identifier — Bus is never bound by class,
  // so container.make(Bus) would silently construct a fresh, disconnected instance.
  const bus = container.make<Bus>("events")
  bus.listen("order.placed", this.handleOrder)
}
```
