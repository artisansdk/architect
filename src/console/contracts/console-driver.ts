import type Command from "./command"

/**
 * The seam that keeps the underlying CLI parser (currently `@bomb.sh/args`) an
 * implementation detail. Swap the driver and the public {@link
 * import("../command").default Command} API is unchanged.
 */
export default interface ConsoleDriver {
    /** Register a command so the driver can route argv to it. */
    register(command: Command): void
    /** Parse `argv` (without `node`/script head), route to a command, and resolve to its exit code. */
    run(argv: string[]): Promise<number>
}
