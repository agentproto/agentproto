---
schema: skills/v1
name: author-mcp
title: Author an MCP provider (AIP-32)
description:
  Walk through authoring a kind:mcp PROVIDER.md — wraps a Model Context
  Protocol server (Anthropic-spec) as a conformant provider implementing
  one or more abstract TOOL contracts.
version: 1.0.0
tags: [aip-32, mcp, providers, authoring]
inputs:
  - name: server_kind
    type: string
    required: true
    description: One of "npm", "docker", "binary", "remote".
  - name: server_ref
    type: string
    required: true
    description:
      For npm/docker - the package or image; for binary - path; for remote - URL.
  - name: tools_to_wrap
    type: string
    required: false
    description:
      Comma-separated list of MCP-tool-name → contract-id pairs
      ("read_file:fs-read,write_file:fs-write"). If omitted, the skill
      lists tools via tools/list and prompts the user.
examples:
  - input:
      server_kind: "npm"
      server_ref: "@modelcontextprotocol/server-filesystem"
      tools_to_wrap: "read_file:fs-read,write_file:fs-write,list_directory:fs-list"
    output:
      - .providers/filesystem-mcp/PROVIDER.md
---

# Author an MCP provider (AIP-32)

Use when wrapping an MCP server (local or remote) as a conformant
provider for AIP-14 TOOL contracts. The skill produces a
frontmatter-only PROVIDER.md when standard MCP dispatch suffices.

## Process

1. **Identity**: pick `id` ending in `-mcp`, set `name`,
   `description`, `version`, `kind: mcp`.
2. **Server location**: declare `server` per `kind`:
   - `npm` — `package` + `args`
   - `docker` — `image` + `env` (with `${secrets.X}` substitutions)
   - `binary` — `path` + `args`
   - `remote` — `url`
3. **Transport**: `stdio` for local subprocess, `sse` for streaming
   remote, `http` for request-response remote.
4. **Connect once** (during authoring) and run `tools/list` to
   discover available MCP tool names.
5. **Map TOOLs**: for each contract-to-implement, pick the matching
   MCP tool name. Author `metadata.mcp.tool_name`,
   `argument_mapping` (when contract input keys differ from MCP arg
   names), `result_extract` (when MCP response wraps the contract
   output).
6. **Auth**: if the server needs secrets, declare in `auth.ref` →
   sibling SECRETS.md, with `auth.state.env` listing required env
   vars. For local servers, secrets are passed via `server.env`.
   For remote servers, auth is HTTP-style.
7. **Sandbox**: `network.egress` for remote, `[]` for local.
   `policy_tags` (self-hosted, third-party-api).
8. **Optional integration**: declare `prompts[]` for skill_block
   integration and `resources[]` for ref_kind integration.
9. **Validate** against `MCP.schema.json` AND `PROVIDER.schema.json`.
10. **Wire**: `loadProvider(...)`; the runtime spawns/connects on
    first call, lists tools, validates declared `tool_name`s exist.

## Common mistakes

- **Hardcoded paths in stdio servers** — vendored binaries are
  workspace-relative; document this in `server.path`.
- **Missing `tool_name` validation** — server-supplied schemas must
  match the contract; mismatches MUST fail at registration, not at
  first call.
- **Long-lived stdio process leaking tenant state** — pass tenant
  context in `tools/call.arguments`, never bind at spawn.
- **Remote MCP without TLS** — refuse `http://` URLs in production.
