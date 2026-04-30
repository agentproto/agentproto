# EXAMPLES.md — SECRETS.md reference patterns

Reference `SECRETS.md` files exemplifying common patterns. Each example is a
self-contained inventory a host could load as-is. Authors should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Single opaque API key](#1-single-opaque-api-key)
2. [Multiple slugs in one inventory](#2-multiple-slugs-in-one-inventory)
3. [OAuth-token slug (kind: oauth)](#3-oauth-token-slug-kind-oauth)
4. [Tool-scoped auto-bind](#4-tool-scoped-auto-bind)
5. [Capability-URN access (AIP-18)](#5-capability-urn-access-aip-18)
6. [PII classification + retention](#6-pii-classification--retention)
7. [Slug with multi-env binding](#7-slug-with-multi-env-binding)

---

## 1. Single opaque API key

The simplest entry — one third-party API key, role-based access.

```md
---
secrets:
  - slug: stripe-api-key
    name: Stripe API Key (live)
    description:
      Used by the billing workflow to charge customers and issue refunds. Live
      key — DO NOT use in dev environments.
    kind: opaque
    access:
      reveal:
        - role: billing-admin
      bind:
        - tool: stripe-charge
        - tool: stripe-refund
    audit:
      retention: 7y
      pii: false
      classification: [confidential]
    tags: [finance, prod, stripe]
---

## Overview

The live Stripe API key for the production account. Bound to `stripe-charge` and
`stripe-refund` tools so they can run in sandbox without manual reveal; humans
need `billing-admin` to inspect.
```

---

## 2. Multiple slugs in one inventory

A workspace with several services. One file, multiple slugs — hosts merge
entries.

```md
---
secrets:
  - slug: stripe-api-key
    name: Stripe API Key
    description: Production charging.
    access:
      bind:
        - tool: stripe-charge

  - slug: openai-api-key
    name: OpenAI API Key
    description:
      Used by content-generation tools that call gpt-* models directly.
    access:
      bind:
        - tool: gpt-completion
        - workflow: content-generator

  - slug: brevo-api-key
    name: Brevo Email API Key
    description: Transactional email sender.
    access:
      bind:
        - tool: send-email-brevo
---
```

---

## 3. OAuth-token slug (kind: oauth)

OAuth tokens have a structured shape — `kind: oauth` declares the envelope so
hosts can refresh on expiry without the manifest re-declaring fields.

```md
---
secrets:
  - slug: hubspot-oauth-token
    name: HubSpot OAuth Token
    description:
      User-delegated OAuth token for the marketing team's HubSpot workspace.
      Refresh handled by the host's oauth driver.
    kind: oauth
    access:
      reveal:
        - role: marketing-admin
      bind:
        - tool: hubspot-contact-lookup
        - tool: hubspot-contact-update
        - workflow: lead-triage
    audit:
      retention: 30d # tokens rotate often; long retention is noise
      pii: false
    tags: [crm, hubspot, oauth]
---

## Overview

The HubSpot OAuth token's plaintext is
`{ accessToken, refreshToken, expiresAt }`. Bodies receive the access token via
`runtime.env: [HUBSPOT_OAUTH_TOKEN]` — the host substitutes the access portion,
refreshing transparently when expired. Bodies that need the refresh token
explicitly use the `secretsRegistry.get("hubspot-oauth-token").reveal(ctx)` API.
```

---

## 4. Tool-scoped auto-bind

A tool that runs at every workflow step needs its credentials auto-bound but
never human-revealed (no manual access; the host binds at spawn time).

```md
---
secrets:
  - slug: internal-llm-router-key
    name: Internal LLM Router Key
    description:
      Signs requests to the internal model router. NEVER human-revealable;
      auto-bound to LLM tools only.
    access:
      reveal: [] # no humans can reveal
      bind:
        - tool: llm-completion
        - tool: llm-embeddings
        - workflow: agent-orchestrator
    audit:
      retention: 30d
      pii: false
      classification: [internal]
    tags: [internal, infra]
---
```

---

## 5. Capability-URN access (AIP-18)

Granting access via the capability URN scheme — useful when access is governed
by a policy that issues capability tokens dynamically (e.g. per-incident
emergency access).

```md
---
secrets:
  - slug: prod-database-readonly
    name: Production Database (Read-Only)
    description:
      Read-only Postgres credentials for the production replica. Used for
      incident response queries.
    access:
      reveal:
        - cap: cap://incident/respond/active
        - role: db-admin
      bind:
        - workflow: incident-runbook
    audit:
      retention: 7y
      pii: true # query results may contain PII
      classification: [restricted]
    tags: [prod, database, incident]
---
```

---

## 6. PII classification + retention

A secret whose value is itself PII — encryption key for customer data export.
Stricter audit retention + classification.

```md
---
secrets:
  - slug: customer-export-encryption-key
    name: Customer Data Export Encryption Key
    description:
      Wraps the symmetric key used to encrypt customer-data exports at rest.
      Rotated every 90 days; revealed only by the export workflow.
    access:
      reveal:
        - role: data-protection-officer
      bind:
        - workflow: customer-data-export
    audit:
      retention: 7y
      pii: true # the key itself is treated as PII for audit purposes
      classification: [restricted, gdpr-relevant]
    tags: [data-protection, gdpr, encryption]
---
```

---

## 7. Slug with multi-env binding

One slug, multiple env-var names — a service that historically expected two
different env names but resolves to the same secret.

```md
---
secrets:
  - slug: postgres-connection-url
    name: Postgres Connection URL
    description:
      Primary database connection string. Bound to both DATABASE_URL and
      POSTGRES_URL for legacy compatibility with older tools.
    access:
      bind:
        - tool: db-query
        - tool: legacy-migration-runner
    metadata:
      bindings:
        env: [DATABASE_URL, POSTGRES_URL] # both env names resolve to this slug
    audit:
      retention: 90d
      pii: true
      classification: [internal, restricted]
    tags: [database, infrastructure]
---
```

---

## Anti-patterns to avoid

- **`value:` field.** Hard-rejected by the schema. Plaintext lives in the vault,
  never the manifest. Even base64-encoded values are rejected.
- **`backend:` URI without reviewer sign-off.** Reveals infrastructure topology
  to anyone who can read the workspace. Default to omitting; let the host driver
  resolve.
- **`access.reveal: []` AND `access.bind: []`.** A slug nobody can reach is dead
  inventory. Either declare an access path or remove the entry.
- **Duplicate slugs across inventory files.** Hosts MUST reject; pick canonical
  names per service.
- **`audit.retention` shorter than legal/regulatory minimum.** PII-related
  secrets in regulated domains have minimum retention requirements. Set to the
  maximum of the spec floor and the regulatory floor.
- **`pii: false` for a value that decrypts to PII.** Audit logs inherit the
  classification; a misclassified slug leaks PII into audit-log retention
  policies that aren't built for it.

## See also

- [AIP-19 — SECRETS.md spec](/docs/aip-19)
- [AIP-17 — RUNTIME.md](/docs/aip-17) — env binding
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./SKILL.md`](./skills/author-secrets/SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./SECRETS.schema.json`](./SECRETS.schema.json) — manifest validator
