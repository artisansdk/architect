import type Contract from "../contract"

/**
 * Writes straight to `process.stdout`/`process.stderr`. The production sink.
 */
export default class StreamWriter implements Contract {
    write(channel: "out" | "err", message: string): void {
        const stream = channel === "err" ? process.stderr : process.stdout
        stream.write(`${message}\n`)
    }
}
