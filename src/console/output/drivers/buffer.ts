import type Contract from "../contract"

/**
 * A {@link Contract } implementation that records every line for assertions in tests.
 */
export class Buffered implements Contract {
    readonly stdout: string[] = []
    readonly stderr: string[] = []

    write(channel: "out" | "err", message: string): void {
        ;(channel === "err" ? this.stderr : this.stdout).push(message)
    }

    /** All stdout lines joined with newlines. */
    output(): string {
        return this.stdout.join("\n")
    }

    /** All stderr lines joined with newlines. */
    errors(): string {
        return this.stderr.join("\n")
    }
}
