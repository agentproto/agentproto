# EXAMPLES.md — DRIVER.md reference patterns

Reference `DRIVER.md` files exemplifying common patterns. Each example is a
self-contained manifest a host could load as-is. Authors should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [HTTP driver, single tool, API-key auth (OpenAI Images)](#1-http-driver-single-tool-api-key-auth-openai-images)
2. [HTTP driver, multiple tools sharing one auth (Replicate)](#2-http-driver-multiple-tools-sharing-one-auth-replicate)
3. [CLI driver, full lifecycle (gh)](#3-cli-driver-full-lifecycle-gh)
4. [SDK driver, in-process, no install (host-builtin fs)](#4-sdk-driver-in-process-no-install-host-builtin-fs)
5. [MCP driver, stdio transport (filesystem-mcp)](#5-mcp-driver-stdio-transport-filesystem-mcp)
6. [Schema-narrowing driver (DALL-E for image.create)](#6-schema-narrowing-driver-dall-e-for-imagecreate)
7. [Region-pinned driver (EU-only data residency)](#7-region-pinned-driver-eu-only-data-residency)
8. [Multi-driver showcase (one TOOL, three drivers)](#8-multi-driver-showcase-one-tool-three-drivers)
9. [Mastra adapter (consume a DRIVER from a Mastra agent)](#9-mastra-adapter-consume-a-driver-from-a-mastra-agent)

---

## 1. HTTP driver, single tool, API-key auth (OpenAI Images)

The simplest HTTP shape: one tool, one API key, fixed cost, no refresh.

```md
---
name: OpenAI Images (HTTP)
id: openai-images-http
description:
  Image generation via OpenAI's HTTP API. DALL-E 3 standard quality.
version: 1.0.0
kind: http
auth:
  ref: ./SECRETS.md
  state:
    env: ["OPENAI_API_KEY"]
  expiry:
    detect: "http_status:401"
network:
  egress: ["api.openai.com"]
region: ["global"]
policy_tags: ["third-party-llm", "us-data-residency"]
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    schema_narrowing:
      drop_inputs: [seed, negative_prompt]
    mapping:
      prompt: prompt
      aspect: { from: aspect_ratio, transform: aspect_to_size }
    cost_override:
      cost_units_per_call: 4         # millicents (DALL-E 3 standard)
    metadata:
      http:
        endpoint: "/v1/images/generations"
        method: POST
health_check:
  method: http
  http: { method: GET, url: "https://api.openai.com/v1/models", expect_status: 200 }
  every: "PT5M"
tags: [openai, dalle, image-generation]
---

## When to reach for this driver

OpenAI for general-purpose image generation when policy allows third-party
LLMs and the user is OK with US data residency.

## Trade-offs

- $0.04/standard image — middle of the pack
- US-only data residency
- Very high reliability
- 50 RPM rate limit on standard tier
```

---

## 2. HTTP driver, multiple tools sharing one auth (Replicate)

One DRIVER, three TOOLs sharing a single auth surface, sandbox, and
egress allowlist. The natural fit when an HTTP API exposes related
operations.

```md
---
name: Replicate (HTTP)
id: replicate-http
description:
  Replicate model hosting — Flux family for image generation, edit, upscale.
  Single API token authenticates all three tools.
version: 1.0.0
kind: http
auth:
  ref: ./SECRETS.md
  state:
    env: ["REPLICATE_API_TOKEN"]
  expiry:
    detect: "http_status:401"
network:
  egress:
    - api.replicate.com
    - replicate.delivery       # generated artifact downloads
region: ["global"]
policy_tags: ["third-party-llm", "us-data-residency"]
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override:
      cost_units_per_call: 2.5
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "black-forest-labs/flux-1.1-pro"
          input:
            prompt: "${input.prompt}"
            aspect_ratio: "${input.aspect}"
  - tool: ./tools/image-edit/TOOL.md
    version: "^1.0.0"
    cost_override:
      cost_units_per_call: 3
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "black-forest-labs/flux-1.1-pro-edit"
  - tool: ./tools/image-upscale/TOOL.md
    version: "^1.0.0"
    cost_override:
      cost_units_per_call: 1
    metadata:
      http:
        endpoint: "/v1/predictions"
        method: POST
        body_template:
          version: "nightmareai/real-esrgan"
health_check:
  method: http
  http: { method: GET, url: "https://api.replicate.com/v1/models", expect_status: 200 }
  every: "PT10M"
tags: [replicate, flux, image-generation]
---

## When to reach for this driver

Replicate when photoreal style is requested (Flux 1.1 Pro dominates DALL-E
on photoreal benchmarks at half the cost).

## Trade-offs

- Cheaper than OpenAI ($0.025/image) but slower (~6-10s)
- Same US data residency
- Single auth covers create + edit + upscale — one fewer login flow
```

---

## 3. CLI driver, full lifecycle (gh)

CLI driver authored as a `kind: cli` DRIVER. Subtype-specific fields
(`bin`, `sandbox.fs/exec/tty`, `output`) live on the [AIP-29 CLI.md
specialisation](/docs/aip-29); the universal fields below live on DRIVER.

```md
---
name: GitHub CLI
id: gh
description:
  GitHub command-line interface — operate PRs, issues, releases, repos
  against any GitHub host.
version: 1.0.0
kind: cli
driver_kind: cli                  # AIP-29 explicit declaration

# CLI subtype fields (validated by AIP-29 schema)
bin: gh
bin_args: []
sandbox:
  fs:
    read:  ["**/.git/**", "~/.config/gh/**"]
    write: ["~/.config/gh/**"]
    deny:  ["~/.ssh/**"]
  exec:
    allow: true
    spawn: ["git"]
  tty:
    required: false
output:
  default_format: text
  json_flag: "--json"
  json_flag_args: ["number,title,body,state,author"]
  exit_codes:
    0: ok
    1: error
    2: usage_error
    4: auth_required
  stream: stdout
  error_stream: stderr

# Universal DRIVER fields
install:
  - { method: brew,  package: gh }
  - { method: apt,   package: gh }
  - { method: choco, package: gh }
version_check:
  cmd: "gh --version"
  parse: 'gh version (\S+)'
  range: ">=2.40 <3"
auth:
  ref: ./SECRETS.md
  state:
    paths: ["~/.config/gh"]
    env:   ["GH_TOKEN", "GITHUB_TOKEN"]
  login:
    cmd: "gh auth login --web"
    interactive: true
    completes_when:
      cmd: "gh auth status"
      exit_code: 0
  refresh:
    cmd: "gh auth refresh -s repo,read:org"
    every: "PT24H"
  expiry:
    detect: "exit_code:4"
network:
  egress:
    - api.github.com
    - github.com
    - "*.githubusercontent.com"
region: ["global"]
policy_tags: ["third-party-api"]
implements:
  - tool: ./tools/pr-create/TOOL.md
    version: "^1.0.0"
    cost_override:
      cost_units_per_call: 0       # gh API calls are free
    metadata:
      cli:
        argv:
          - pr
          - create
          - --title
          - "${input.title}"
          - --body
          - "${input.body | default('')}"
          - --base
          - "${input.base}"
  - tool: ./tools/pr-list/TOOL.md
    version: "^1.0.0"
    metadata:
      cli:
        argv: [pr, list, --json, "number,title,state,author"]
  - tool: ./tools/pr-merge/TOOL.md
    version: "^1.0.0"
    metadata:
      cli:
        argv:
          - pr
          - merge
          - "${input.pr_number}"
          - "--${input.method}"
tags: [github, git, devops]
---
```

---

## 4. SDK driver, in-process, no install (host-builtin fs)

SDK or builtin drivers run in-process. No install, no auth, no egress.
Used for the host runtime's first-party capabilities.

```md
---
name: Host filesystem
id: host-builtin-fs
description:
  Workspace filesystem read/write/list, host-native (no external binary or
  service). Implements fs.read, fs.write, fs.list, fs.exists.
version: 1.0.0
kind: builtin
implements:
  - tool: ./tools/fs-read/TOOL.md
    version: "^1.0.0"
  - tool: ./tools/fs-write/TOOL.md
    version: "^1.0.0"
  - tool: ./tools/fs-list/TOOL.md
    version: "^1.0.0"
  - tool: ./tools/fs-exists/TOOL.md
    version: "^1.0.0"
region: ["global"]
policy_tags: ["self-hosted", "pii-safe"]
metadata:
  builtin:
    host_id: agentik-runtime
tags: [filesystem, host-builtin, pii-safe]
---

## When to reach for this driver

Always — for any TOOL implemented by host fs operations, this is the only
driver. No alternative kinds (no CLI fs wrapper, no HTTP fs proxy) ship
in the registry.
```

---

## 5. MCP driver, stdio transport (filesystem-mcp)

`kind: mcp` driver speaking the Model Context Protocol over stdio.
Subtype-specific fields (`server_ref`, `transport`, `mcp_tool_name`)
defined in AIP-32 (forthcoming); shown here for orientation.

```md
---
name: Filesystem MCP server
id: filesystem-mcp
description:
  Anthropic's reference filesystem MCP server. Exposes file operations
  via stdio MCP. Run as a subprocess per workspace.
version: 1.0.0
kind: mcp

# MCP subtype fields (defined by AIP-32)
server_ref: ./servers/filesystem-mcp/server.json
transport: stdio
mcp_tools:                          # MCP tool name → AIP-14 TOOL.md mapping
  read_file:    fs-read
  write_file:   fs-write
  list_directory: fs-list

# Universal DRIVER fields
install:
  - { method: npm, package: "@modelcontextprotocol/server-filesystem", global: false }
version_check:
  cmd: "npx @modelcontextprotocol/server-filesystem --version"
  parse: 'v(\S+)'
  range: ">=0.5"
network:
  egress: []                        # local stdio, no network
region: ["global"]
policy_tags: ["self-hosted", "pii-safe"]
implements:
  - tool: ./tools/fs-read/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: read_file
  - tool: ./tools/fs-write/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: write_file
  - tool: ./tools/fs-list/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: list_directory
tags: [mcp, filesystem, anthropic-reference]
---
```

---

## 6. Schema-narrowing driver (DALL-E for image.create)

Pattern: a driver implements a TOOL contract but doesn't support every
optional input. Declare narrowing explicitly so the resolver refuses
calls using dropped inputs (caller-error, not silent).

```md
---
name: OpenAI DALL-E 3 (HTTP)
id: openai-dalle-3-http
description:
  OpenAI DALL-E 3 image generation. Implements image.create with several
  contract inputs unsupported (seed, negative_prompt, controlnet).
version: 1.0.0
kind: http
auth:
  ref: ./SECRETS.md
  state: { env: ["OPENAI_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.openai.com"]
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    schema_narrowing:
      drop_inputs:
        - seed                    # DALL-E 3 doesn't accept seed
        - negative_prompt         # OpenAI never had negative prompt
        - controlnet              # advanced control unsupported
        - num_outputs             # always returns 1; for batch use loop
    mapping:
      prompt: prompt
      aspect: { from: aspect_ratio, transform: aspect_to_size }
    cost_override:
      cost_units_per_call: 4
    metadata:
      http:
        endpoint: "/v1/images/generations"
        method: POST
        body_template:
          model: "dall-e-3"
          quality: "standard"
          size: "${aspect}"
          prompt: "${input.prompt}"
tags: [openai, dalle, narrowed]
---

## Schema narrowing rationale

The image.create contract carries 8 optional inputs covering Replicate's
Flux feature set. DALL-E 3 supports prompt + size only. The four dropped
inputs are explicit refusals, not silent ignores — calls using `seed: 42`
will be refused by the resolver with `error.code = "input_unsupported"`,
guiding the caller to either omit the input or pin a different driver.
```

---

## 7. Region-pinned driver (EU-only data residency)

```md
---
name: Mistral Image (EU HTTP)
id: mistral-image-eu-http
description:
  Mistral image generation, EU data residency. Hosted at api.mistral.eu.
version: 1.0.0
kind: http
auth:
  ref: ./SECRETS.md
  state: { env: ["MISTRAL_API_KEY"] }
  expiry: { detect: "http_status:401" }
network:
  egress: ["api.mistral.eu"]
region: ["EU", "eu-central-1", "eu-west-1"]   # ← key field
policy_tags:
  - "third-party-llm"
  - "eu-data-residency"
  - "gdpr-compliant"
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 3 }
    metadata:
      http:
        endpoint: "/v1/images/generations"
        method: POST
tags: [mistral, eu, gdpr]
---

## Routing implications

Workspaces tagged with `gdpr-required` or pinned to EU region MUST route
through this driver. The resolver's Phase 3 (policy filter) drops every
driver whose `region:` doesn't intersect the workspace's region constraint.
If `mistral-image-eu-http` is the only EU candidate and it's unauthed/down,
calls fail with `error.code = "no_route_in_region"` rather than silently
falling back to a US driver.
```

---

## 8. Multi-driver showcase (one TOOL, three drivers)

The point of the abstraction: one TOOL.md, three DRIVER.md files, the
runtime picks at call time. This example shows three real drivers all
declaring `image.create`.

**Driver 1 — `openai-images-http`** (US, $0.04, fast):

```yaml
id: openai-images-http
kind: http
region: ["global"]
policy_tags: ["third-party-llm", "us-data-residency"]
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 4 }
    metadata: { http: { endpoint: "/v1/images/generations", method: POST } }
```

**Driver 2 — `replicate-flux-http`** (US, $0.025, slower, photoreal):

```yaml
id: replicate-flux-http
kind: http
region: ["global"]
policy_tags: ["third-party-llm", "us-data-residency"]
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
```

**Driver 3 — `host-sdxl-sdk`** (self-hosted, $0.005, fastest on warm GPU):

```yaml
id: host-sdxl-sdk
kind: sdk
region: ["self-hosted"]
policy_tags: ["self-hosted", "pii-safe", "no-third-party"]
implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.5 }
    metadata:
      sdk:
        package: "@host/sdxl-runner"
        function_ref: "default"
```

**Resolver behaviour for `image.create`:**

| Call context | Routed driver | Why |
|---|---|---|
| Default workspace, no pin | `host-sdxl-sdk` | Cheapest by `cost_units_per_call`, kind preference SDK > HTTP. |
| Workspace pinned `policy_tags: forbid: ["self-hosted"]` | `replicate-flux-http` | SDXL filtered, Replicate cheaper than OpenAI. |
| Workspace pinned `region: EU` | (none — fails with `no_route_in_region`) | None of the three declare EU. Triggers escalation: register a fourth driver, or relax the constraint. |
| Call sets `pinnedProvider: openai-images-http` | `openai-images-http` | Pin overrides cost ranking (Phase 4). |
| `host-sdxl-sdk` health-check failed within 5min | `host-sdxl-sdk` skipped, `replicate-flux-http` picked | Phase 2 capability gate. |
| `style: photorealistic` + Replicate tagged `style_specialty: photoreal` (via metadata-driven policy) | `replicate-flux-http` | Workspace policy-pinned for photoreal style. |

This is what the abstract supertype buys: one TOOL contract, fanout to
implementations, runtime-driven routing without prompt-buried logic.

---

## 9. Mastra adapter (consume a DRIVER from a Mastra agent)

DRIVER.md is runtime-agnostic by design (AIP-15 §7: "no fields named
`mastra*`"). The bridge to a specific agent runtime — Mastra, LangChain,
the AI SDK — is an **adapter**, not a field on the manifest. The
canonical Mastra adapter ships as
[`@agentproto/adapter-mastra`](../../../adapters/mastra) and exposes a
single function, `toMastraTool`.

### Why the input is a `ToolImplementation`, not a raw handle

The adapter takes a typed `ToolImplementation<TInput, TOutput, TContext>`
— the `(contract, body)` pair produced by `implementTool` from
`@agentproto/driver`. This carries the contract's
`inputSchema` / `outputSchema` / `contextSchema` generics through to the
body, so the compiler enforces shape match between body and contract
(Solidity's `is IERC20` pattern in TypeScript).

An adapter that consumed `(handle, execute)` separately would defeat
that guarantee — drift between the contract you publish and the body
you ship would only surface at runtime.

Resolver / multi-driver dispatch is **orthogonal**: when the body should
pick a driver per call, the caller wraps `runTool` *inside*
`implementTool` once. The adapter is unchanged.

### Adapter shape (canonical, ships in `@agentproto/adapter-mastra`)

```ts
import { createTool } from "@mastra/core/tools"
import { toToolError, type ToolContext } from "@agentproto/tool"
import type { DriverContext, ToolImplementation } from "@agentproto/driver"

export type MastraContextSource<TContext extends ToolContext> =
  | { context: TContext }                                              // static
  | { fromMastraContext: (mastraCtx: unknown) => TContext }            // dynamic

export function toMastraTool<TInput, TOutput, TContext extends ToolContext>(
  impl: ToolImplementation<TInput, TOutput, TContext>,
  options: {
    source: MastraContextSource<NoInfer<TContext>>
    driverCtx?: DriverContext
  },
): ReturnType<typeof createTool>
```

The implementation is small (~40 lines, see source) because the heavy
lifting (schema validation, auth state, sandbox enforcement, resolver)
lives in `@agentproto/driver` and the per-kind runtimes
(`@agentproto/driver-cli`, `-http`, `-mcp`, `-sdk`).

### Usage — static body

```ts
import { defineTool } from "@agentproto/tool"
import { implementTool } from "@agentproto/driver"
import { toMastraTool } from "@agentproto/adapter-mastra"
import { z } from "zod"

const echo = defineTool({
  id: "echo",
  description: "Returns its input.",
  inputSchema:  z.object({ message: z.string() }),
  outputSchema: z.object({ echo: z.string() }),
})

const echoImpl = implementTool(echo, async ({ input }) => ({
  echo: input.message,
}))

export const echoTool = toMastraTool(echoImpl, {
  source: { context: {} },                  // no per-call context needed
})
```

### Usage — resolver-driven body (multi-driver dispatch)

The adapter is unchanged; only the body wraps `runTool`:

```ts
import { implementTool, runTool } from "@agentproto/driver"

const imageCreateImpl = implementTool(imageCreate, async (args) =>
  runTool({
    tool: imageCreate,
    candidates: [openaiImagesHttp, replicateFluxHttp, hostSdxlSdk],
    ...args,                               // input, context, driverCtx, signal
  }),
)

export const imageCreateTool = toMastraTool(imageCreateImpl, {
  source: {
    fromMastraContext: (mastraCtx) => ({
      // pull workspace/user/region/pinnedProvider from Mastra's
      // runtime context per call (multi-tenant case)
      workspaceId:    (mastraCtx as any).workspaceId,
      pinnedProvider: (mastraCtx as any).pinnedProvider,
    }),
  },
})
```

The 6-phase resolver runs inside `runTool`; the adapter only translates
shapes.

### Static vs dynamic context binding

| Mode | When to use | Cost |
|---|---|---|
| `{ context: T }` | Process-scoped context (single workspace, fixed locale) — set once at adapter time. | Closure capture, zero per-call. |
| `{ fromMastraContext: fn }` | Per-request context (multi-tenant `tenantId`, scoped DB connection, request user). | One callback per `execute`. |

Tested in
[`adapters/mastra/src/__tests__/to-mastra-tool.test.ts`](../../../adapters/mastra/src/__tests__/to-mastra-tool.test.ts)
— 5 tests covering both modes, schema preservation, and `ToolError`
propagation.

### What the adapter does NOT do

- **Pick the driver.** That's `runTool`'s job (AIP-30 § Multi-driver
  routing). The adapter is unaware of how many drivers back a given
  TOOL.
- **Validate inputs.** Mastra validates `inputSchema` against
  `inputData` before calling `execute`; `runTool` re-validates against
  the contract narrowed by `schema_narrowing`. The adapter sits in the
  middle and trusts both.
- **Enforce sandbox.** The driver-runtime + per-kind runtimes enforce
  egress / fs / exec policy. The adapter cannot subvert it
  (AIP-30 § Conformance rules §6).
- **Cache auth state.** State persistence is per
  `(driver.id, workspace.id, user.id)` — `@agentproto/driver` owns it.

### Trade-offs

- **Per-call overhead** is one extra function frame plus an `inputData →
  TInput` cast. Negligible vs network/CLI cost; measurable for
  `kind: builtin` calls — acceptable for the routing payoff.
- **Mastra version pinning.** `createTool`'s `execute` signature has
  changed across `@mastra/core` minors. The adapter declares
  `@mastra/core: "*"` as a peer and pins a known-good major in
  `devDependencies`; consumers bump together.
- **`fromMastraContext` is untyped.** `mastraCtx` is `unknown` because
  Mastra's per-call context shape varies (agent vs workflow vs request
  context). Authors cast inside the callback. v2 may type per host.

### Mirror adapters

Same shape, different framework — each adapter is its own `~30–60`-line
package under `adapters/`:

| Adapter | Package | Tests |
|---|---|---|
| Mastra | [`@agentproto/adapter-mastra`](../../../adapters/mastra) | 5 ✅ |
| AI SDK | [`@agentproto/adapter-ai-sdk`](../../../adapters/ai-sdk) | 3 ✅ |
| LangChain (TS) | _planned_ | — |
| OpenAI Assistants | _planned_ | — |
| Anthropic SDK | _planned_ | — |

DRIVER.md stays runtime-agnostic; adapters are where the framework-
specific glue lives.

---

## Anti-patterns

A few things authors are tempted to do but should NOT:

- **Adding driver-specific inputs to the abstract TOOL contract.** If
  one driver supports `seed` and another doesn't, the contract should
  carry `seed` as optional and the unsupporting driver declares
  `schema_narrowing.drop_inputs: [seed]`. Don't pollute the contract
  with `provider_seed_openai` / `provider_seed_replicate` fields.

- **Multi-account auth via copy-pasted DRIVER.md.** Currently the
  workaround for "OpenAI account A vs B" is two DRIVER.md files. Don't
  rename them as `openai-acct-a-http` / `openai-acct-b-http` and
  duplicate `implements[]` — author the second one as a copy of the
  first with only `id` and `auth.state.env` changed. Document that
  multi-account v2 is a known follow-up (AIP-30 Open Questions).

- **Wildcarding `network.egress`.** A driver that declares
  `egress: ["*"]` defeats the policy filter. Be specific. If the driver
  legitimately needs the open internet, document why in the body and
  expect resolver policy to refuse it for tagged workspaces.

- **Embedding secrets in `examples` or `metadata`.** The examples render
  in catalog UIs and reach LLM contexts. Use placeholders (`<TOKEN>`,
  `sk_test_…`) and never real keys.

- **Mutable `id`.** `id` + major version is the registration key.
  Renaming = breaking change = major bump + alias for the legacy id
  during a deprecation window. (Or, in our pre-1.0 phase: just rename
  with a registry-wide find/replace, since we control all consumers.)

- **Forgetting `region` for non-global drivers.** Default is
  `["global"]`. Drivers with regional infrastructure MUST declare
  their region(s); otherwise the resolver assumes global and routes
  past EU/HIPAA constraints. This is a security-relevant default.
