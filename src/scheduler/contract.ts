import type { Task } from "./scheduler"

export interface Contract {
    do(handler: () => void): Task
    task(handler: () => void): Task
    task(name: string, handler: () => void): Task
    cancel(ref: Task | string): void
    run(): void
}
