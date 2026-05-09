# AIP-45 AGENT-CLI.md — adapter implementer's guide

This guide is for implementers writing a new agent-CLI adapter — either
a manifest (`AGENT-CLI.md`) or a `protocol: proprietary` adapter
package.

## Choosing a protocol arm

```
Does the binary speak ACP?
├── Yes → protocol: "acp"
│         Bind to an AIP-44 ACP.md describing the wire profile.
│         Reference impl: src/protocol/acp.ts in @agentproto/driver-agent-cli.
│
└── No → Does it speak MCP-over-stdio?
         ├── Yes → protocol: "mcp"
         │         Inline MCP server config; tool calls flow over MCP.
         │         Reference impl: src/protocol/mcp.ts.
         │
         └── No → protocol: "proprietary"
                  Write an adapter package implementing AgentCliClient.
                  Publish as @your-scope/adapter-<name> on npm.
```

When in doubt, push the upstream agent toward ACP — it's where the
ecosystem is converging. Adapters for ACP-speaking agents are
manifest-only; adapters for non-ACP agents are code.

## Authoring an `AGENT-CLI.md`

Minimum required fields:

```yaml
---
name: <kebab-id matching dir>
id: <stable-id>
description: <one-paragraph purpose>
version: <semver of this manifest>
bin: <path or PATH-resolvable binary>
install: [...]                       # AIP-29 install methods
version_check:
  cmd: <version probe command>
  parse: <regex with one capture group>
  range: <semver range>
sandbox: <ref or inline AIP-36 block>
protocol: acp | mcp | proprietary
# Plus exactly one of:
acp:     <ref to AIP-44 ACP.md>      # when protocol=acp
mcp:     { ... }                     # when protocol=mcp
adapter: "@scope/pkg"                # when protocol=proprietary
---
```

Recommended additions:

- `auth:` — AIP-29 auth block referencing an AIP-19 SECRETS.md
- `session:` — declare session policy explicitly even at defaults
- `models:` — let hosts route between models the agent supports
- `capabilities:` — pre-flight visibility for routing decisions
- `examples:` — a handful of canonical prompts the agent handles well

## Implementing a proprietary adapter

A `protocol: "proprietary"` adapter package exports a default `defineAgentCli`
result whose runtime reaches the `AgentCliClient` interface:

```ts
import type { AgentCliClient, StreamEvent } from "@agentproto/driver-agent-cli"

export const myAdapter: AgentCliClient = {
  async connect(opts) { /* spawn + handshake */ },
  async send(turnId, message) { /* write to subprocess */ },
  events(): AsyncIterable<StreamEvent> { /* yield normalised events */ },
  async cancel(turnId) { /* abort current turn */ },
  async close() { /* tear down */ },
}
```

The adapter MUST translate any vendor-specific events into the
canonical taxonomy:

| Canonical event | Description |
|---|---|
| `text-delta` | Streaming agent message text chunk |
| `tool-call` | Agent invoking a tool — args + tool id |
| `tool-result` | Tool's response delivered back to the agent |
| `thought` | Agent's internal reasoning (when capability declared) |
| `agent-prompt` | Agent asking the user/client for input mid-turn |
| `turn-end` | Agent has finished the current turn |
| `error` | Out-of-band error during the turn |

Vendor-specific event types MUST NOT leak past the protocol arm.
Hosts (Guilde Shell view, Katchy workflow runner, Simone) consume the
canonical taxonomy only.

## Sandbox + secrets contract

The runner resolves the sandbox + secrets *before* spawning the
binary. The adapter receives a flat env map and a working directory;
it MUST NOT shell out for secrets, MUST NOT reach for env vars
outside `process.env` map passed in, and MUST NOT log secret values.

```ts
type ConnectOpts = {
  cwd: string                       // sandbox-resolved working dir
  env: Record<string, string>       // sandbox.env.set, secrets resolved
  abortSignal: AbortSignal          // cancellation
  capabilities: AgentCapabilities   // negotiated with the host
}
```

## Lifecycle invariants

- `connect()` MUST honour `abortSignal` at every await point.
- `connect()` MUST resolve within the version_check timeout (default
  5 s).
- `events()` MUST emit `turn-end` exactly once per `send()` call (or
  `error`).
- `cancel(turnId)` MUST cause the current `events()` consumer to
  receive `turn-end` (or `error` with kind=`cancelled`) within 1 s.
- `close()` MUST terminate the subprocess; SIGTERM → 5 s grace →
  SIGKILL.

## Testing

Adapters SHOULD ship a smoke test that spawns the real binary against
a deterministic prompt. The convention is:

```ts
// src/__tests__/smoke.test.ts
import { test } from "vitest"

test.skipIf(!process.env.YOUR_BIN)("end-to-end turn", async () => {
  // spawn → send → consume → assert turn-end
})
```

Gating on an env var keeps CI green when the binary isn't installed,
without losing the "real run on a developer's box" coverage.

## Publishing

- Adapter packages: `@your-scope/adapter-<name>`, MIT/Apache-2.0
  license, peer-dep on `@agentproto/driver-agent-cli`.
- Manifests: live alongside the adapter package or in
  `agentproto/ts/adapters/<name>/AGENT-CLI.md`.
- The upstream agent's licence governs runtime use; the adapter
  package licence governs the wrapper code.
