import type { Scheduler as SchedulerInstance } from "../../scheduler/scheduler"
import { createFacade } from "./facade"

/**
 * Facade for the {@link SchedulerInstance} bound as `"scheduler"` — `Scheduler.task(...)`, `Scheduler.run()`, etc.
 */
export const Scheduler = createFacade<SchedulerInstance>("scheduler")

export default Scheduler
