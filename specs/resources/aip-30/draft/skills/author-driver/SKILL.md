---
schema: skills/v1
name: author-driver
title: Author a DRIVER.md (AIP-30)
description:
  Walk through authoring a portable DRIVER.md manifest — the abstract
  supertype that wraps a concrete implementation (CLI binary, HTTP API,
  MCP server, SDK package, or host builtin) and binds it to one or more
  abstract TOOL.md contracts.
version: 1.0.0
tags: [aip-30, drivers, authoring, manifest, agentproto]
inputs:
  - name: kind
    type: string
    required: true
    description:
      One of "cli", "http", "mcp", "sdk", "builtin". Drives the
      subtype-specific frontmatter the skill emits.
  - name: backend
    type: string
    required: true
    description:
      What you're wrapping. Examples - "OpenAI Images API", "gh CLI",
      "filesystem MCP server", "Replicate Flux HTTP", "host fs builtin".
  - name: tools
    type: string
    required: true
    description:
      Comma-separated list of TOOL.md refs this driver should implement.
      ("./tools/image-create/TOOL.md, ./tools/image-edit/TOOL.md").
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the entry file when custom login/parse logic is
      needed. Default "ts". Accepts "ts", "py", "go".
examples:
  - input:
      kind: "http"
      backend: "OpenAI Images API"
      tools: "./tools/image-create/TOOL.md, ./tools/image-edit/TOOL.md, ./tools/image-variation/TOOL.md"
    output:
      - .drivers/openai-images-http/DRIVER.md
      - .drivers/openai-images-http/SECRETS.md
  - input:
      kind: "cli"
      backend: "stripe CLI"
      tools: "./tools/stripe-customers-list/TOOL.md, ./tools/stripe-invoices-send/TOOL.md"
    output:
      - .cli/stripe/CLI.md
      - .cli/stripe/SECRETS.md
---

# Author a DRIVER.md (AIP-30)

Use this skill when the user asks to **wrap a backend** — a CLI binary,
an HTTP API, an MCP server, an SDK package, or a host-builtin function —
so an agent can install, authenticate, sandbox, and invoke it through
abstract TOOL.md contracts. The skill produces a valid
[AIP-30 DRIVER.md](/docs/aip-30) manifest plus, when needed, an entry
file that exposes the standard `defineDriver` signature.

## When to use

- "Wrap the OpenAI Images API as an HTTP driver for our image.create tool."
- "Add the stripe CLI as a driver so the billing agent can use it."
- "Connect the filesystem MCP server as a driver for fs.read/write/list."
- "Make the host's builtin fs operations register as a driver."

## When NOT to use

- The TOOL contract doesn't exist yet → first run the
  [AIP-14 author-tool skill](../../../aip-14/draft/skills/author-tool/SKILL.md)
  to produce TOOL.md files, then come back here.
- The user just wants to *call* an existing driver — no authoring needed.
- The user wants to expose a high-level user verb (Create image button,
  voice-friendly action) → use the
  [AIP-28 author-intent skill](../../../aip-28/draft/skills/author-intent/SKILL.md);
  intents route to tools, drivers implement tools.

## Process

Follow these steps in order. Each step has a short justification — keep
them in the file you produce so reviewers see why each field ended up
the way it did.

### 1. Pick the kind

The `kind:` enum drives the subtype-specific fields the manifest needs:

| `kind` | When to pick | Subtype AIP |
|---|---|---|
| `cli` | Wrapping a binary on `$PATH` (`gh`, `gcloud`, `kubectl`, `ffmpeg`). | [AIP-29 CLI.md](/docs/aip-29) |
| `http` | Wrapping an HTTP API (OpenAI, Replicate, Stripe, GitHub REST). | AIP-31 (forthcoming) |
| `mcp` | Wrapping an MCP server (Anthropic protocol, stdio/sse/http). | AIP-32 (forthcoming) |
| `sdk` | Wrapping an in-process package (`npm`/`pip`/`cargo`). | AIP-33 (forthcoming) |
| `builtin` | The host runtime provides the implementation natively. | This AIP, § Builtin drivers |

If the wrapping nature is hybrid (an SDK that shells out to a binary, a
CLI that calls HTTP behind the scenes), pick the kind whose surface the
agent actually invokes. The driver's *internal* dispatch can do
whatever it wants.

### 2. Identify the implemented tools

For each TOOL.md ref the user supplied:

1. Verify the TOOL.md exists at the referenced path.
2. Read its `inputSchema` and `outputSchema` — these are the contract
   you commit to satisfying.
3. Note which optional inputs your backend doesn't support — these
   become `schema_narrowing.drop_inputs[]` entries.
4. Note any input keys that need renaming on the wire (e.g.
   contract `aspect` → API `aspect_ratio`) — these become `mapping[]`.

If a needed TOOL.md doesn't exist, pause and either run the author-tool
skill first or have the user clarify what contract this driver should
satisfy.

### 3. Author identity + universal fields

```yaml
spec: agentdriver/v1
name: <Display name>                  # "OpenAI Images (HTTP)"
id: <kind-prefixed-id>                # "openai-images-http"
description: <one paragraph>          # what backends this implements, what it doesn't
version: 1.0.0
kind: <picked above>
```

Convention: prefix `id` with a short kind tag (`-http`, `-cli`, `-mcp`,
`-sdk`) so the id is self-describing in the registry.

### 4. Map the auth surface (when applicable)

Most drivers need auth; `builtin` and offline tools (`ffmpeg`,
`jq`) don't. For the rest, identify:

- **State location**: which paths/env-vars the backend persists auth in.
- **Login flow**: the command/URL the user invokes (CLI: `gh auth login`,
  HTTP: a browser OAuth flow URL, SDK: an env-var initialisation).
- **Refresh**: cadence + command/url. Usually 8h-24h ISO-8601.
- **Expiry signal**: how to detect "auth expired" — exit code, HTTP
  status, exception name, response header.

Author a sibling `SECRETS.md` (per [AIP-19](/docs/aip-19)) listing every
env-var binding the driver needs. Reference it from `auth.ref:`.

### 5. Author install paths (CLI / SDK only)

For `kind: cli` or `kind: sdk` drivers, identify install methods.
Aim for 3+ covering major package managers + a fallback download URL.
Verify SHA-256 for `download` and `curl` methods.

For `kind: http`, `mcp`, `builtin`: omit `install` entirely.

### 6. Author the sandbox profile

Universal for every driver:

- **`network.egress`**: list every hostname/glob the backend contacts.
  Be specific — `["api.openai.com"]`, not `["*"]`.

For `kind: cli`, also (per [AIP-29](/docs/aip-29)):
- **`sandbox.fs.read/write/deny`**: glob paths.
- **`sandbox.exec.allow/spawn`**: child processes.
- **`sandbox.tty.required`**: PTY needed for interactive flows.

### 7. Declare `implements[]`

For each tool the driver satisfies, author one entry:

```yaml
implements:
  - tool: <ref-to-tool-md>
    version: ^1.0.0                  # contract semver this binding is valid for
    schema_narrowing:                # only when needed
      drop_inputs: [seed, ...]
    mapping:                         # only when keys diverge
      contract_key: backend_key
    cost_override:
      cost_units_per_call: <millicents>
    metadata:
      <kind>:
        # subtype-specific dispatch hints
```

Per-kind metadata shape:

| `kind` | Required `metadata.<kind>` | Notes |
|---|---|---|
| `cli`  | `argv: string[]` (template with `${input.X}`) | Argv tokens, shell-escaped at runtime. |
| `http` | `endpoint: string`, `method: string`, optional `body_template`, `headers` | URL relative to the driver's base URL. |
| `mcp`  | `tool_name: string` | Name of the MCP tool to call via `tools/call`. |
| `sdk`  | `package: string`, `function_ref: string` | Function name (or `default`) to import. |
| `builtin` | (none — host registry handles dispatch) | The host runtime provides the body. |

### 8. Add region + policy_tags (when relevant)

- **`region: ["us-east-1", "EU", "global"]`**: where the backend's data
  resides. Default `"global"`. Critical for GDPR/HIPAA workspaces.
- **`policy_tags: ["pii-safe", "self-hosted", "third-party-llm",
  "gdpr-compliant", ...]`**: free-form markers the resolver's policy
  filter reads.

Skipping these defaults to "global, no policy markers" — fine for
generic workspaces, broken for regulated ones.

### 9. Add health-check + cost-override (when relevant)

For long-lived drivers (HTTP APIs, MCP servers), add a periodic
health-check so the resolver knows when the backend is reachable:

```yaml
health_check:
  method: http
  http: { method: GET, url: "...", expect_status: 200 }
  every: "PT5M"
```

`cost_override.cost_units_per_call` (in millicents) lets the resolver
rank multi-driver candidates by cost. Skip when contract's
`cost_class` baseline suffices.

### 10. Validate

Run the manifest through
[`./resources/aip-30/draft/DRIVER.schema.json`](../../DRIVER.schema.json):

```bash
ajv validate -s DRIVER.schema.json -d .drivers/<id>/DRIVER.md \
  --remove-additional fail \
  --strict
```

Then dispatch to the subtype schema for kind-specific fields:

```bash
# kind: cli
ajv validate -s ../aip-29/draft/CLI.schema.json -d .cli/<id>/CLI.md
# kind: http (when AIP-31 ships)
# kind: mcp (when AIP-32 ships)
```

### 11. Wire to the host

```ts
import { loadProvider, installProvider, verifyProvider, loginProvider } from "@agentproto/driver-runtime"

const driver = await loadProvider("./.drivers/openai-images-http/DRIVER.md")
if (driver.kind === "cli" || driver.kind === "sdk") {
  await installProvider(driver)
  await verifyProvider(driver)
}
// First-call login is deferred until needed
```

The driver now registers in the runtime's catalog, and the resolver
will pick it for calls to `image.create` (and the other tools it
implements) when capability + policy + cost rank it as the candidate.

## Output structure

The skill emits at minimum:

```
.drivers/<id>/                     ← for kind: http | mcp | sdk | builtin
  DRIVER.md
  SECRETS.md                         ← unless kind: builtin
  driver.ts                        ← only when custom login/parse needed

.cli/<id>/                           ← for kind: cli (colocated with the bundle)
  CLI.md                             ← which IS a DRIVER (kind: cli)
  SECRETS.md
  cli.ts                             ← only when needed
  tools/<subcmd>/TOOL.md             ← per-subcommand contracts
```

## Common mistakes

- **Wildcarding `network.egress`.** `["*"]` defeats the policy filter.
  Be specific. If the backend truly needs the open internet, document
  why in the body.
- **Forgetting `region` for non-global drivers.** Default is
  `["global"]`. Drivers with regional infrastructure MUST declare
  region(s) — silently global is a security regression for regulated
  workspaces.
- **Missing `schema_narrowing` for unsupported optional inputs.** If
  your backend doesn't support an optional input on the contract,
  declare `schema_narrowing.drop_inputs: [X]` so the resolver refuses
  calls using X — silent ignore is a contract violation.
- **Embedding secrets in `examples` or `metadata`.** They render in
  catalog UIs and reach LLM contexts. Use placeholders (`<TOKEN>`,
  `sk_test_…`).
- **Declaring `implements[].mapping` for identity renames.** When
  contract input X maps to backend input X, leave `mapping` empty —
  identity mapping is the default. Only declare `mapping` for renames
  or transforms.
- **Mutable `id`.** `id` + major version is the registration key.
  Renaming = breaking change = major bump (or, in pre-1.0: just
  registry-wide find/replace, since we control all consumers).
- **Forgetting to declare `driver_kind` (CLI subtype).** AIP-29
  CLI.md MUST add `driver_kind: cli` to its frontmatter so the
  registry knows the file is both a CLI bundle and a DRIVER.
