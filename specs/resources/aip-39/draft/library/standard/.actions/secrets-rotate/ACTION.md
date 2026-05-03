---
schema: action/v1
id: secrets:rotate
version: 1.0.0
description: "Rotate a secret value — generate new credentials, update upstream provider, archive the old value. Implementor talks to the upstream service (Stripe API, GitHub PAT generator, etc.)."
category: secrets
verb: rotate
target_kind: secrets
mutates: ["external:*", "database:secrets"]
risk_level: 3
approval: always
fires_events: ["secret-rotated"]
requires:
  network: ["*"]
tags: [secrets, vault, rotation, irreversible]
examples:
  - name: Quarterly Stripe key rotation
    scenario: "Operator triggers rotation of STRIPE_API_KEY. Tool generates new key via Stripe API, stores in vault, marks old key as superseded."
---

## Description

Use to rotate a secret. Implementors are upstream-specific (one TOOL
per provider — Stripe, GitHub PAT, AWS IAM, etc.).

## Side effects

`mutates: external:* + database:secrets` — calls the upstream
provider AND updates the local vault. Bricks any consumer pinned
to the old value until they re-fetch.

## Approval rationale

`approval: always` — rotations affect every consumer of the secret.
ALWAYS prompt; never auto-rotate without explicit operator action.
