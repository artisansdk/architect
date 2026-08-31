/**
 * A request as it was dispatched — passed to fake closures and stored in the recorder.
 */
export type RecordedRequest = {
    method: string
    url: string
    headers: Record<string, string>
    body: unknown
}
