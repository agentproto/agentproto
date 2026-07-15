# ADAPTER.md — implementing AIP-35 (Storage) in a host runtime

This document is the implementer's guide for any runtime that wants to
**register, resolve, and sync** [AIP-35](/docs/aip-35) `storage/v1` backends.
It is normative for the parts marked MUST and informative for the parts marked
SHOULD.

AIP-35 covers **filesystem-backed workspaces** only. Sandbox-shaped backends
(e2b, modal, …) live in AIP-36 SANDBOX.md.

---

## What a storage backend is

A storage backend is a provider that:

1. **Stores** workspace files (the local filesystem is the runtime truth).
2. **Seeds** the local tree from a remote origin on workspace open (`pull`).
3. **Materialises** local writes back to the origin on commit/push (`push`).

The local filesystem is ALWAYS primary. The remote is a durable, visible,
version-controlled mirror — not the source of truth at runtime.

---

## Manifest shape

The STORAGE.md frontmatter is validated against
[`./STORAGE.schema.json`](./STORAGE.schema.json). Minimum required fields:

```yaml
---
schema: storage/v1           # standalone; absent when inlined
id: "@acme/main-workspace"   # standalone; absent when inlined
provider: github
config:
  repo: "acme-corp/agent-workspace"
  branch: "main"
auth:
  ref: "secrets/github.md"
sync:
  mode: pull-push
  pull:
    on: workspace-open
  commit:
    on: per-turn
    message_template: "agent: {{summary}}"
  push:
    on: per-conversation
    branch_policy: main
    pr_policy: none
---
```

### Provider kinds (day-1)

| `provider` | Description |
|---|---|
| `github` | GitHub repository (clone → edit → commit → push). |
| `cloud-bucket` | GCS / S3 / Azure Blob (object store mount). |
| `self-bucket` | Self-hosted object store compatible with S3 API. |
| `local-fs` | Local directory (no remote sync). |
| `dev-local` | Ephemeral local directory for development. |
| `mastra-s3` | Mastra-managed S3 backend. |
| `mastra-azure` | Mastra-managed Azure Blob backend. |

Hosts MAY register additional provider ids. The schema accepts any non-empty
string; host-side validation narrows the accepted set.

### Config shapes

Each provider has its own `config` block shape. The schema is open
(`Record<string, any>`) and host-side validation narrows it:

**github:**
```yaml
config:
  repo: "owner/repo"       # required
  branch: "main"           # default: main
  sparse_checkout: [...]   # optional: limit clone to these paths
```

**cloud-bucket / self-bucket:**
```yaml
config:
  bucket: "my-bucket"
  prefix: "workspaces/agent/"
  region: "eu-west-1"
```

**local-fs / dev-local:**
```yaml
config:
  path: "/var/agentproto/workspaces/main"
```

---

## Sync modes

The `sync.mode` field controls the lifecycle:

| Mode | Behaviour |
|---|---|
| `canonical` | Local filesystem is the ONLY truth; no remote sync. Use for `local-fs` / `dev-local`. |
| `pull-push` | Pull from remote on open; commit + push on lifecycle events. The standard mode. |
| `watch` | Continuous two-way sync (future; not day-1). |

### `pull-push` lifecycle

```
workspace-open
  → pull (clone or fetch from remote)
  → [runtime: agent reads/writes local files]
  → commit (batch local writes → a commit)
  → push (materialise the commit to the remote origin)
```

**Pull (`sync.pull.on`)** — AIP-37 event name that triggers a pull:
- `workspace-open` — seed the local tree on first access (standard).
- `manual` — never auto-pull; the caller drives it.
- `turn-start` — refresh before every agent turn (expensive, rare).

The host MUST NOT pull unless the local tree is clean (no uncommitted changes).
If the tree is dirty on `workspace-open`, the host SHOULD warn and skip the pull.

**Commit (`sync.commit.on`)** — AIP-37 event name that triggers a commit:
- `each-write` — commit after every file write (debounced by `batch_window_ms`).
- `per-turn` — commit at the end of every agent turn.
- `per-conversation` — commit at the end of a conversation session.
- `manual` — no auto-commit.

**Push (`sync.push.on`)** — AIP-37 event name that triggers a push to the remote:
- `per-commit` — push after every commit.
- `per-turn` — push at the end of every agent turn.
- `per-conversation` — push at the end of a conversation session.
- `manual` — no auto-push.

### Conflict policy (`sync.conflict.policy`)

| Policy | Behaviour |
|---|---|
| `rebase` | Rebase local commits on top of remote changes (default for github). |
| `merge` | Merge (three-way). |
| `abort` | Refuse if remote has diverged; surface `storage_conflict`. |
| `last-writer-wins` | Overwrite remote with local (destructive). |
| `split-conflicts` | Keep both versions with conflict markers. |
| `manual` | Surface conflicts to the operator for resolution. |

---

## Auth block

The `auth` block references an AIP-19 SECRETS.md (or future ENV.md) inventory:

```yaml
auth:
  ref: "secrets/github.md"
  state:
    env:
      - GITHUB_TOKEN
```

The host resolves the reference at workspace activation time and injects
credentials into the provider factory. Credentials MUST NOT be stored in the
manifest or in any log.

---

## Identity block (commit attribution)

The `identity` block is an AIP-23 identity reference — the commit author(s)
for syncing providers:

```yaml
identity:
  name: "Acme Agent"
  email: "agent@acme.com"
  role: "primary"
```

Multi-attribution (co-authors):

```yaml
identity:
  - name: "Acme Agent"
    email: "agent@acme.com"
    role: "primary"
  - ref: "operators/research-analyst"
    role: "co-author"
```

---

## AIP-43 runtime slots

The `StorageDefinition` (the host's in-memory representation) carries two
AIP-43 runtime slots that are host-opaque in the manifest but consumed by the
host factory:

```ts
interface StorageDefinition {
  // ... manifest fields ...
  factory?: StorageBackendFactory     // AIP-43: constructs the live backend
  capabilities?: Record<string, unknown>  // AIP-43: capability metadata namespace
}
```

`factory` is injected by the host when registering a provider kind. The manifest
never carries code. `capabilities` SHOULD use namespaced keys (e.g.
`"sync.supports_conflict_rebase": true`).

Resolution order for the backend identity: `id` → `provider` → implicit slug.

---

## WorkspaceSync — the imperative counterpart

A provider that backs a workspace with a remote origin implements
`WorkspaceSync`:

```ts
interface WorkspaceSync {
  /** Seed or refresh the local tree from the remote origin. */
  pull(opts: { cwd: string; ttlSeconds?: number }): Promise<PullResult>

  /** Batch local writes into a commit (idempotent when no changes). */
  commit(opts: { cwd: string; message: string; identity?: IdentityRef }): Promise<CommitResult>

  /** Materialise local commits to the remote origin. */
  push(opts: { cwd: string; branchPolicy?: BranchPolicy }): Promise<PushResult>
}

interface PullResult  { pulled: boolean; ref?: string }
interface CommitResult { committed: boolean; ref?: string }
interface PushResult  { pushed: boolean; ref?: string; prUrl?: string }
```

The `sync.mode: "pull-push"` contract is: `pull` on the configured trigger →
[runtime] → `commit` on the configured trigger → `push` on the configured
trigger.

Providers for `local-fs` / `dev-local` (mode: `canonical`) omit `push` and
`pull`; `commit` is a no-op or local-snapshot.

---

## Exclude patterns

The `exclude` field lists paths NOT mirrored to the backing store:

```yaml
exclude:
  - ".wiki/"
  - "_distill-index.yaml"
  - "node_modules/"
```

Glob-ish, prefix-matched. The host MUST NOT push excluded paths to the remote.

---

## `read_only` flag

When `read_only: true`, the host MUST reject write calls at the storage layer
with `storage_read_only`. Pulls are still allowed.

---

## Error codes

| Code | Meaning |
|---|---|
| `storage_provider_unknown` | `provider` value not registered in the host. |
| `storage_config_invalid` | Provider `config` shape invalid for this provider. |
| `storage_auth_unresolvable` | `auth.ref` does not resolve to a SECRETS.md. |
| `storage_pull_failed` | Pull from remote failed (network, auth, conflict). |
| `storage_commit_failed` | Local commit failed (e.g. nothing to commit is not an error). |
| `storage_push_failed` | Push to remote failed (network, auth, diverged). |
| `storage_conflict` | Remote has diverged and `conflict.policy: abort` is set. |
| `storage_read_only` | Write attempted on a `read_only: true` backend. |

---

## Conformance checklist

A conforming implementation MUST:

- [ ] Validate `STORAGE.md` frontmatter against `STORAGE.schema.json` on load.
- [ ] Treat the local filesystem as the runtime source of truth (never the remote).
- [ ] Resolve `auth.ref` at activation time, not at manifest load.
- [ ] Inject credentials into the provider factory; NEVER log them.
- [ ] Honour `exclude` patterns — never push listed paths to the remote.
- [ ] Honour `read_only: true` — reject writes at the storage layer.
- [ ] Emit AIP-37 lifecycle events (`workspace-open`, `turn-end`, etc.) to trigger
  pull/commit/push at the configured times.
- [ ] Apply `conflict.policy` on push; surface `storage_conflict` when `abort`.

---

## See also

- [AIP-35 — agentstorage/v1 spec](/docs/aip-35)
- [AIP-37 — lifecycle events](/docs/aip-37)
- [AIP-19 — secrets](/docs/aip-19)
- [AIP-23 — identity](/docs/aip-23)
- [AIP-36 — sandbox backends](/docs/aip-36)
- [`./STORAGE.schema.json`](./STORAGE.schema.json)
- [Reference impl: `@agentproto/storage` workspace-sync.ts]
