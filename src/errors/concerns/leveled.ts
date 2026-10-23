import type { Contract as Logger } from "../../log/contract"

/**
 * An error that picks the log level the handler's default report uses, instead of `error`.
 */
export interface Level {
    level(): keyof Logger
}
