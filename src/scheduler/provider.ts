import type { Container } from "../container/contract"
import ErrorHandler from "../errors/handler"
import ServiceProvider from "../support/service-provider"
import { Scheduler } from "./scheduler"

export class SchedulerProvider extends ServiceProvider {
    protected handle?: ReturnType<typeof setInterval>

    register(container: Container): void {
        container.singleton(Scheduler, (c) => new Scheduler(c.make(ErrorHandler)))
        container.alias("scheduler", Scheduler)
    }

    boot(container: Container): void {
        const scheduler = container.make<Scheduler>("scheduler")
        this.handle = setInterval(() => scheduler.run(), 1_000)
    }

    destroy(): void {
        clearInterval(this.handle)
    }
}
