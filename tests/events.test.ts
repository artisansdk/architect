import { afterEach, describe, expect, test } from "bun:test"
import BuiltinContainer from "@/container/adapters/builtin"
import type { EventSubscriber } from "@/events/bus"
import { Bus } from "@/events/bus"
import { Dispatchable } from "@/events/concerns/dispatchable"
import { EventsProvider } from "@/events/provider"
import { setContainer } from "@/foundation/container"

function makeContainer(bus: Bus) {
    const container = new BuiltinContainer()
    container.bind("events").toConstantValue(bus)
    setContainer(container)
    return container
}

function reset() {
    const container = (globalThis as { __currentContainer?: BuiltinContainer }).__currentContainer
    container?.flush()
    setContainer(null)
}

describe("Bus.listen / dispatch", () => {
    afterEach(reset)

    test("dispatches to a registered string listener", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("user.created", (e) => {
            calls.push(e)
        })
        await bus.dispatch("user.created", { id: 1 })
        expect(calls).toEqual([{ id: 1 }])
    })

    test("dispatches to a class-constructor listener", async () => {
        class UserCreated {
            constructor(public id: number) {}
        }
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen(UserCreated, (e) => {
            calls.push(e)
        })
        await bus.dispatch(new UserCreated(1))
        expect(calls).toEqual([expect.objectContaining({ id: 1 })])
    })

    test("listener registered by class with label fires when dispatched by label", async () => {
        class UserCreated {
            static readonly label = "user.created"
            constructor(public id: number) {}
        }
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen(UserCreated, (e) => {
            calls.push(e)
        })
        await bus.dispatch(new UserCreated(42))
        expect(calls).toHaveLength(1)
    })

    test("dispatches to multiple listeners on the same event", async () => {
        const bus = new Bus()
        const calls: number[] = []
        bus.listen("ping", () => {
            calls.push(1)
        })
        bus.listen("ping", () => {
            calls.push(2)
        })
        await bus.dispatch("ping")
        expect(calls).toEqual([1, 2])
    })

    test("listen accepts an array of event identifiers", async () => {
        const bus = new Bus()
        const calls: string[] = []
        bus.listen(["a", "b"], (e) => {
            calls.push(e as string)
        })
        await bus.dispatch("a", "A")
        await bus.dispatch("b", "B")
        expect(calls).toEqual(["A", "B"])
    })

    test("listen accepts a ListenerObject", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("ping", {
            handle: (e) => {
                calls.push(e)
            },
        })
        await bus.dispatch("ping", 42)
        expect(calls).toEqual([42])
    })

    test("unsubscribe stops future calls", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        const off = bus.listen("ping", (e) => {
            calls.push(e)
        })
        await bus.dispatch("ping", 1)
        off()
        await bus.dispatch("ping", 2)
        expect(calls).toEqual([1])
    })
})

describe("Bus.once", () => {
    test("fires exactly once then unsubscribes", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.once("ping", (e) => {
            calls.push(e)
        })
        await bus.dispatch("ping", 1)
        await bus.dispatch("ping", 2)
        expect(calls).toEqual([1])
    })
})

describe("Bus wildcard listener", () => {
    test("receives data for all dispatched events", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("*", (data) => {
            calls.push(data)
        })
        await bus.dispatch("a", 1)
        await bus.dispatch("b", 2)
        expect(calls).toEqual([1, 2])
    })
})

describe("Bus.subscribe", () => {
    test("registers listeners from subscriber object mapping", async () => {
        const bus = new Bus()
        const calls: unknown[] = []

        const subscriber: EventSubscriber = {
            subscribe() {
                return {
                    "user.created": (e) => {
                        calls.push(e)
                    },
                }
            },
        }

        bus.subscribe(subscriber)
        await bus.dispatch("user.created", { id: 1 })
        expect(calls).toEqual([{ id: 1 }])
    })

    test("registers listeners from subscriber class", async () => {
        const bus = new Bus()
        const calls: unknown[] = []

        class UserSubscriber implements EventSubscriber {
            subscribe() {
                return {
                    "user.created": (e: unknown) => {
                        calls.push(e)
                    },
                }
            }
        }

        bus.subscribe(UserSubscriber)
        await bus.dispatch("user.created", "payload")
        expect(calls).toEqual(["payload"])
    })

    test("string handler name delegates to subscriber method", async () => {
        const bus = new Bus()
        const calls: unknown[] = []

        const subscriber = {
            subscribe() {
                return { "user.created": "onUserCreated" }
            },
            onUserCreated(e: unknown) {
                calls.push(e)
            },
        }

        bus.subscribe(subscriber as unknown as EventSubscriber)
        await bus.dispatch("user.created", "x")
        expect(calls).toEqual(["x"])
    })
})

describe("Bus.until", () => {
    test("returns first truthy listener result", async () => {
        const bus = new Bus()
        bus.listen("check", () => false)
        bus.listen("check", () => "found")
        bus.listen("check", () => "never")
        const result = await bus.until("check")
        expect(result).toBe("found")
    })

    test("returns null when no listener returns a value", async () => {
        const bus = new Bus()
        bus.listen("check", () => {})
        expect(await bus.until("check")).toBeNull()
    })
})

describe("Bus.push / flush", () => {
    test("flush dispatches queued events in order", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("notify", (e) => {
            calls.push(e)
        })
        bus.push("notify", { n: 1 })
        bus.push("notify", { n: 2 })
        await bus.flush("notify")
        expect(calls).toEqual([{ n: 1 }, { n: 2 }])
    })

    test("flush clears the queue", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("notify", (e) => {
            calls.push(e)
        })
        bus.push("notify", { n: 1 })
        await bus.flush("notify")
        await bus.flush("notify")
        expect(calls).toHaveLength(1)
    })

    test("forgetPushed clears all queued events", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("a", (e) => {
            calls.push(e)
        })
        bus.push("a", { x: 1 })
        bus.forgetPushed()
        await bus.flush("a")
        expect(calls).toHaveLength(0)
    })
})

describe("Bus.forget / hasListeners", () => {
    test("forget removes all listeners for an event", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("ping", (e) => {
            calls.push(e)
        })
        bus.forget("ping")
        await bus.dispatch("ping", 1)
        expect(calls).toHaveLength(0)
    })

    test("hasListeners returns true when listeners registered", () => {
        const bus = new Bus()
        expect(bus.hasListeners("ping")).toBe(false)
        bus.listen("ping", () => {})
        expect(bus.hasListeners("ping")).toBe(true)
    })

    test("hasListeners returns true when wildcard listener present", () => {
        const bus = new Bus()
        bus.listen("*", () => {})
        expect(bus.hasListeners("anything")).toBe(true)
    })
})

describe("Bus.fire alias", () => {
    test("fire is an alias for dispatch", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        bus.listen("ping", (e) => {
            calls.push(e)
        })
        await bus.fire("ping", "x")
        expect(calls).toEqual(["x"])
    })
})

describe("Dispatchable", () => {
    afterEach(reset)

    test("dispatch constructs and routes through Event facade", async () => {
        const bus = new Bus()
        makeContainer(bus)

        const calls: unknown[] = []
        bus.listen("order.placed", (e) => {
            calls.push(e)
        })

        class OrderPlaced extends Dispatchable {
            static readonly label = "order.placed"
            constructor(public orderId: number) {
                super()
            }
        }

        await OrderPlaced.dispatch(99)
        expect(calls).toHaveLength(1)
        expect((calls[0] as OrderPlaced).orderId).toBe(99)
    })
})

describe("Bus wildcard unsubscribe", () => {
    test("calling the returned unsubscribe removes the wildcard listener", async () => {
        const bus = new Bus()
        const calls: unknown[] = []
        const unsub = bus.listen("*", (data) => calls.push(data))
        await bus.dispatch("x", 1)
        unsub()
        await bus.dispatch("x", 2)
        expect(calls).toEqual([1])
    })
})

describe("EventsProvider", () => {
    test("register binds a Bus singleton to 'events'", () => {
        const container = new BuiltinContainer()
        new EventsProvider().register(container)
        const bus1 = container.make("events")
        const bus2 = container.make("events")
        expect(bus1).toBeInstanceOf(Bus)
        expect(bus1).toBe(bus2)
    })
})
