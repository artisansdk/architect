import type Argument from "./argument"
import type Option from "./option"
import type ParsedInput from "./parsed-input"

/**
 * Architect's driver-agnostic description of a runnable command. The
 * {@link import("../application").default ConsoleApplication} builds one of these
 * per registered command — the `handle` closure resolves the command from the
 * container, injects Input/Output and returns a conventional exit code. A
 * {@link import("./console-driver").default ConsoleDriver} only ever sees this
 * contract; it never touches {@link import("../command").default Command}.
 */
export default interface Command {
    name: string
    description: string
    arguments: Argument[]
    options: Option[]
    /** Hidden commands still run but are omitted from `architect list`. */
    hidden: boolean
    handle(input: ParsedInput): Promise<number>
}
