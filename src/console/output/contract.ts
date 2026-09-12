/**
 * A destination for a line of console output. `stdout`/`stderr` in production, a buffer in tests.
 */
export default interface Contract {
    write(channel: "out" | "err", message: string): void
}
