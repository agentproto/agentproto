# EXAMPLES.md — TOOL.md reference patterns

Reference `TOOL.md` files exemplifying common patterns. Each example is a
self-contained **abstract contract**. Implementations live on sibling
[AIP-30 DRIVER.md](/docs/aip-30) files; one TOOL.md may have 0, 1, or
many implementing drivers. Authors should copy the closest pattern and
edit fields rather than draft from scratch.

## Patterns covered

1. [Pure read-only](#1-pure-read-only)
2. [Mutating with on-mutate approval](#2-mutating-with-on-mutate-approval)
3. [Always-approval (irreversible)](#3-always-approval-irreversible)
4. [Long-running with retry baseline](#4-long-running-with-retry-baseline)
5. [Capability-gated (governance via `requires`)](#5-capability-gated-governance-via-requires)
6. [Driver-constrained (PII-safe self-hosted only)](#6-driver-constrained-pii-safe-self-hosted-only)
7. [Multi-driver routable (default + fallback)](#7-multi-driver-routable-default--fallback)
8. [Context-injected state (`contextSchema`)](#8-context-injected-state-contextschema)

---

## 1. Pure read-only

Read-only tools have `mutates: []`, `risk_level: 0`, `approval: auto`.
The cleanest contract pattern.

```md
---
name: Pricing Snapshot
id: pricing-snapshot
description:
  Fetch a SaaS product's public pricing tiers from its marketing page. Use when
  the user asks "how much does X cost" and gives a URL. Do NOT use for products
  that gate pricing behind sales — return error.code "private_pricing".
version: 1.0.0
mutates: []
requires:
  network: ["*"]
approval: auto
risk_level: 0
cost_class: metered
timeout_ms: 20000
retry:
  max_attempts: 2
  backoff: exponential
  initial_ms: 500
inputs:
  type: object
  properties:
    productUrl:
      type: string
      format: uri
      description: Public marketing/pricing page URL.
  required: [productUrl]
outputs:
  type: object
  properties:
    tiers:
      type: array
      items:
        type: object
        properties:
          name:       { type: string }
          priceUsdMo: { type: number, minimum: 0 }
          features:   { type: array, items: { type: string } }
        required: [name, priceUsdMo]
    capturedAt:
      type: string
      format: date-time
  required: [tiers, capturedAt]
tags: [scraping, finance, read-only]
examples:
  - name: Stripe billing page
    input:  { productUrl: "https://stripe.com/pricing" }
    output:
      tiers:
        - { name: "Standard", priceUsdMo: 0, features: [pay-as-you-go] }
      capturedAt: "2026-04-28T20:00:00Z"
---

## Description

Use when the user asks for the current price of a SaaS product and already
provides the public pricing URL. Returns normalized tier data.

## Errors

| Code              | Meaning                  | Caller action                                |
| ----------------- | ------------------------ | -------------------------------------------- |
| `not_found`       | URL returned 404         | Surface to user; suggest a different URL.    |
| `private_pricing` | No public tiers detected | Surface to user; recommend contacting sales. |
| `rate_limited`    | Upstream rate-limited us | Resolver's retry handles.                    |
```

A sibling DRIVER.md serving this contract:

```md
---
name: Apollo pricing extraction (HTTP)
id: apollo-pricing-http
description: Apollo HTTP API for public-page price extraction.
version: 1.0.0
kind: http
auth:
  ref: ./SECRETS.md
  state: { env: ["APOLLO_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.apollo.io"]
implements:
  - tool: ./tools/pricing-snapshot/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 5 }
    metadata:
      http:
        endpoint: "/v1/pricing/extract"
        method: POST
        body_template: { url: "${input.productUrl}" }
---
```

---

## 2. Mutating with on-mutate approval

The tool writes to one well-scoped resource (a workspace file). Use
`approval: on-mutate` so the host prompts on every call where `mutates` is
non-empty. (`approval: auto` is forbidden by schema when `mutates` is
non-empty — the constraint is enforced at validation time.)

```md
---
name: Append to Notes
id: notes.append
description:
  Append a markdown line to /notes/<filename> in the workspace. The file is
  created if missing. Use when the user says "remember that X" or "log Y to my
  notes". Do NOT use for code or structured data — those have their own tools.
version: 1.0.0
mutates: ["workspace:/notes/*"]
requires:
  network: []
approval: on-mutate
risk_level: 1
cost_class: trivial
timeout_ms: 5000
inputs:
  type: object
  properties:
    filename:
      type: string
      pattern: "^[\\w\\-]+\\.md$"
      description: Markdown filename in /notes/. e.g. "ideas.md".
    line:
      type: string
      maxLength: 1000
      description: One-line entry to append.
    timestamp:
      type: boolean
      default: true
      description: Prefix with ISO-8601 timestamp.
  required: [filename, line]
outputs:
  type: object
  properties:
    path:    { type: string }
    bytes:   { type: integer }
  required: [path, bytes]
tags: [productivity, notes, write]
examples:
  - name: Append idea
    input:  { filename: "ideas.md", line: "explore agentic billing patterns" }
    output: { path: "/notes/ideas.md", bytes: 2048 }
---

## Description

The simplest write surface in the workspace. Always check whether the user's
intent matches *append* vs *replace* — this tool only appends.
```

---

## 3. Always-approval (irreversible)

Some tools demand explicit user consent every call regardless of
`mutates` heuristics. Use `approval: always` and `risk_level: 3` for
irreversible operations (delete, broadcast, charge).

```md
---
name: Delete Workspace
id: workspace.delete
description:
  Permanently delete the entire workspace and all files. IRREVERSIBLE. Use
  ONLY when the user has explicitly typed "delete <workspace_id>" matching
  the active workspace, AND has confirmed in the same conversation turn.
version: 1.0.0
mutates: ["workspace:/", "database:workspaces"]
requires:
  network: []
approval: always
risk_level: 3
cost_class: trivial
timeout_ms: 60000
inputs:
  type: object
  properties:
    workspace_id:
      type: string
      pattern: "^ws_[a-z0-9]{16}$"
    confirm_phrase:
      type: string
      description: Must equal "delete <workspace_id>" verbatim.
  required: [workspace_id, confirm_phrase]
outputs:
  type: object
  properties:
    deleted_at:    { type: string, format: date-time }
    files_removed: { type: integer }
  required: [deleted_at, files_removed]
tags: [destructive, workspace, admin]
---

## Errors

| Code | Meaning | Caller action |
|---|---|---|
| `confirmation_mismatch` | confirm_phrase doesn't match `delete <workspace_id>` | Re-prompt user verbatim |
| `not_found` | workspace_id doesn't exist | Surface; user typo'd |
| `forbidden` | User lacks delete capability | Refuse; show capability list |
```

---

## 4. Long-running with retry baseline

Tools whose drivers may transiently fail (network blips, rate limits)
declare a retry policy at the contract level. Drivers MAY narrow via
their own `retry_override`.

```md
---
name: Generate Image
id: image.create
description:
  Generate an image from a text prompt. Returns a URL or base64 payload.
version: 1.0.0
mutates: ["network:*"]
requires:
  network: ["*"]
approval: on-mutate                # network egress, but to a known service
risk_level: 1
cost_class: metered
timeout_ms: 60000
retry:
  max_attempts: 3
  backoff: exponential
  initial_ms: 1000
inputs:
  type: object
  properties:
    prompt:    { type: string, minLength: 3, maxLength: 1000 }
    aspect:    { enum: ["1:1", "16:9", "4:3", "9:16"], default: "1:1" }
    style:     { enum: [photorealistic, watercolor, illustration], default: photorealistic }
    seed:      { type: integer, minimum: 0 }
    negative_prompt: { type: string, maxLength: 500 }
  required: [prompt]
outputs:
  type: object
  properties:
    url:       { type: string, format: uri }
    width:     { type: integer }
    height:    { type: integer }
  required: [url, width, height]
tags: [media, generative-ai]
examples:
  - name: Sunset
    input:  { prompt: "A sunset over snowy mountains, cinematic" }
    output: { url: "https://...", width: 1024, height: 1024 }
---
```

This contract has multiple drivers (OpenAI DALL-E, Replicate Flux, local
SDXL); the resolver picks per call. Some drivers will declare
`schema_narrowing.drop_inputs: [seed, negative_prompt]` because they don't
support those — the resolver refuses calls using those inputs against the
narrowing driver.

---

## 5. Capability-gated (governance via `requires`)

For tools that gate on operator capabilities, use `requires` to declare
what the caller must hold. Approval policies enforce.

```md
---
name: Sign Artifact
id: governance.artifact.sign
description:
  Sign an artifact (file path or content hash) with the workspace's
  signing key per AIP-7 governance. Records signature in the audit log.
version: 1.0.0
mutates:
  - "workspace:/governance/signatures/"
  - "audit:governance.artifact.sign"
requires:
  secrets: ["governance.signing-key"]
  tools:   ["governance.audit.append"]
approval: policy:governance/sign
risk_level: 2
cost_class: trivial
timeout_ms: 10000
inputs:
  type: object
  properties:
    artifact_ref:
      $ref: "https://agentproto.sh/docs/aip-27/REF.schema.json"
    signer_id:    { type: string, pattern: "^operator:[a-z0-9-]+$" }
    reason:       { type: string, maxLength: 500 }
  required: [artifact_ref, signer_id]
outputs:
  type: object
  properties:
    signature_path: { type: string }
    audit_entry_id: { type: string }
  required: [signature_path, audit_entry_id]
tags: [governance, signing, audit]
---
```

The `requires.secrets` and `requires.tools` arrays let the host gate the
call: only operators holding the `governance.signing-key` secret AND the
`governance.audit.append` capability can invoke this tool.

---

## 6. Driver-constrained (PII-safe self-hosted only)

When the contract handles sensitive data, use `driver_constraints` to
forbid third-party HTTP / MCP servers and require self-hosted SDK or
builtin drivers.

```md
---
name: PII Redact
id: pii.redact
description:
  Strip personally-identifiable information from text. Returns the redacted
  text plus a list of redaction spans.
version: 1.0.0
mutates: []
requires:
  network: []
approval: auto
risk_level: 0
cost_class: trivial
timeout_ms: 5000
driver_constraints:
  forbid: [http, mcp]              # PII never leaves the workspace
  require_kind: [sdk, builtin]
inputs:
  type: object
  properties:
    text: { type: string, maxLength: 100000 }
    types:
      type: array
      items: { enum: [email, phone, ssn, credit-card, name, address] }
      default: [email, phone, ssn, credit-card]
  required: [text]
outputs:
  type: object
  properties:
    redacted: { type: string }
    spans:
      type: array
      items:
        type: object
        properties:
          start: { type: integer }
          end:   { type: integer }
          type:  { type: string }
        required: [start, end, type]
  required: [redacted, spans]
tags: [pii, security, self-hosted-only]
---
```

The resolver will refuse any HTTP or MCP driver declaring this tool in
its `implements[]`. Only `kind: sdk` (in-process Microsoft Presidio
wrapper, e.g.) or `kind: builtin` (host-native redactor) candidates pass
Phase 1.

---

## 7. Multi-driver routable (default + fallback)

The pattern that justifies the layering. One contract, many drivers,
explicit default.

```md
---
name: Summarise Document
id: doc.summarise
description:
  Generate a 2-3 paragraph summary of a document. Accepts text input or a
  workspace file ref.
version: 1.0.0
mutates: []
requires:
  network: ["*"]
approval: auto
risk_level: 0
cost_class: metered
timeout_ms: 30000
default_driver: anthropic-summarise-http  # cheapest
inputs:
  type: object
  properties:
    text:     { type: string, maxLength: 1000000 }
    file_ref: { $ref: "https://agentproto.sh/docs/aip-27/REF.schema.json" }
    style:    { enum: [neutral, executive, technical], default: neutral }
    locale:   { type: string, pattern: "^[a-z]{2}(-[A-Z]{2})?$", default: "en" }
  oneOf:
    - { required: [text] }
    - { required: [file_ref] }
outputs:
  type: object
  properties:
    summary:    { type: string }
    word_count: { type: integer }
  required: [summary]
tags: [productivity, llm, summarisation]
---
```

Likely drivers:

- `anthropic-summarise-http` (HTTP, $0.001/call, default) — Anthropic
  Sonnet, neutral style baseline.
- `gemini-summarise-http` (HTTP, $0.0008/call) — Gemini Pro, cheaper but
  weaker on technical-style outputs.
- `host-llama-sdk` (SDK, $0.0001 + GPU, self-hosted) — local Llama 3 for
  PII-tagged workspaces; resolver picks this when policy forbids
  third-party LLMs.

The resolver picks per call based on cost, policy, region, and pin.
The contract stays unchanged regardless of which backend serves the
call.

---

## 8. Context-injected state (`contextSchema`)

Tools needing host state (governance config, db connection, tenant id)
declare a `contextSchema` so the host validates and narrows the context
before dispatching to the resolved driver's body.

```md
---
name: Query Tenant Database
id: db.tenant.query
description:
  Execute a parameterised SQL SELECT against the tenant's database. Read-only.
version: 1.0.0
mutates: []
requires:
  secrets: ["tenant.db-password"]
approval: auto
risk_level: 0
cost_class: metered
timeout_ms: 15000
inputs:
  type: object
  properties:
    query:  { type: string, maxLength: 10000 }
    params: { type: object, additionalProperties: true, default: {} }
  required: [query]
outputs:
  type: object
  properties:
    rows:      { type: array, items: { type: object } }
    row_count: { type: integer }
  required: [rows, row_count]
tags: [database, multi-tenant, read]
metadata:
  contextSchema:                # contract obligation across drivers
    type: object
    properties:
      tenant_id:    { type: string, pattern: "^t_[a-z0-9]{16}$" }
      db_connection: { type: object }
    required: [tenant_id, db_connection]
---
```

The host validates `args.context` against the `contextSchema` BEFORE
dispatching. The driver receives a narrowed, typed context — no casts,
no defensive re-validation. Multi-tenant routing happens at the host layer
(deriving `tenant_id` and `db_connection` per call); the contract and the
driver both stay tenant-agnostic.

---

## Anti-patterns

A few things authors are tempted to do but should NOT:

- **Adding `entry`, `code`, `run`, `runner`, `secrets`, or `network` to
  TOOL.md.** These fields belonged to the pre-AIP-30 bundled shape; in
  the post-refactor world they live exclusively on DRIVER.md.
  Manifests carrying these fields will fail the v1 schema.

- **Implementing the body inline via `execute`.** `defineTool` no longer
  accepts an `execute` field. Bodies live on DRIVER's `execute[<toolId>]`.

- **Driver-specific inputs in the contract schema.** If `seed` is
  Replicate-only and `negative_prompt` is OpenAI-only, the contract
  carries both as optional. Drivers narrow what they don't support
  via `schema_narrowing.drop_inputs`. Don't fork the contract per
  driver.

- **`approval: auto` with non-empty `mutates`.** The schema's `allOf`
  rule rejects this combination. Use `on-mutate` or `always`.

- **Mutable `id`.** `id@major` is the registration key. Renaming a
  contract = breaking change = major bump (or, in pre-1.0: registry-wide
  find/replace, since we control all consumers).

- **Forgetting `mutates` declarations.** A driver whose body writes
  resources outside the contract's `mutates` set fails the audit-log
  consistency check. The contract must declare every class of mutation
  any driver might perform.
