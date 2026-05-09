# AIP-44 ACP.md — examples

Reference manifests for both roles. All examples validate against
[`./ACP.schema.json`](./ACP.schema.json).

## Server example — Hermes Agent (subprocess server)

`hermes-acp/ACP.md` declares Hermes as an ACP-conformant **server**
that an agentproto client (or any IDE — Zed, VSCode, etc.) can drive.
Hermes exposes its built-in operator, not an agentproto AIP-9 one.

```yaml
---
name: hermes-acp
id: hermes-acp
description: Nous Research's Hermes Agent exposed via its built-in ACP server. Agentproto clients drive Hermes via ACP over stdio; tool calls stream as session/update events; memory and skills come from Hermes' own plugin layer.
version: 0.1.0
kind: server
transport: stdio
tags: [hermes, nous, acp, third-party]
metadata:
  aip44:
    acp_rev: "abc1234"        # pin the upstream ACP commit Hermes targets
    tier: governance-aware
    capabilities:
      agent:
        loadSession: true
        promptCapabilities:
          image: true
          audio: false
          embeddedContext: true
        mcpCapabilities:
          http: false
          sse: false
    # `operator` omitted — Hermes does not expose an AIP-9 operator;
    # it ships its own internal agent. Agentproto clients treat it as
    # an opaque ACP server.
---
```

## Server example — Guilde operator (IDE distribution)

`guilde-acp/ACP.md` declares a Guilde-side ACP **server** that wraps
an AIP-9 operator. A user configures `guilde-acp` as their ACP agent
in Zed/VSCode, and the editor talks to a Guilde operator transparently.

```yaml
---
name: guilde-acp
id: guilde-acp
description: Guilde operator exposed as an ACP server for IDE clients. Wraps a running AIP-9 operator (selected at boot from the user's guild), bridges ACP turns to operator lifecycle, mirrors tool calls into the operator's AIP-7 audit log.
version: 0.1.0
kind: server
transport:
  - stdio
  - websocket
tags: [guilde, agentproto, acp, ide]
metadata:
  aip44:
    acp_rev: "abc1234"
    tier: sandboxed
    capabilities:
      agent:
        loadSession: true
        promptCapabilities:
          image: true
          audio: false
          embeddedContext: true
        mcpCapabilities:
          http: true
          sse: false
    operator:   ./OPERATOR.md
    governance: ./GOVERNANCE.md
    sandbox:    ./SANDBOX.md
    audit:
      kind: governance
    mcp_servers:
      - name: workspace
        transport: stdio
        ref: ./mcp/workspace.MCP.md
---
```

## Client example — agentproto driving Hermes

`hermes-client/ACP.md` declares an agentproto-side ACP **client** that
drives a Hermes subprocess. AIP-45 [`HERMES.md`](/docs/aip-45) handles
install/spawn; this manifest is the wire-protocol slice.

```yaml
---
name: hermes-client
id: hermes-client
description: ACP client that connects to a spawned Hermes subprocess. Owned by @agentproto/driver-agent-cli when AIP-45 protocol=acp.
version: 0.1.0
kind: client
transport: stdio
metadata:
  aip44:
    acp_rev: "abc1234"
    tier: governance-aware
    capabilities:
      client:
        fs:
          readTextFile: true
          writeTextFile: true
        terminal: false
---
```

## Bridge example — proxy chain

A `kind: bridge` runtime sits between an upstream ACP client and a
downstream ACP server. Tracks upstream RFD-002 (ACP Proxy Chains).
Forwards `session/*` calls in both directions, optionally enriching
with governance gates or memory persistence.

```yaml
---
name: governance-bridge
id: governance-bridge
description: Bridge runtime that adds AIP-7 governance gates between an editor (client) and an ACP-speaking subagent (server). Tool calls from the subagent are intercepted and routed through the operator's governance binding before being returned to the editor.
version: 0.1.0
kind: bridge
transport: stdio
metadata:
  aip44:
    acp_rev: "abc1234"
    tier: governance-aware
    operator:   ./OPERATOR.md
    governance: ./GOVERNANCE.md
    audit:
      kind: governance
---
```

## Conformance targets

Every example above MUST satisfy:

1. Upstream ACP at the commit pinned in `metadata.aip44.acp_rev`
2. The schema at `./ACP.schema.json`
3. Capability declarations match the runtime's actual behaviour

Servers that declare `tier: sandboxed` without a `metadata.aip44.sandbox`
ref will fail schema validation (cross-field rule in
`allOf`/`if`/`then`).
