# ADAPTER.md — implementing AIP-31 in a host runtime

Implementer's guide for `kind: http` providers. Inherits all
[AIP-30 ADAPTER](../../../aip-30/draft/ADAPTER.md) responsibilities;
this doc covers HTTP-specific dispatch.

## Contract overview

A conforming host's HTTP runtime implements:

1. **Schema validation** — validate AIP-30 universal fields, then
   AIP-31 HTTP-specific fields, in sequence.
2. **Request construction** — apply `default_headers` + per-tool
   `headers`, build URL from `base_url` + `endpoint`, render
   `body_template` and `query_template`, OR call `buildRequest()`
   when the entry provides one.
3. **Authentication injection** — substitute `${secrets.X}` placeholders
   in headers and body with resolved secret values from the auth
   block. Never log substituted values.
4. **Dispatch** — issue the HTTP request, honour `signal`, observe
   `timeout_override_ms` (or contract ceiling).
5. **Response parsing** — extract via `response_extract` JSONPath-lite,
   OR call `parseResponse()` when the entry provides one.
6. **Error mapping** — translate HTTP statuses to provider error codes:
   200/2xx → ok; 401/403 → auth_required; 429 → rate_limited; 5xx →
   upstream_error (retryable); 4xx other → upstream_error (not retryable).

## Streaming

When `streaming.transport: "sse"` is declared:

```ts
async function* dispatchHttpStream(handle, toolId, args) {
  const { url, method, headers, body } = buildRequest(handle, toolId, args)
  const response = await fetch(url, { method, headers, body: JSON.stringify(body), signal: args.signal })
  if (!response.body) throw new Error("upstream_no_stream")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataMatch = event.match(/^data: (.+)$/m)
      if (!dataMatch) continue
      if (dataMatch[1] === handle.streaming.terminator) return
      yield JSON.parse(dataMatch[1])
    }
  }
}
```

`ndjson` and `chunked` transports follow the same pattern with
different framing rules.

## JSONPath-lite implementation

The `response_extract` field uses a restricted JSONPath subset to
keep parsing predictable and avoid arbitrary code execution:

| Token | Meaning |
|---|---|
| `$` | Root |
| `.foo` | Property `foo` |
| `[N]` | Array index N |
| `[*]` | All array elements (returns array) |
| `[?(@.k=='v')]` | Filter array by predicate (basic equality only) |

No JS expressions, no recursive descent (`..`), no slice
(`[start:end]`). Authors needing more lift the logic into
`parseResponse()`.

## Idempotency

When `metadata.http.idempotency_key_header` is declared (e.g.
`Idempotency-Key`), the host MUST:

1. Generate a UUIDv4 per call.
2. Set the header value to that UUID.
3. Persist the (request hash → UUID) mapping for the contract's
   `retry.max_attempts` window so retries reuse the same key.

This prevents double-charge / double-write on retries.

## Audit

HTTP-specific audit fields:

```json
{
  "type": "provider.invoked",
  "kind": "http",
  "url_template": "POST /v1/images/generations",
  "request_size_bytes": 1024,
  "response_status": 200,
  "response_size_bytes": 8192,
  "header_keys": ["Authorization", "Content-Type", "Idempotency-Key"]
}
```

`header_keys` lists names, never values. `url_template` is the static
endpoint, not the rendered URL with query params (which may carry
secrets).

## Reference implementation

`packages/http-runtime` exposes:

- `defineHttpProvider(...)` (sugar for `defineProvider({ kind: "http", ... })`)
- `dispatchHttp(handle, toolId, args)` — unary
- `dispatchHttpStream(handle, toolId, args)` — async iterator
- `expandTemplate(template, vars)` — body / query templating
- `extractResponse(body, jsonPath)` — JSONPath-lite

The runtime composes with `provider-runtime` (resolver) and
`tool-runtime` (contract validation).
