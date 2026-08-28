/// <reference path="./config/env.global.d.ts" />

export type { Contract as CacheStore } from "./cache/contract"
export { default as CacheManager } from "./cache/manager"
export { CacheProvider } from "./cache/provider"
export { createConfig } from "./config/discovery"
export { env } from "./config/env"
export { ConfigProvider } from "./config/provider"
export { default as ConfigRepository } from "./config/repository"
export { default as BuiltinContainer, inject } from "./container/adapters/builtin"
export type {
    Class as ContainerClass,
    Concrete as ContainerConcrete,
    Container as ContainerContract,
    Factory as ContainerFactory,
    Identifier as ContainerIdentifier,
} from "./container/contract"
export type { Source as ErrorSource } from "./errors/error"
export { default as ArchitectError } from "./errors/error"
export { ErrorsProvider } from "./errors/provider"
export type {
    EventIdentifier,
    EventSubscriber,
    Listener,
    ListenerObject,
    Unsubscribe,
    WildcardListener,
} from "./events/bus"
export { Bus } from "./events/bus"
export { Dispatchable } from "./events/concerns/dispatchable"
export { EventsProvider } from "./events/provider"
export type { ApplicationConfigureOptions } from "./foundation/application"
export { Application } from "./foundation/application"
export { default as HttpFactory } from "./http/factory"
export { default as PendingRequest } from "./http/pending-request"
export { HttpProvider } from "./http/provider"
export { default as Response } from "./http/response"
export type { RecordedRequest } from "./http/types"
export type { Contract as LogContract } from "./log/contract"
export { default as LogManager } from "./log/manager"
export { LogProvider } from "./log/provider"
export type { default as Contract, RendererContext, RootComponent } from "./renderers/contract"
export type { Contract as SchedulerContract } from "./scheduler/contract"
export { SchedulerProvider } from "./scheduler/provider"
export { Scheduler, Task } from "./scheduler/scheduler"
export type { Adapter as StoreAdapter } from "./store/adapters/contract"
export { default as IndexedDbAdapter } from "./store/adapters/indexed-db"
export { default as LocalStorageAdapter } from "./store/adapters/local-storage"
export { default as MemoryStoreAdapter } from "./store/adapters/memory"
export { default as StoreManager } from "./store/manager"
export { StoreProvider } from "./store/provider"
export { Arr } from "./support/arr"
export { Collection } from "./support/collection"
export { Fluent } from "./support/fluent"
export { registerGlobalHelpers } from "./support/globals"
export { LazyCollection } from "./support/lazy-collection"
export { default as Manager } from "./support/manager"
export { Num } from "./support/num"
export { send } from "./support/pipeline"
export type { Cleanup } from "./support/service-provider"
export { DeferrableServiceProvider, default as ServiceProvider } from "./support/service-provider"
export type { Unsubscribe as SignalUnsubscribe } from "./support/signal"
export { Signal } from "./support/signal"
export { Str } from "./support/str"

import { CacheProvider } from "./cache/provider"
import { ErrorsProvider } from "./errors/provider"
import { HttpProvider } from "./http/provider"
import { LogProvider } from "./log/provider"
import { StoreProvider } from "./store/provider"
import type ServiceProvider from "./support/service-provider"

export const defaultProviders: ServiceProvider[] = [
    new StoreProvider(),
    new CacheProvider(),
    new LogProvider(),
    new HttpProvider(),
    new ErrorsProvider(),
]
