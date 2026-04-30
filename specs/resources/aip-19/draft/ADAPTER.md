# ADAPTER.md — implementer's guide for AIP-19 (SECRETS.md)

This guide walks an implementer through wiring AIP-19's `SECRETS.md` manifest,
the `defineSecret` standard signature, and the reveal lifecycle into a host. The
AIP is the contract; this doc is the projection.

A host that already has a "secret store" or vault integration has 80% of the
machinery; this guide names the contract so the remaining 20% lines up with the
spec.

## Contract overview

A conforming host MUST:

1. Parse `SECRETS.md` files from the workspace's `.secrets/` tree.
2. Expose `defineSecret(...)` returning a `SecretHandle` per declared slug.
3. Run an access check via `handle.checkAccess(op, ctx)` BEFORE issuing any
   vault request.
4. Resolve slugs against a real vault driver at reveal time.
5. Inject revealed values into destinations per [Bindings](#bindings) without
   writing plaintext to disk, log, or shared store.
6. Emit an [AIP-7](/docs/aip-7) audit record on every reveal + denied access
   check.
7. Reject manifests containing forbidden value fields (`value`, `plaintext`,
   `ciphertext`, `secret`, `data`, `key`, `token`).

## `defineSecret` — required behaviour

```ts
defineSecret(definition: SecretDefinition): SecretHandle
```

The function is a **schema canonicaliser + access-check helper**. It MUST:

1. Validate `slug` against the pattern
   `^([a-z][a-z0-9-]*[a-z0-9]/)?[a-z][a-z0-9-]*[a-z0-9]$`.
2. Default missing fields:
   - `kind` → `"opaque"`
   - `access` → `{ reveal: [], bind: [], rotate: [] }`
   - `audit` → host defaults
3. Parse the `<namespace>/` prefix from the slug into `handle.namespace`.
4. Return a closure-bound `checkAccess(op, ctx)` that walks `access[op]` and
   returns the first matching entry.
5. Return a `reveal(ctx)` that delegates to the host's vault driver AFTER
   `checkAccess` returns granted.

```ts
function defineSecret(def) {
  validateSlug(def.slug)
  const { namespace, name } = parseSlug(def.slug)
  const access = {
    reveal: def.access?.reveal ?? [],
    bind: def.access?.bind ?? [],
    rotate: def.access?.rotate ?? [],
  }
  const audit = { ...HOST_DEFAULT_AUDIT, ...def.audit }

  return {
    slug: def.slug,
    namespace,
    kind: def.kind ?? "opaque",
    access,
    audit,
    checkAccess(op, ctx) {
      for (const entry of access[op] ?? []) {
        if (matchesEntry(entry, ctx)) {
          return { granted: true, granted_by: entry }
        }
      }
      return { granted: false, reason: `no entry under access.${op} matched` }
    },
    async reveal(ctx) {
      const check = this.checkAccess("reveal", ctx)
      emitAccessAudit("secret.reveal", def.slug, ctx, check)
      if (!check.granted) throw new SecretAccessDenied(def.slug, check.reason)
      const value = await hostVaultDriver.fetch(def.slug, def.backend)
      return value
    },
  }
}
```

### Access matching

`matchesEntry(entry, ctx)` walks the entry kinds:

| Entry                  | Match condition                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `{ role: "X" }`        | `ctx.actor.roles.includes("X")`                                                        |
| `{ userId: "u_123" }`  | `ctx.actor.userId === "u_123"`                                                         |
| `{ cap: "cap://..." }` | `ctx.capabilities.some(c => capabilityMatches(c, entry.cap))` ([AIP-18](/docs/aip-18)) |
| `{ tool: "X" }`        | `ctx.invokingTool === "X"`                                                             |
| `{ workflow: "X" }`    | `ctx.invokingWorkflow === "X"`                                                         |

Any one match is sufficient (OR semantics). Hosts MUST NOT require all entries
to match (no AND semantics in v1).

Hosts that don't recognise an entry kind MUST skip it silently
(forward-compatibility). Don't fail.

## Reveal lifecycle — host responsibilities

For each reveal request:

### 1. Map source to slug

Two common entry points:

**Via `runtime.env`** ([AIP-17](/docs/aip-17)):

```ts
// `STRIPE_API_KEY` → `stripe-api-key`
function envNameToSlug(envName) {
  return envName.toLowerCase().replace(/_/g, "-")
}
```

The convention is overridable via the slug's `metadata.bindings.env` array,
which lists alternate env-var names that bind to the same slug.

**Via direct call** (host APIs, MCP server endpoints):

```ts
const handle = secretsRegistry.get(slug)
const value = await handle.reveal(ctx)
```

### 2. Resolve access op

| Source                                                       | `op`     |
| ------------------------------------------------------------ | -------- |
| `runtime.env` injection at sandbox spawn                     | `bind`   |
| Explicit `secretsRegistry.get(slug).reveal(ctx)` from a body | `reveal` |
| Future rotation workflow                                     | `rotate` |

`bind` is the typed shorthand for "auto-reveal when this body spawns." It
implies `reveal` for the bound process scope only.

### 3. Run access check

```ts
const check = handle.checkAccess(op, ctx)
if (!check.granted) {
  emitDeniedAudit(handle.slug, ctx, check.reason)
  throw new SecretAccessDenied(handle.slug, check.reason)
}
```

The audit record on denial is required — failed access attempts are themselves
auditable events.

### 4. Fetch from vault

Hosts implement a vault driver per backend:

```ts
interface VaultDriver {
  fetch(slug: string, backend?: string): Promise<unknown>
  // future: rotate(slug, newValue): Promise<void>
}
```

Reference drivers:

| Backend             | Implementation                                            |
| ------------------- | --------------------------------------------------------- |
| GCP Secret Manager  | `vault://gcp-secret-manager/projects/<id>/secrets/<slug>` |
| HashiCorp Vault     | `vault://hashicorp/<engine>/<path>`                       |
| AWS Secrets Manager | `vault://aws-secrets-manager/<region>/<arn>`              |
| DB-encrypted        | `vault://db/<table>/<row-id>` (host-internal)             |

When `backend` is omitted (recommended), the host's driver picks the default
backend by slug convention.

### 5. Inject into destination

| Binding kind       | Destination                      | Mechanism            |
| ------------------ | -------------------------------- | -------------------- |
| `env`              | sandbox subprocess `process.env` | spawn-time env merge |
| (future) `header`  | outbound HTTP request            | request interceptor  |
| (future) `context` | request-context placeholder      | host-API             |

For env binding, the spawn config (per AIP-17) gets the resolved allowlist:

```ts
const sandboxEnv = {
  ...SAFE_BASE_ENV,
  ...await resolveEnvAllowlist(ctx, manifest.runtime.env),  // each name → slug → reveal
}
spawn(node, args, { env: sandboxEnv, ... })
```

### 6. Emit audit record

Per [AIP-7](/docs/aip-7):

```
secret.reveal {
  slug:        stripe-api-key
  actor:       { userId, roles, agentId }
  purpose:     "tool=stripe-charge run=<runId>"
  context:     { tool, workflow, run, agent }
  granted_by:  { tool: "stripe-charge" }   // matching entry from access.bind
  timestamp:   2026-04-29T12:34:56Z
  retention:   "7y"
  pii:         false
  classification: ["confidential"]
}
```

Plaintext value MUST NOT appear in the audit record.

### 7. Cleanup

The plaintext lives in the destination process's address space ONLY. The host:

- MUST NOT cache the value across runs.
- MUST NOT log it.
- MUST NOT write it to a temp file.
- MUST NOT pass it via a shared queue or pubsub topic.

If a future binding (header, context) requires intermediate persistence (e.g. to
relay to a separate worker), that worker MUST itself be sandbox-isolated and the
persistence MUST be encrypted- at-rest with key access denied to operators.

## Forbidden manifest fields

The schema's `not` clause rejects these top-level fields in any secret entry:

- `value`
- `plaintext`
- `ciphertext`
- `secret`
- `data`
- `key`
- `token`

A manifest containing any of them MUST be rejected at parse time with a clear
error naming the offending field. The reason is defensive: even if a host today
is careful, a future host or a co-edited file MUST NOT inadvertently store a
value.

## Multi-language hosts

| Language                | Function name             | Vault driver examples                        |
| ----------------------- | ------------------------- | -------------------------------------------- |
| TypeScript / JavaScript | `defineSecret`            | `@google-cloud/secret-manager`, `node-vault` |
| Python                  | `define_secret`           | `google-cloud-secret-manager`, `hvac`        |
| Go                      | `DefineSecret`            | GCP / Vault SDKs                             |
| Rust                    | `define_secret` (free fn) | GCP / Vault SDKs                             |

The reveal lifecycle is language-agnostic; only the vault driver + spawn-time
env merge vary.

## Registration test

A conforming host SHOULD provide a `validateSecrets(manifestPath)` helper that:

1. Parses each `SECRETS.md` under `.secrets/`.
2. Validates against `SECRETS.schema.json` — REJECTS forbidden value fields.
3. Confirms slug uniqueness across the merged inventory.
4. Confirms each `access[op]` entry kind is one the host recognises (warn, don't
   fail, on unknown kinds).
5. Confirms the host has a vault driver for each declared `backend` URI scheme.
6. Reports the first failure with file + slug + field path.

## What this guide does NOT cover

- The host's vault driver implementation per backend.
- Rotation orchestration (out of scope for v1).
- Cross-tenant secret sharing (out of scope for v1).
- The body's protection against intentionally exfiltrating a revealed value —
  that's [AIP-17](/docs/aip-17)'s sandbox.

## See also

- [AIP-19 — SECRETS.md spec](/docs/aip-19)
- [AIP-17 — RUNTIME.md](/docs/aip-17) — primary consumer (env binding)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./SECRETS.schema.json`](./SECRETS.schema.json) — schema validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference inventories
- [`./skills/author-secrets/SKILL.md`](./skills/author-secrets/SKILL.md) —
  agent-side authoring skill
