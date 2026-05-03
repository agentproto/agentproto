---
schema: action/v1
id: secrets:reveal
version: 1.0.0
description: "Reveal a single secret value to a process. Audited per AIP-19 reveal contract — every reveal records actor, slug, purpose, run id."
category: secrets
verb: reveal
target_kind: secrets
mutates: []
risk_level: 1
approval: on-mutate
fires_events: ["secret-revealed"]
requires:
  secrets: []
tags: [secrets, vault, credentials]
examples:
  - name: Tool needs API key
    scenario: "Tool calls `reveal('STRIPE_API_KEY', purpose='charge-customer')`. Vault returns plaintext; audit log records the reveal."
---

## Description

Use to obtain the plaintext value of a secret slug. Implementors
MUST honour AIP-19 `access` block on the SECRETS.md (which slugs
this principal MAY reveal). The plaintext returned is process-local
— never logged, written to disk, or persisted.

## Side effects

`mutates: []` — secrets:reveal is a read on the vault, not a write.
The audit log entry is a side effect of governance, not of the action.

## Approval rationale

`approval: on-mutate` — reveals warrant review. Per-slug grants in
SECRETS.md.access (or POLICY.md) define which principals may reveal
which slugs.
