import type LotteryClass from "../../lottery/lottery"
import { createFacade } from "./facade"

/**
 * Facade for the {@link LotteryClass} bound as `"lottery"` — `Lottery.odds(1, 10)`, `Lottery.pick(["a", "b"])`.
 */
export const Lottery = createFacade<typeof LotteryClass>("lottery")

export default Lottery
