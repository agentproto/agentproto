---
schema: skills/v1
name: author-sdk
title: Author an SDK provider (AIP-33)
description:
  Walk through authoring a kind:sdk PROVIDER.md — wraps an in-process
  SDK package (npm / pip / cargo / go / workspace-local) as a conformant
  provider implementing one or more abstract TOOL contracts.
version: 1.0.0
tags: [aip-33, sdk, providers, authoring]
inputs:
  - name: package_name
    type: string
    required: true
    description: Name of the SDK package (e.g. "openai", "anthropic", "@host/sdxl-runner").
  - name: package_manager
    type: string
    required: true
    description: One of "npm", "pnpm", "yarn", "pip", "poetry", "cargo", "go", "local".
  - name: tools
    type: string
    required: true
    description: Comma-separated TOOL.md refs to implement.
  - name: function_refs
    type: string
    required: false
    description:
      Per-tool function ref hint - "image-create:Client.images.generate,
      chat-completion:Client.chat.completions.create".
examples:
  - input:
      package_name: "openai"
      package_manager: "npm"
      tools: "./tools/image-create/TOOL.md, ./tools/chat-completion/TOOL.md"
      function_refs: "image-create:Client.images.generate,chat-completion:Client.chat.completions.create"
    output:
      - .providers/openai-sdk/PROVIDER.md
      - .providers/openai-sdk/SECRETS.md
---

# Author an SDK provider (AIP-33)

Use when wrapping an in-process SDK as a conformant provider for
AIP-14 TOOL contracts. SDKs are the right kind for self-hosted
models, first-party convenience wrappers, and performance-critical
paths where subprocess (CLI) or network (HTTP, MCP) latency is
unacceptable.

## Process

1. **Identity**: pick `id` ending in `-sdk`, set `name`,
   `description`, `version`, `kind: sdk`, `package`,
   `package_manager`.
2. **Install + version_check**: derive from `package_manager`:
   - `npm` / `pnpm` / `yarn` → `install.method` matches; `version_check`
     uses `node -e "console.log(require('PACKAGE/package.json').version)"`.
   - `pip` / `poetry` → `version_check` uses
     `python -c "import PACKAGE; print(PACKAGE.__version__)"`.
   - `cargo` → `version_check` uses `cargo pkgid PACKAGE`.
   - `go` → `version_check` uses `go list -m PACKAGE`.
   - `local` → vendored install, no version check (or
     workspace-relative `package.json` read).
3. **Identify auth pattern**:
   - **Env-var read at construction**: SDK reads a known env var
     (`OPENAI_API_KEY`); declare in `auth.state.env`.
   - **Constructor arg**: SDK takes `apiKey` in constructor; declare
     `auth.state.env` and rely on the runtime's secret-injection.
   - **No auth**: self-hosted models, offline tools — omit `auth`.
4. **Per-tool dispatch**: for each TOOL ref, author `metadata.sdk`:
   - `function_ref` (dotted: `default`, `createImage`,
     `images.create`, `Client.images.create`).
   - `args_template` only when contract input keys differ from SDK
     function args, OR when the function takes positional args
     (`_0`, `_1`, `_2`).
   - `result_extract` (JSONPath-lite) when the SDK return shape
     differs from the contract output.
   - `cost_override.cost_units_per_call` (millicents).
5. **Streaming** (when contract supports it): declare
   `streaming.mode: "async-iterator"` (or `"callback"`); per-tool
   override via `metadata.sdk.streaming`.
6. **Sandbox + region + policy**:
   - `network.egress` for SDKs that make HTTP calls under the hood
     (most LLM SDKs); `[]` for self-hosted offline.
   - `region` (US, EU, self-hosted, global).
   - `policy_tags` (third-party-llm, self-hosted, pii-safe,
     no-third-party).
7. **Validate** against `SDK.schema.json` AND `PROVIDER.schema.json`.
8. **Wire**: `loadProvider(...)`; the SDK runtime imports the
   package + resolves function refs at registration.

## Common mistakes

- **Forgetting `import_style` for non-default cases** — Python,
  Rust, Go SDKs need explicit declaration.
- **Constructor with secret in the manifest** — secrets MUST be
  resolved via `auth.state.env`, not hardcoded in `client_options`.
- **Wide `network.egress`** — even SDKs that "should be offline"
  often phone home for telemetry; verify via tcpdump and declare
  the actual hosts.
- **Module-load I/O** — some SDKs do work at import time (open
  files, register handlers); hosts SHOULD warn on unexpected I/O at
  registration.
- **Streaming generators not cancelled on abort** — hosts MUST
  honour `signal.abort()` and break the loop. Provider authors test
  this explicitly.
- **Missing `package_version`** — without it, the resolver can't
  enforce version compatibility; SDK upgrades silently break tools.
