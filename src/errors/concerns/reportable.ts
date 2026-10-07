/** An error that knows how to report itself, replacing the handler's default logging. */
export interface Reportable {
    report(): void
}
