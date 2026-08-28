import { is as strIs } from "../support/str"
import PendingRequest from "./pending-request"
import type Response from "./response"
import type { RecordedRequest } from "./types"

/**
 * A registered fake: a string/JSON body, a native `Response`, or a closure returning one.
 */
type FakeValue =
    | string
    | number
    | unknown[]
    | Record<string, unknown>
    | globalThis.Response
    | ((request: RecordedRequest) => FakeValue | Promise<FakeValue>)

/**
 * The service bound as `"http"` and fronted by the `Http` facade. Creates pending requests,
 * holds registered fakes, and records what was sent.
 */
export default class HttpFactory {
    protected fakes: Array<{ pattern: string; value: FakeValue }> = []
    protected history: Array<[RecordedRequest, Response]> = []
    strayPrevented = false

    /**
     * A fresh, unconfigured request bound to this factory.
     */
    request(): PendingRequest {
        return new PendingRequest(this)
    }

    // Fluent starters — each opens a fresh PendingRequest, Laravel-style.

    /**
     * Open a request with the given headers merged in.
     */
    withHeaders(headers: Record<string, string>) {
        return this.request().withHeaders(headers)
    }

    /**
     * Open a request with a single header set.
     */
    withHeader(name: string, value: string) {
        return this.request().withHeader(name, value)
    }

    /**
     * Open a request authenticated with a token (`Bearer` by default).
     */
    withToken(token: string, type?: string) {
        return this.request().withToken(token, type)
    }

    /**
     * Open a request authenticated with HTTP Basic credentials.
     */
    withBasicAuth(username: string, password: string) {
        return this.request().withBasicAuth(username, password)
    }

    /**
     * Open a request with a base URL for relative paths.
     */
    baseUrl(url: string) {
        return this.request().baseUrl(url)
    }

    /**
     * Open a request with the `Accept` header set.
     */
    accept(contentType: string) {
        return this.request().accept(contentType)
    }

    /**
     * Open a request that accepts `application/json`.
     */
    acceptJson() {
        return this.request().acceptJson()
    }

    /**
     * Open a request that sends its body as JSON.
     */
    asJson() {
        return this.request().asJson()
    }

    /**
     * Open a request that sends its body as form-encoded data.
     */
    asForm() {
        return this.request().asForm()
    }

    /**
     * Open a request with default query-string parameters.
     */
    withQueryParameters(params: Record<string, unknown>) {
        return this.request().withQueryParameters(params)
    }

    /**
     * Open a request with extra `fetch()` options merged in.
     */
    withOptions(options: RequestInit) {
        return this.request().withOptions(options)
    }

    /**
     * Open a request that aborts after the given number of seconds.
     */
    timeout(seconds: number) {
        return this.request().timeout(seconds)
    }

    /**
     * Send a `GET` request.
     */
    get(url: string, query?: Record<string, unknown>) {
        return this.request().get(url, query)
    }

    /**
     * Send a `HEAD` request.
     */
    head(url: string, query?: Record<string, unknown>) {
        return this.request().head(url, query)
    }

    /**
     * Send a `POST` request.
     */
    post(url: string, data?: unknown) {
        return this.request().post(url, data)
    }

    /**
     * Send a `PUT` request.
     */
    put(url: string, data?: unknown) {
        return this.request().put(url, data)
    }

    /**
     * Send a `PATCH` request.
     */
    patch(url: string, data?: unknown) {
        return this.request().patch(url, data)
    }

    /**
     * Send a `DELETE` request.
     */
    delete(url: string, data?: unknown) {
        return this.request().delete(url, data)
    }

    /**
     * Build a fake response body. `Http.response({ id: 1 }, 201)` → 201 with a JSON body.
     */
    static response(body?: unknown, status = 200, headers: Record<string, string> = {}): globalThis.Response {
        const h = new Headers(headers)
        const isObject = body !== null && typeof body === "object"
        let payload: BodyInit | null
        if (isObject) {
            payload = JSON.stringify(body)
            if (!h.has("content-type")) h.set("content-type", "application/json")
        } else {
            payload = body === undefined ? null : String(body)
        }
        return new globalThis.Response(payload, { status, headers: h })
    }

    /**
     * Register fake responses. Pass a `{ "url-pattern": response }` map (patterns use `*`
     * wildcards), a closure, or a `Response` to fake every request. No argument fakes
     * everything with an empty 200.
     */
    fake(
        map?:
            | Record<string, FakeValue>
            | globalThis.Response
            | ((request: RecordedRequest) => FakeValue | Promise<FakeValue>),
    ): this {
        if (map === undefined) {
            this.fakes.push({ pattern: "*", value: HttpFactory.response() })
            return this
        }

        if (typeof map === "function" || map instanceof globalThis.Response) {
            this.fakes.push({ pattern: "*", value: map })
            return this
        }

        for (const [pattern, value] of Object.entries(map)) {
            this.fakes.push({ pattern, value })
        }
        return this
    }

    /**
     * Throw on any request that doesn't match a registered fake.
     */
    preventStrayRequests(): this {
        this.strayPrevented = true
        return this
    }

    /**
     * Drop all registered fakes and recorded history.
     */
    forget(): this {
        this.fakes = []
        this.history = []
        this.strayPrevented = false
        return this
    }

    /**
     * Recorded `[request, response]` pairs, optionally filtered.
     */
    recorded(filter?: (request: RecordedRequest, response: Response) => boolean): Array<[RecordedRequest, Response]> {
        return filter ? this.history.filter(([req, res]) => filter(req, res)) : [...this.history]
    }

    /**
     * Append a `[request, response]` pair to the history. Called by {@link PendingRequest}.
     */
    record(request: RecordedRequest, response: Response): void {
        this.history.push([request, response])
    }

    /**
     * Returns a matching fake response for `request`, or `undefined` to hit the network.
     */
    match(request: RecordedRequest): Promise<globalThis.Response> | undefined {
        for (const { pattern, value } of this.fakes) {
            const anchored = pattern.startsWith("*") ? pattern : `*${pattern}`
            if (strIs(anchored, request.url)) {
                return this.normalize(value, request)
            }
        }
        return undefined
    }

    /**
     * Coerce a registered {@link FakeValue} into a native `Response`, resolving closures.
     */
    protected async normalize(value: FakeValue, request: RecordedRequest): Promise<globalThis.Response> {
        if (typeof value === "function") return this.normalize(await value(request), request)
        if (value instanceof globalThis.Response) return value.clone()
        if (typeof value === "string" || typeof value === "number") return HttpFactory.response(String(value))
        return HttpFactory.response(value)
    }
}
