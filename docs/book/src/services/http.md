# HTTP Client

The **Http** facade is a thin, `fetch`-backed HTTP client. It is
registered by `HttpProvider` (included in `defaultProviders`) and bound as `"http"`.

```typescript
import { Http } from "@artisansdk/architect/facades"

const res = await Http.acceptJson().get("https://api.example.com/users", { page: 2 })

res.status()      // 200
res.ok()          // true (exactly 200; use successful() for any 2xx)
res.json()        // parsed body
res.json("data.0.id")
res.header("content-type")
```

Every verb returns a `Promise<Response>`: `get`, `head`, `post`, `put`, `patch`, `delete`. This
`Response` is the architect's own wrapper class (exported as `Response`), not the native 
`fetch` [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response).

## Configuring a request

Fluent methods return the pending request, so they chain. Starting one from the facade
opens a fresh request:

```typescript
await Http
  .baseUrl("https://api.example.com")
  .withToken("secret")                    // Authorization: Bearer secret
  .withHeaders({ "X-Trace": "abc" })
  .withQueryParameters({ tenant: "acme" })
  .asJson()                               // default; use asForm() for form-encoded bodies
  .timeout(5)                             // seconds
  .post("/orders", { items: [1, 2] })
```

- `withToken(token, type?)` — bearer by default
- `withBasicAuth(user, pass)`
- `accept(type)` / `acceptJson()`
- `asJson()` / `asForm()` — how the request body is encoded
- `withOptions(init)` — merged into the underlying `fetch()` call
- `baseUrl(url)` — prepended to relative paths; absolute URLs pass through untouched

## The response

`Response` reads the body once up front so its accessors are synchronous:

| Method | Meaning |
|--------|---------|
| `status()` | numeric status |
| `ok()` | exactly `200` |
| `successful()` | `2xx` |
| `redirect()` | `3xx` |
| `clientError()` / `serverError()` / `failed()` | `4xx` / `5xx` / either |
| `body()` | raw text |
| `json(key?)` | parsed JSON, optional dot-path |
| `header(name)` / `headers()` | response headers |
| `throw()` | throw on `4xx`/`5xx`, else return `this` |

## Faking

`Http.fake()` registers canned responses so apps can be built and tested without a live
API. Keys are URL patterns with `*` wildcards; the protocol is matched loosely.

```typescript
Http.fake({
  "api.example.com/users/*": { id: 1, name: "Ada" },   // JSON body, 200
  "api.example.com/health": "ok",                        // text body, 200
  "*/admin/*": Http.response({ message: "denied" }, 403),
})

await Http.get("https://api.example.com/users/1")   // → { id: 1, name: "Ada" }
```

The first matching pattern wins. A fake value can be:

- an object or array → JSON body, `200`
- a string → text body, `200`
- `Http.response(body?, status?, headers?)` → explicit status and headers
- a native `Response`
- a function `(request) => value` (may be async) — branch on `request.method`, `request.url`, `request.headers`, `request.body`

```typescript
Http.fake((request) =>
  request.method === "POST"
    ? Http.response({ created: true }, 201)
    : Http.response({ items: [] }),
)
```

Calling `Http.fake()` with no argument stubs every request with an empty `200`. Passing a
single closure or `Response` (rather than a map) fakes every request with it.

### Stray requests and recording

```typescript
Http.fake({ "api.example.com/*": { ok: true } }).preventStrayRequests()
await Http.get("https://elsewhere.com/x")   // throws — no matching fake

Http.recorded()                              // [ [request, response], ... ]
Http.recorded((req) => req.method === "POST")

Http.forget()                                // drop all fakes + history
```

## Using the factory directly

```typescript
import { HttpFactory, type ContainerContract as Container } from "@artisansdk/architect"

boot(container: Container) {
  const http = container.make(HttpFactory)
  http.fake({ "*": { stubbed: true } })
}
```
