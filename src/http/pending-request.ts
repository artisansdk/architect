import type HttpFactory from "./factory"
import Response from "./response"
import type { RecordedRequest } from "./types"

type BodyFormat = "json" | "form" | "body"

type SendOptions = { data?: unknown; query?: Record<string, unknown> }

/**
 * A configured-but-not-yet-sent request. Every fluent method returns `this`; the verb
 * methods (`get`, `post`, …) dispatch and resolve to a `Response`.
 */
export default class PendingRequest {
    protected headers: Record<string, string> = {}
    protected baseUrlValue = ""
    protected bodyFormat: BodyFormat = "json"
    protected queryParams: Record<string, unknown> = {}
    protected timeoutMs = 30_000
    protected fetchOptions: RequestInit = {}

    /**
     * @param factory the owning factory, used to resolve fakes and record what was sent.
     */
    constructor(protected factory?: HttpFactory) {}

    /**
     * Merge the given headers into the request.
     */
    withHeaders(headers: Record<string, string>): this {
        Object.assign(this.headers, headers)
        return this
    }

    /**
     * Set a single header.
     */
    withHeader(name: string, value: string): this {
        this.headers[name] = value
        return this
    }

    /**
     * Set the `Authorization` header to a token, `Bearer` by default.
     */
    withToken(token: string, type = "Bearer"): this {
        this.headers.Authorization = `${type} ${token}`
        return this
    }

    /**
     * Set the `Authorization` header to HTTP Basic credentials.
     */
    withBasicAuth(username: string, password: string): this {
        this.headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`
        return this
    }

    /**
     * Prefix for relative request paths; absolute URLs passed to a verb method ignore it.
     */
    baseUrl(url: string): this {
        this.baseUrlValue = url.replace(/\/+$/, "")
        return this
    }

    /**
     * Set the `Accept` header.
     */
    accept(contentType: string): this {
        this.headers.Accept = contentType
        return this
    }

    /**
     * Set the `Accept` header to `application/json`.
     */
    acceptJson(): this {
        return this.accept("application/json")
    }

    /**
     * Send the body as JSON (the default).
     */
    asJson(): this {
        this.bodyFormat = "json"
        return this
    }

    /**
     * Send the body as `application/x-www-form-urlencoded`.
     */
    asForm(): this {
        this.bodyFormat = "form"
        return this
    }

    /**
     * Merge query-string parameters applied to every request from this instance.
     */
    withQueryParameters(params: Record<string, unknown>): this {
        Object.assign(this.queryParams, params)
        return this
    }

    /**
     * Merge extra options into the underlying `fetch()` call.
     */
    withOptions(options: RequestInit): this {
        Object.assign(this.fetchOptions, options)
        return this
    }

    /**
     * Abort the request after the given number of seconds.
     */
    timeout(seconds: number): this {
        this.timeoutMs = seconds * 1_000
        return this
    }

    /**
     * Send a `GET` request, with optional query parameters.
     */
    get(url: string, query?: Record<string, unknown>): Promise<Response> {
        return this.send("GET", url, { query })
    }

    /**
     * Send a `HEAD` request, with optional query parameters.
     */
    head(url: string, query?: Record<string, unknown>): Promise<Response> {
        return this.send("HEAD", url, { query })
    }

    /**
     * Send a `POST` request with an optional body.
     */
    post(url: string, data?: unknown): Promise<Response> {
        return this.send("POST", url, { data })
    }

    /**
     * Send a `PUT` request with an optional body.
     */
    put(url: string, data?: unknown): Promise<Response> {
        return this.send("PUT", url, { data })
    }

    /**
     * Send a `PATCH` request with an optional body.
     */
    patch(url: string, data?: unknown): Promise<Response> {
        return this.send("PATCH", url, { data })
    }

    /**
     * Send a `DELETE` request with an optional body.
     */
    delete(url: string, data?: unknown): Promise<Response> {
        return this.send("DELETE", url, { data })
    }

    /**
     * Build and dispatch the request, encoding the body per {@link asJson}/{@link asForm},
     * then wrap the result and record it on the factory.
     */
    async send(method: string, url: string, { data, query }: SendOptions = {}): Promise<Response> {
        const target = this.buildUrl(url, query)
        const headers = { ...this.headers }
        let body: BodyInit | undefined

        if (data !== undefined && method !== "GET" && method !== "HEAD") {
            if (this.bodyFormat === "form") {
                body = new URLSearchParams(data as Record<string, string>).toString()
                headers["Content-Type"] ??= "application/x-www-form-urlencoded"
            } else if (this.bodyFormat === "json") {
                body = JSON.stringify(data)
                headers["Content-Type"] ??= "application/json"
            } else {
                body = data as BodyInit
            }
        }

        const request: RecordedRequest = { method, url: target, headers, body: data }
        const raw = await this.dispatch(request, { method, headers, body })
        const response = await Response.create(raw, request)
        this.factory?.record(request, response)
        return response
    }

    /**
     * Return a matching fake response, throw if stray requests are blocked, otherwise
     * hit the network via `fetch()` with a timeout-driven `AbortController`.
     */
    protected dispatch(request: RecordedRequest, init: RequestInit): Promise<globalThis.Response> {
        const faked = this.factory?.match(request)
        if (faked) return faked
        if (this.factory?.strayPrevented) {
            throw new Error(`Attempted request to [${request.url}] without a matching fake.`)
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)
        return fetch(request.url, { ...this.fetchOptions, ...init, signal: controller.signal }).finally(() =>
            clearTimeout(timer),
        )
    }

    /**
     * Resolve the path against `baseUrl` (unless absolute) and append merged query parameters.
     */
    protected buildUrl(url: string, query?: Record<string, unknown>): string {
        const absolute = /^https?:\/\//i.test(url)
        const full = absolute ? url : `${this.baseUrlValue}/${url.replace(/^\/+/, "")}`
        const merged = { ...this.queryParams, ...(query ?? {}) }
        const qs = new URLSearchParams(merged as Record<string, string>).toString()
        if (!qs) return full
        return `${full}${full.includes("?") ? "&" : "?"}${qs}`
    }
}
