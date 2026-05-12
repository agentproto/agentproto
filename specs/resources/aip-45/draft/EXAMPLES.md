# AIP-45 AGENT-CLI.md — examples

Reference manifests, one per supported protocol arm. All validate
against [`./AGENT-CLI.schema.json`](./AGENT-CLI.schema.json).

## ACP arm — Hermes Agent

The reference adapter for `protocol: "acp"`. Hermes ships an ACP server
out of the box; the manifest just wires install + version + spawn.

```yaml
---
name: hermes
id: hermes
description: Nous Research's Hermes Agent — autonomous CLI agent with skills, sandboxes, and memory plugins. Spawned as `hermes acp` and driven over stdio JSON-RPC; per-turn streaming via session/update.
version: 0.1.0
bin: hermes
bin_args: [acp]
install:
  - method: curl
    url: https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh
    verify_sha256: "<sha-pinned-at-package-build-time>"
version_check:
  cmd: hermes --version
  parse: "^hermes\\s+(\\d+\\.\\d+\\.\\d+)"
  range: ">=0.13.0 <1.0.0"
  timeout_ms: 5000
auth:
  ref: ./SECRETS.md
  state:
    env: [OPENROUTER_API_KEY, ANTHROPIC_API_KEY]
sandbox: ./SANDBOX.md
protocol: acp
acp: ./hermes-acp.ACP.md
session:
  mode: persistent
  idle_timeout_ms: 1800000     # 30 min
  context_carryover: true
models:
  default: anthropic/claude-sonnet-4-6
  allowed:
    - anthropic/claude-sonnet-4-6
    - anthropic/claude-opus-4-7
    - openai/gpt-4
    - meta-llama/llama-3.3-70b
  env:
    anthropic: ANTHROPIC_API_KEY
    openrouter: OPENROUTER_API_KEY
capabilities:
  streaming: true
  tool_calls: true
  sub_agents: true
  file_io: true
  multimodal: true
  resumable: false
  bidirectional: true
modes:
  - id: default
    description: Standard interactive session
options:
  - id: model
    type: enum
    enum:
      - anthropic/claude-sonnet-4-6
      - anthropic/claude-opus-4-7
    bin_args_template: ["--model", "{value}"]
  - id: max_turns
    type: integer
    min: 1
    max: 200
    bin_args_template: ["--max-turns", "{value}"]
continuation:
  default: pinned-session
  supported: [pinned-session, transcript, none]
  pinned_session:
    idle_timeout_ms: 1800000
    key_scope: [conversation, operator]
tags: [hermes, nous, acp, agent-runtime]
---
```

### Operator binding (AIP-9)

A Hermes-bound operator picks per-turn knobs through `runtime.config`:

```yaml
# operator definition (AIP-9 OPERATOR.md frontmatter)
runtime:
  kind: agent-cli
  ref: hermes
  config:
    options:
      model: anthropic/claude-opus-4-7
      max_turns: 50
    continuation: pinned-session   # default; shown explicitly
```

The host validates `config.options.*` against the manifest's `options[]`
declarations before spawn; unknown ids are rejected at load time.

## MCP arm — Goose

`protocol: "mcp"` covers agents that converge on MCP-over-stdio
without an ACP server (today).

```yaml
---
name: goose
id: goose
description: Block's Goose — open-source agent CLI with MCP-based extensions. Driven via MCP-over-stdio; tool calls flow as MCP tool invocations rather than ACP session/update events. Translated to AIP-45 stream events at the protocol-arm boundary.
version: 0.1.0
bin: goose
install:
  - method: brew
    package: goose
  - method: cargo
    package: goose
version_check:
  cmd: goose --version
  parse: "^goose\\s+(\\d+\\.\\d+\\.\\d+)"
  range: ">=1.0.0"
auth:
  ref: ./SECRETS.md
  state:
    env: [OPENAI_API_KEY, ANTHROPIC_API_KEY]
sandbox: ./SANDBOX.md
protocol: mcp
mcp:
  command: goose
  args: [serve]
  transport: stdio
session:
  mode: ephemeral
  idle_timeout_ms: 600000
capabilities:
  streaming: true
  tool_calls: true
  file_io: true
  multimodal: false
  resumable: false
  bidirectional: false
tags: [goose, block, mcp, agent-runtime]
---
```

## Proprietary arm — Gemini CLI

`protocol: "proprietary"` for agents whose CLI is a REPL or
custom protocol. The manifest names an NPM adapter implementing
`AgentCliClient`.

```yaml
---
name: gemini-cli
id: gemini-cli
description: Google's Gemini CLI — REPL-style agent CLI. Driven via a node-pty wrapper that parses prompts and streams completions; bridged to AIP-45 stream events through a proprietary adapter package.
version: 0.1.0
bin: gemini
install:
  - method: npm
    package: "@google/gemini-cli"
    global: true
version_check:
  cmd: gemini --version
  parse: "^(\\d+\\.\\d+\\.\\d+)"
  range: ">=0.1.0"
auth:
  ref: ./SECRETS.md
  state:
    env: [GEMINI_API_KEY]
sandbox: ./SANDBOX.md
protocol: proprietary
adapter: "@agentproto/adapter-gemini-cli"
session:
  mode: ephemeral
capabilities:
  streaming: true
  tool_calls: false
  file_io: true
  multimodal: true
  resumable: false
  bidirectional: false
tags: [gemini, google, repl, proprietary]
---
```

## Resumable session example — Claude Code

Demonstrates `session: { mode: resumable }` with the matching
`capabilities.resumable: true` cross-field rule.

```yaml
---
name: claude-code
id: claude-code
description: Anthropic's Claude Code — agentic coding CLI. ACP server published at @agentclientprotocol/claude-agent-acp. Supports session/load for resumable sessions across runs.
version: 0.1.0
bin: claude-code
bin_args: [--acp]
install:
  - method: npm
    package: "@anthropic-ai/claude-code"
    global: true
version_check:
  cmd: claude-code --version
  parse: "claude-code\\s+(\\d+\\.\\d+\\.\\d+)"
  range: ">=0.5.0"
auth:
  ref: ./SECRETS.md
  state:
    env: [ANTHROPIC_API_KEY]
sandbox: ./SANDBOX.md
protocol: acp
acp: ./claude-code-acp.ACP.md
session:
  mode: resumable
  idle_timeout_ms: 86400000    # 24 hours
  context_carryover: true
capabilities:
  streaming: true
  tool_calls: true
  sub_agents: true
  file_io: true
  multimodal: false
  resumable: true              # required by cross-field rule
  bidirectional: true
tags: [claude-code, anthropic, acp, coding]
---
```

## Conformance targets

Every example MUST satisfy:

1. The schema at `./AGENT-CLI.schema.json`
2. Cross-field rules: `protocol=acp ⇒ acp ref present`,
   `protocol=mcp ⇒ mcp block present`, `protocol=proprietary ⇒ adapter
   present`, `session.mode=resumable ⇒ capabilities.resumable: true`
3. AIP-29 install/version/auth schemas (validated via `$ref`)
4. AIP-36 sandbox schema
5. AIP-44 ACP schema (when `protocol=acp`, on the bound `acp:` ref)
