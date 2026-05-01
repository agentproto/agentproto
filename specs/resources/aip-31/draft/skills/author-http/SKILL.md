---
schema: skills/v1
name: author-http
title: Author an HTTP driver (AIP-31)
description:
  Walk through authoring a kind:http DRIVER.md — wraps a third-party HTTP
  API (OpenAI / Stripe / Replicate / GitHub / Anthropic / etc.) as a
  conformant driver implementing one or more abstract TOOL contracts.
version: 1.0.0
tags: [aip-31, http, drivers, authoring]
inputs:
  - name: api_name
    type: string
    required: true
    description: Display name of the API (e.g. "OpenAI Images", "Stripe").
  - name: base_url
    type: string
    required: true
    description: API base URL (e.g. "https://api.openai.com").
  - name: tools
    type: string
    required: true
    description: Comma-separated TOOL.md refs to implement.
  - name: auth_pattern
    type: string
    required: false
    description: One of "bearer-header", "key-query", "oauth", "custom". Default "bearer-header".
examples:
  - input:
      api_name: "OpenAI Images"
      base_url: "https://api.openai.com"
      tools: "./tools/image-create/TOOL.md"
      auth_pattern: "bearer-header"
    output:
      - .drivers/openai-images-http/DRIVER.md
      - .drivers/openai-images-http/SECRETS.md
---

# Author an HTTP driver (AIP-31)

Use when wrapping a third-party HTTP API as a conformant driver for
an AIP-14 TOOL contract. The skill produces a frontmatter-only
DRIVER.md when `body_template` + `response_extract` cover the
dispatch shape, OR a DRIVER.md + driver.ts when conditional
request shaping is needed.

## Process

1. **Identity**: pick `id` ending in `-http`, set `name`,
   `description`, `version`, `kind: http`, `base_url`.
2. **Auth**: pick the auth pattern.
   - `bearer-header` → `default_headers.Authorization: "Bearer ${secrets.X}"`,
     `auth.state.env: [X]`, `expiry.detect: "http_status:401"`.
   - `key-query` → no `default_headers`, per-tool `query_template.key:
     "${secrets.X}"`.
   - `oauth` → declare `auth.login.url`, `auth.refresh`,
     `requires_callback_url: true`. Refresh logic in `driver.ts`.
   - `custom` → write the entry's `login` / `refresh` / `parseResponse`.
3. **Per-tool dispatch**: for each TOOL ref, author `metadata.http`:
   - `endpoint` (relative to base_url)
   - `method` (default POST)
   - `body_template` for JSON request body; OR `query_template` for
     GET-style; OR omit and pass `args.input` verbatim
   - `response_extract` (JSONPath-lite) when the contract output is
     nested in the response body
   - `cost_override.cost_units_per_call` in millicents
4. **Sandbox + region + policy**:
   - `network.egress: [<api-host>]`
   - `region` (US, EU, global)
   - `policy_tags` (third-party-llm, third-party-api, gdpr-compliant)
5. **Health check** (recommended): `health_check.method: http,
   http: { method: GET, url: "<status-or-models-endpoint>", expect_status: 200 }, every: "PT5M"`.
6. **Validate** against `HTTP.schema.json` AND `DRIVER.schema.json`.
7. **Wire**: `loadProvider(...)` in the host; the resolver picks per
   call.

## Common mistakes

- **Hardcoded secrets in `default_headers`** — always use
  `${secrets.X}` substitution; never literal values.
- **Wildcard `network.egress`** — be specific to the API's host(s).
- **Missing `idempotency_key_header`** when the tool mutates external
  state — risks double-charges on retry.
- **Body templating for conditional fields** — when fields depend on
  input presence, use `driver.ts buildRequest()` instead of
  `body_template`.
- **TLS skip** — never. Hosts MUST validate certificates.
