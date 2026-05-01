# EXAMPLES.md — HTTP driver patterns

Reference `DRIVER.md` files exemplifying common HTTP-API patterns. Each
example is a self-contained `kind: http` driver implementing one or more
abstract TOOL contracts.

## Patterns covered

1. [API key in header (OpenAI)](#1-api-key-in-header-openai)
2. [API key in query string (Google Maps)](#2-api-key-in-query-string-google-maps)
3. [OAuth bearer with refresh (GitHub)](#3-oauth-bearer-with-refresh-github)
4. [Multi-tool sharing one auth (Replicate)](#4-multi-tool-sharing-one-auth-replicate)
5. [Streaming via SSE (Anthropic chat)](#5-streaming-via-sse-anthropic-chat)
6. [Custom buildRequest entry (conditional fields)](#6-custom-buildrequest-entry-conditional-fields)

---

## 1. API key in header (OpenAI)

The most common HTTP pattern: bearer-token auth, JSON request, JSON
response. Frontmatter-only — no driver.ts entry needed.

```md
---
name: OpenAI Images (HTTP)
id: openai-images-http
description: Image generation via OpenAI's HTTP API (DALL-E 3 standard).
version: 1.0.0
kind: http
base_url: "https://api.openai.com"
default_headers:
  Authorization: "Bearer ${secrets.OPENAI_API_KEY}"
  Content-Type: "application/json"

auth:
  ref: ./SECRETS.md
  state: { env: ["OPENAI_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.openai.com"]
region: ["global"]
policy_tags: ["third-party-llm", "us-data-residency"]

implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    schema_narrowing:
      drop_inputs: [seed, negative_prompt]
    cost_override: { cost_units_per_call: 4 }
    metadata:
      http:
        endpoint: "/v1/images/generations"
        method: POST
        body_template:
          model: "dall-e-3"
          prompt: "${input.prompt}"
          size: "${input.aspect | default('1024x1024')}"
        response_extract: "$.data[0].url"
---
```

---

## 2. API key in query string (Google Maps)

Some APIs accept the key as a query param rather than a header.

```md
---
name: Google Maps Geocoding (HTTP)
id: google-maps-geocoding-http
description: Geocode addresses to lat/lng via Google Maps API.
version: 1.0.0
kind: http
base_url: "https://maps.googleapis.com"

auth:
  ref: ./SECRETS.md
  state: { env: ["GOOGLE_MAPS_API_KEY"] }
  expiry: { detect: "http_status:403" }
network:
  egress: ["maps.googleapis.com"]
region: ["global"]
policy_tags: ["third-party-api"]

implements:
  - tool: ./tools/maps-geocode/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.5 }
    metadata:
      http:
        endpoint: "/maps/api/geocode/json"
        method: GET
        query_template:
          address: "${input.address}"
          key: "${secrets.GOOGLE_MAPS_API_KEY}"
        response_extract: "$.results[0].geometry.location"
---
```

---

## 3. OAuth bearer with refresh (GitHub)

OAuth flows need a custom login URL and refresh logic. Frontmatter
declares the surface; refresh is implemented in driver.ts.

```md
---
name: GitHub API (HTTP)
id: github-api-http
description: GitHub REST v3 API. OAuth-bearer auth with refresh.
version: 1.0.0
kind: http
base_url: "https://api.github.com"
default_headers:
  Authorization: "Bearer ${secrets.GITHUB_OAUTH_ACCESS_TOKEN}"
  Accept: "application/vnd.github+json"
  X-GitHub-Api-Version: "2022-11-28"

auth:
  ref: ./SECRETS.md
  state:
    env: ["GITHUB_OAUTH_ACCESS_TOKEN", "GITHUB_OAUTH_REFRESH_TOKEN"]
  login:
    url: "https://github.com/login/oauth/authorize?client_id=…&scope=repo,read:org"
    interactive: true
    requires_callback_url: true
    completes_when:
      http: { method: GET, url: "https://api.github.com/user", expect_status: 200 }
  refresh:
    cmd: ""                          # custom flow; see driver.ts
    every: "PT1H"
  expiry:
    detect: "http_status:401"

network:
  egress: ["api.github.com"]
region: ["global"]
policy_tags: ["third-party-api"]

implements:
  - tool: ./tools/gh-pr-list/TOOL.md
    version: "^1.0.0"
    metadata:
      http:
        endpoint: "/repos/${input.owner}/${input.repo}/pulls"
        method: GET
        query_template:
          state: "${input.state | default('open')}"
        response_extract: "$"
---
```

`driver.ts` exports a custom `refresh()` per AIP-30.

---

## 4. Multi-tool sharing one auth (Replicate)

One DRIVER, three TOOLs sharing auth, sandbox, egress.

```md
---
name: Replicate (HTTP)
id: replicate-http
description: Replicate model hosting. One API key serves create / edit / upscale.
version: 1.0.0
kind: http
base_url: "https://api.replicate.com"
default_headers:
  Authorization: "Token ${secrets.REPLICATE_API_TOKEN}"
  Content-Type: "application/json"

auth:
  ref: ./SECRETS.md
  state: { env: ["REPLICATE_API_TOKEN"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.replicate.com", "replicate.delivery"]
region: ["global"]
policy_tags: ["third-party-llm"]

implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 2.5 }
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "black-forest-labs/flux-1.1-pro"
          input: { prompt: "${input.prompt}", aspect_ratio: "${input.aspect}" }
  - tool: ./tools/image-edit/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 3 }
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "black-forest-labs/flux-1.1-pro-edit"
  - tool: ./tools/image-upscale/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 1 }
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "nightmareai/real-esrgan"
---
```

---

## 5. Streaming via SSE (Anthropic chat)

Streaming responses declare the transport. v1 supports response-only
streaming.

```md
---
name: Anthropic Chat (HTTP, streaming)
id: anthropic-chat-http
description: Anthropic chat completions with SSE streaming.
version: 1.0.0
kind: http
base_url: "https://api.anthropic.com"
default_headers:
  x-api-key: "${secrets.ANTHROPIC_API_KEY}"
  anthropic-version: "2023-06-01"
  Content-Type: "application/json"

streaming:
  transport: sse
  event_field: data
  terminator: "[DONE]"

auth:
  ref: ./SECRETS.md
  state: { env: ["ANTHROPIC_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.anthropic.com"]
policy_tags: ["third-party-llm"]

implements:
  - tool: ./tools/chat-completion/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 1.5 }
    metadata:
      http:
        endpoint: "/v1/messages"
        method: POST
        body_template:
          model: "claude-3-5-sonnet-20241022"
          stream: true
          max_tokens: 4096
          messages: "${input.messages}"
        streaming:
          transport: sse
          event_field: data
---
```

The HTTP runtime parses SSE events, yielding each `data:` payload until
the `[DONE]` terminator.

---

## 6. Custom buildRequest entry (conditional fields)

When `body_template` can't express the request shape (conditional
fields, computed values), declare driver.ts.

`DRIVER.md`:

```md
---
name: OpenAI Chat (HTTP, with conditional logic)
id: openai-chat-http
description: OpenAI chat completions; tools/functions field included only when caller provides them.
version: 1.0.0
kind: http
base_url: "https://api.openai.com"
default_headers:
  Authorization: "Bearer ${secrets.OPENAI_API_KEY}"
  Content-Type: "application/json"

auth:
  ref: ./SECRETS.md
  state: { env: ["OPENAI_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.openai.com"]

implements:
  - tool: ./tools/chat-completion/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 1 }
    metadata:
      http:
        endpoint: "/v1/chat/completions"
        method: POST
        # body_template omitted — driver.ts handles via buildRequest
---
```

`driver.ts`:

```ts
import { defineDriver } from "@agentproto/driver-runtime"

export default defineDriver({
  id: "openai-chat-http",
  kind: "http",
  baseUrl: "https://api.openai.com",
  defaultHeaders: { /* set by frontmatter */ },
  buildRequest: ({ toolId, input }) => {
    if (toolId !== "chat-completion") {
      throw new Error(`No buildRequest for ${toolId}`)
    }
    return {
      url: "/v1/chat/completions",
      method: "POST",
      headers: {},
      body: {
        model: input.model ?? "gpt-4o",
        messages: input.messages,
        max_tokens: input.maxTokens ?? 4096,
        ...(input.tools && { tools: input.tools }),
        ...(input.responseFormat && { response_format: input.responseFormat }),
        ...(input.seed != null && { seed: input.seed }),
      },
    }
  },
  parseResponse: ({ status, body }) => {
    if (status === 200) return { ok: true, value: body.choices[0].message }
    if (status === 401) return { ok: false, error: { code: "auth_required", message: "" } }
    return { ok: false, error: { code: "upstream_error", message: body?.error?.message ?? "unknown" } }
  },
  // ... execute is auto-generated by the HTTP runtime ...
})
```
