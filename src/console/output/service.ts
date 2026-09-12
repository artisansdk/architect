import type Contract from "./contract"
import Stream from "./drivers/stream"

const STYLES = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
} as const

/**
 * The write side of a command. Commands call the semantic helpers (`info`,
 * `error`, …); the raw sink is swappable so tests capture output instead of
 * spawning a process. Colour is applied only when the sink is a real stream
 * attached to a TTY — never when writing to a buffer, so assertions stay stable
 * regardless of how the test runner is launched.
 */
export default class Service {
    protected decorated: boolean

    constructor(protected readonly writer: Contract = new Stream()) {
        this.decorated = writer instanceof Stream && Boolean(process.stdout?.isTTY)
    }

    /** Force colour on or off, e.g. `--no-ansi` or a test asserting raw text. */
    setDecorated(decorated: boolean): this {
        this.decorated = decorated
        return this
    }

    /** An unstyled line to stdout. */
    line(message = ""): void {
        this.writer.write("out", message)
    }

    /** A green informational line to stdout. */
    info(message: string): void {
        this.writer.write("out", this.style(message, "green"))
    }

    /** A yellow section heading to stdout (e.g. the `list` command's titles). */
    heading(message: string): void {
        this.writer.write("out", this.style(message, "yellow"))
    }

    /** A yellow cautionary line to stderr. */
    warn(message: string): void {
        this.writer.write("err", this.style(message, "yellow"))
    }

    /** A red error line to stderr. */
    error(message: string): void {
        this.writer.write("err", this.style(message, "red"))
    }

    /** A dimmed contextual line to stdout. */
    comment(message: string): void {
        this.writer.write("out", this.style(message, "blue"))
    }

    protected style(message: string, color: keyof typeof STYLES): string {
        if (!this.decorated) {
            return message
        }

        return `${STYLES[color]}${message}${STYLES.reset}`
    }
}
