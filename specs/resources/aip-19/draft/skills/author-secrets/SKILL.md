---
schema: skills/v1
name: author-secrets
title: Author a SECRETS.md (AIP-19)
description:
  Walk through authoring a SECRETS.md inventory — slugs, access grants, audit
  metadata — for a workspace whose tools and workflows need third-party
  credentials. Values stay in the vault; the manifest is metadata only.
version: 1.0.0
tags: [aip-19, secrets, vault, authoring, manifest, agentproto]
inputs:
  - name: services
    type: string
    required: true
    description:
      Comma-separated list of services that need credentials (e.g. "stripe,
      openai, hubspot"). The skill produces one slug per service plus the
      bindings.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new file under `.secrets/SECRETS.md`.
examples:
  - input:
      services: stripe, openai
    output:
      - .secrets/SECRETS.md (with two slugs)
---

# Author a SECRETS.md (AIP-19)

Use this skill when the user asks to **declare, inventory, or register secrets**
their workspace's tools and workflows need. The skill produces a valid
[AIP-19 SECRETS.md](/docs/aip-19) inventory listing slugs, their purpose, who
can reveal them, and audit metadata.

The manifest **never contains values** — those stay in a real vault (GCP Secret
Manager / HashiCorp Vault / etc.) the host already integrates with. This skill
produces the metadata + access policy only.

## When to use

- "Add a Stripe API key to our workspace."
- "We need to give the marketing workflow access to HubSpot — set up the
  secret."
- "Inventory all the credentials our agents use."

## When NOT to use

- The user pastes a plaintext value and asks you to "save the secret" — STOP.
  Tell them values go in the vault directly (host CLI / dashboard); the manifest
  only references the slug after the value is stored. Never accept a plaintext
  value into a manifest.
- The user wants to ROTATE a secret — out of scope for v1. Direct them to the
  host's vault rotation workflow.
- The user wants to share a secret across tenants — out of scope for v1.
- The credential is single-use (one-time signed URL, short-lived pre-signed
  token) — those don't fit the slug model. Use the host's request-time issuance
  API instead.

## Process

### 1. Collect the inputs (without the value)

For each secret the user names, gather:

- **Service name** — Stripe, OpenAI, HubSpot, etc.
- **Purpose** — what business / agent function does it unlock?
- **Who needs to reveal it manually** — which roles or specific users (often
  empty: most secrets only need bind, not reveal).
- **Which tools / workflows auto-bind it** — these run in sandbox and need the
  value injected via `runtime.env`.
- **PII classification** — does the value itself or its uses touch customer PII?
- **Retention floor** — regulatory / business minimum for audit retention.

NEVER ask for or accept the value. If the user offers it, redirect: "The value
goes into the vault directly via the host's secret-add flow. Once stored, give
me the slug name you used."

### 2. Pick the slug

Convention: lowercase service name + descriptive suffix, dash- separated.

| Want                | Slug                                              |
| ------------------- | ------------------------------------------------- |
| Stripe live API key | `stripe-api-key`                                  |
| Stripe test API key | `stripe-test-api-key`                             |
| HubSpot OAuth token | `hubspot-oauth-token`                             |
| Internal-only key   | `internal/<service>-<purpose>` (namespace prefix) |

Avoid:

- Environment names in the slug (`stripe-prod-key` — split env separation in
  vault, not slug). Use distinct slugs per env if needed.
- Versioning in the slug (`stripe-api-key-v2`). The slug is a stable identity; a
  new key under the same purpose keeps the slug.
- Trailing dashes, double dashes, leading digits.

### 3. Pick the kind

| Value shape                                | `kind`                    |
| ------------------------------------------ | ------------------------- |
| Single string (most API keys)              | `opaque` (default — omit) |
| `{ accessToken, refreshToken, expiresAt }` | `oauth`                   |
| `{ public, private }`                      | `keypair`                 |
| Anything structured                        | `json`                    |

Most slugs are `opaque`. Only set `kind` when the host needs to know about the
structured envelope (e.g. for OAuth refresh).

### 4. Write the access block

```yaml
access:
  reveal: # who can manually fetch the value (humans, debug)
    - role: <role-name>
    - userId: <user-id> # specific person — narrow grant
  bind: # what runs auto-receive the value at spawn
    - tool: <tool-id>
    - workflow: <workflow-id>
```

Defaults:

- **API keys for tools** — `bind:` only. No human reveal needed unless
  debugging.
- **OAuth tokens** — `reveal:` for the role that owns the integration; `bind:`
  for tools using it.
- **Sensitive prod credentials** — narrow `reveal:` (single role or specific
  userId), broad `bind:` (the workflow that uses it).
- **Incident-response credentials** — `cap: cap://incident/respond/active`
  ([AIP-18](/docs/aip-18)) so the access works only when an incident is open.

If neither `reveal` nor `bind` lists anything, the slug is unreachable — the
schema rejects it.

### 5. Write the audit block

```yaml
audit:
  retention: 7y # ISO-ish duration: y/m/d/h or P7Y
  pii: false # is the value itself PII?
  classification: # optional, host-defined
    - confidential
```

| If…                                         | Set…                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Value is encryption key for customer PII    | `pii: true`, `classification: [restricted]`                                         |
| Value is API key for production third-party | `pii: false`, `classification: [confidential]`                                      |
| Value is dev / sandbox credential           | `pii: false`, `classification: [internal]`                                          |
| Subject to GDPR / HIPAA                     | Add the regulatory tag to `classification:` and bump retention to the legal minimum |

Default retention if you can't research it: `7y` for prod credentials, `90d` for
dev. Don't default low.

### 6. Write `description`

One paragraph addressed to the **human reviewer who decides who gets access**.
Tell them:

- What service this unlocks.
- What environment (live / test / staging / dev).
- Anything unusual about access (NEVER human-reveal, refresh managed by oauth
  driver, etc.).

Bad: "Stripe API key." Good: "Used by the billing workflow to charge customers
and issue refunds. Live key — DO NOT use in dev environments."

### 7. Don't write `backend:`

Default to omitting the `backend:` URI. The host's driver maps slug → vault path
by convention; an explicit URI exposes infra topology and adds reviewer
overhead.

Set `backend:` only when:

- The slug lives in a non-default vault (cross-region, secondary provider,
  isolated tenant).
- An auditor specifically requested explicit backend pointers in the manifest.

When you DO set it, flag it for reviewer attention in the description: "Note:
explicit backend pointer — reviewer sign-off required."

### 8. Write the body

Optional but recommended sections:

```md
## Overview

<Why these secrets exist, what services they unlock.>

## Access policy summary

| Slug           | Reveal              | Bind                |
| -------------- | ------------------- | ------------------- |
| stripe-api-key | role: billing-admin | tool: stripe-charge |

## Procurement

<How to add a new entry — link to the runbook.>
```

### 9. Save the file

- Single inventory: `.secrets/SECRETS.md`.
- Multi-service workspace: `.secrets/<service>/SECRETS.md`. Hosts merge.

If the file exists and has unrelated entries, ADD your new entries to the
existing `secrets:` array — don't create a duplicate file.

### 10. Validate

Once authored:

1. Run the manifest through `SECRETS.schema.json` (the host's `validateSecrets`
   helper does this automatically).
2. Confirm slug uniqueness across the merged inventory.
3. Spot-check `pii:` and `classification:` against the actual value shape.
4. Ask the user to add the value to the vault via the host's secret-add flow —
   your job ends with the manifest.

## Output

A `.secrets/SECRETS.md` (or appended to existing) with:

1. One `secrets:` entry per credential, complete with `slug`, `name`,
   `description`, `access`, `audit`.
2. NO `value:`, `plaintext:`, `ciphertext:`, `secret:`, `data:`, `key:`, or
   `token:` fields anywhere.
3. Default `kind: opaque` for typical API keys; explicit `kind: oauth` for OAuth
   tokens.
4. `backend:` omitted unless explicitly required (and flagged in description).
5. Audit retention set per regulatory + business floor.
6. Body section explaining the inventory's purpose.

The user then adds the actual values to the vault separately — that's outside
this skill's scope.

## See also

- [AIP-19 — SECRETS.md spec](/docs/aip-19)
- [AIP-17 — RUNTIME.md](/docs/aip-17) — `runtime.env` consumes slugs
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`../EXAMPLES.md`](../../EXAMPLES.md) — reference inventories to copy from
- [`../SECRETS.schema.json`](../../SECRETS.schema.json) — manifest validator
- [`../ADAPTER.md`](../../ADAPTER.md) — implementer's guide
