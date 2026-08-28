import type { RecordedRequest } from "./types"

/**
 * Read a nested value from `target` by dot-path, returning `undefined` if any segment is missing.
 */
function dataGet(target: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as never)[key]), target)
}

/**
 * The result of an HTTP call. Wraps a native `Response` plus its already-read body text
 * so the accessors below stay synchronous, mirroring Laravel's `Illuminate\Http\Client\Response`.
 */
export default class Response {
    /**
     * Use {@link Response.create} — the body must be read asynchronously before construction.
     */
    protected constructor(
        protected raw: globalThis.Response,
        readonly request: RecordedRequest,
        protected text: string,
    ) {}

    /**
     * Read the raw `Response` body once and wrap it so all accessors below can stay synchronous.
     */
    static async create(raw: globalThis.Response, request: RecordedRequest): Promise<Response> {
        const text = await raw
            .clone()
            .text()
            .catch(() => "")
        return new Response(raw, request, text)
    }

    /**
     * The numeric HTTP status code.
     */
    status(): number {
        return this.raw.status
    }

    /**
     * Exactly 200. Use {@link successful} for any 2xx.
     */
    ok(): boolean {
        return this.raw.status === 200
    }

    /**
     * Any 2xx status.
     */
    successful(): boolean {
        return this.raw.status >= 200 && this.raw.status < 300
    }

    /**
     * Any 3xx status.
     */
    redirect(): boolean {
        return this.raw.status >= 300 && this.raw.status < 400
    }

    /**
     * Any 4xx or 5xx status.
     */
    failed(): boolean {
        return this.clientError() || this.serverError()
    }

    /**
     * Any 4xx status.
     */
    clientError(): boolean {
        return this.raw.status >= 400 && this.raw.status < 500
    }

    /**
     * Any 5xx status.
     */
    serverError(): boolean {
        return this.raw.status >= 500
    }

    /**
     * A single response header value, or `undefined` if absent.
     */
    header(name: string): string | undefined {
        return this.raw.headers.get(name) ?? undefined
    }

    /**
     * All response headers as a plain object.
     */
    headers(): Record<string, string> {
        return Object.fromEntries(this.raw.headers.entries())
    }

    /**
     * The raw response body as text.
     */
    body(): string {
        return this.text
    }

    /**
     * Parsed JSON body, or a nested value via dot-path (`json("data.id")`).
     */
    json<T = unknown>(key?: string): T {
        const data = this.text ? JSON.parse(this.text) : null
        return (key === undefined ? data : dataGet(data, key)) as T
    }

    /**
     * Throw if the response was a 4xx/5xx; otherwise return `this` for chaining.
     */
    throw(): this {
        if (this.failed()) {
            throw new Error(`HTTP request to [${this.request.url}] returned status ${this.status()}.`)
        }
        return this
    }
}
