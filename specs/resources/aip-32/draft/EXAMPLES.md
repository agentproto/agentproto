# EXAMPLES.md — MCP provider patterns

Reference `PROVIDER.md` files for `kind: mcp`. Each wraps an existing
or imagined Model Context Protocol server.

## Patterns covered

1. [npm-distributed local MCP (filesystem)](#1-npm-distributed-local-mcp-filesystem)
2. [Docker-distributed local MCP with secrets (postgres)](#2-docker-distributed-local-mcp-with-secrets-postgres)
3. [Remote MCP over SSE (managed service)](#3-remote-mcp-over-sse-managed-service)
4. [GitHub MCP with OAuth](#4-github-mcp-with-oauth)

---

## 1. npm-distributed local MCP (filesystem)

Anthropic's reference filesystem server. stdio transport, no auth.

```md
---
name: Filesystem MCP
id: filesystem-mcp
description:
  Anthropic's reference filesystem MCP server. stdio. Read/write/list
  workspace files. Maps to fs-read, fs-write, fs-list contracts.
version: 1.0.0
kind: mcp
server:
  kind: npm
  package: "@modelcontextprotocol/server-filesystem"
  args: ["/workspace"]
transport: stdio
protocol_version: "2025-03"

install:
  - { method: npm, package: "@modelcontextprotocol/server-filesystem", global: false }
version_check:
  cmd: "npx @modelcontextprotocol/server-filesystem --version"
  parse: 'v(\S+)'
  range: ">=0.5"

network:
  egress: []
region: ["self-hosted"]
policy_tags: ["self-hosted", "pii-safe"]

implements:
  - tool: ./tools/fs-read/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: read_file
        argument_mapping: { path: path }
        result_extract: "$.contents"
  - tool: ./tools/fs-write/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: write_file
        argument_mapping: { path: path, content: content }
  - tool: ./tools/fs-list/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: list_directory
        argument_mapping: { path: path }
        result_extract: "$.entries"

resources:
  - uri_template: "file:///{path}"
    description: "Filesystem resources accessible via this MCP server."
    integrate_as: ref_kind
    ref_kind_id: mcp_filesystem

tags: [mcp, filesystem, anthropic-reference, pii-safe]
---
```

---

## 2. Docker-distributed local MCP with secrets (postgres)

Wraps a postgres MCP server in a Docker container. Stdio transport
between host and container.

```md
---
name: Postgres MCP
id: postgres-mcp
description:
  Postgres MCP server (containerised). Read-only SQL queries against
  the configured database.
version: 1.0.0
kind: mcp
server:
  kind: docker
  image: "modelcontextprotocol/server-postgres:latest"
  env:
    DATABASE_URL: "${secrets.POSTGRES_DATABASE_URL}"
transport: stdio

install:
  - { method: download, url: "docker://modelcontextprotocol/server-postgres:latest", extract_bin: "" }
version_check:
  cmd: "docker run --rm modelcontextprotocol/server-postgres:latest --version"
  parse: 'v(\S+)'
  range: ">=0.3"

auth:
  ref: ./SECRETS.md
  state: { env: ["POSTGRES_DATABASE_URL"] }
  expiry: { detect: "exception:ConnectionRefused" }

network:
  egress: []
region: ["self-hosted"]
policy_tags: ["self-hosted", "pii-safe"]

implements:
  - tool: ./tools/db-query/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: query
        argument_mapping: { sql: query }
        result_extract: "$.rows"
  - tool: ./tools/db-schema/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: list_tables
        result_extract: "$.tables"

tags: [mcp, postgres, database]
---
```

---

## 3. Remote MCP over SSE (managed service)

Remote-hosted MCP server reachable via SSE. No spawn, no install.

```md
---
name: Acme remote MCP (SSE)
id: acme-remote-mcp
description:
  Managed remote MCP server hosted by Acme. SSE transport over HTTPS.
  Provides search and document tools.
version: 1.0.0
kind: mcp
server:
  kind: remote
  url: "https://mcp.acme.com/v1"
transport: sse
protocol_version: "2025-03"

auth:
  ref: ./SECRETS.md
  state: { env: ["ACME_API_KEY"] }
  expiry: { detect: "http_status:401" }

network:
  egress: ["mcp.acme.com"]
region: ["us-east-1"]
policy_tags: ["third-party-api", "us-data-residency"]

implements:
  - tool: ./tools/search/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.5 }
    metadata:
      mcp:
        tool_name: search
        argument_mapping: { query: q, limit: limit }
  - tool: ./tools/document-fetch/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 1 }
    metadata:
      mcp:
        tool_name: fetch_document
        argument_mapping: { id: doc_id }
        result_extract: "$.content"

connection_options:
  timeout_ms: 30000
  max_retries: 3
  keepalive: true

tags: [mcp, remote, sse]
---
```

---

## 4. GitHub MCP with OAuth

GitHub's official MCP server with OAuth-bearer auth. Stdio (run via
npx) but auth is OAuth flow.

```md
---
name: GitHub MCP
id: github-mcp
description:
  GitHub MCP server. Wraps GitHub REST API as MCP tools. OAuth-bearer
  auth, stdio transport.
version: 1.0.0
kind: mcp
server:
  kind: npm
  package: "@modelcontextprotocol/server-github"
  env:
    GITHUB_PERSONAL_ACCESS_TOKEN: "${secrets.GITHUB_OAUTH_ACCESS_TOKEN}"
transport: stdio
protocol_version: "2025-03"

install:
  - { method: npm, package: "@modelcontextprotocol/server-github", global: false }
version_check:
  cmd: "npx @modelcontextprotocol/server-github --version"
  parse: 'v(\S+)'
  range: ">=0.5"

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
    cmd: ""               # custom; see provider.ts
    every: "PT1H"
  expiry:
    detect: "http_status:401"

network:
  egress: ["api.github.com", "github.com"]
region: ["global"]
policy_tags: ["third-party-api"]

implements:
  - tool: ./tools/gh-pr-list/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: list_pull_requests
        argument_mapping: { owner: owner, repo: repo, state: state }
  - tool: ./tools/gh-issue-create/TOOL.md
    version: "^1.0.0"
    metadata:
      mcp:
        tool_name: create_issue
        argument_mapping: { owner: owner, repo: repo, title: title, body: body }

tags: [mcp, github, oauth]
---
```
