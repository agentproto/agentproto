---
schema: collection.schema/v1
name: soul
title: Soul
description: |
  Core values, mission, and energy sources — what drives the
  bearer. The soul layer is the most stable layer in an identity;
  it changes rarely once configured. Ships in the
  identitykit-compagnon starter library; corresponds to the
  `soul` preset in the reference implementation
  (packages/core/src/domain/identity/presets/soul.ts).
version: 1.0.0
fields:
  - name: values
    type: array
    description: |
      Ordered value pairs [preferred, over]. e.g. [["innovation",
      "tradition"], ["impact", "money"]] expresses the bearer
      prefers innovation over tradition, impact over money.
    items:
      type: array
      items: { type: string }
  - name: mission
    type: string
    description: |
      One-paragraph mission statement. The bearer's purpose, in
      their own voice.
  - name: energySources
    type: array
    description: |
      Activities, contexts, or interactions that give the bearer
      energy and motivation.
    items: { type: string }
  - name: energyDrains
    type: array
    description: |
      Activities, contexts, or interactions that drain the
      bearer's energy.
    items: { type: string }
  - name: confidence
    type: number
    description: |
      RESERVED at AIP-23 workspace level. 0..1; 1.0 = configured
      by author; lower = inferred from observation. The host
      MUST validate this on every item write. AIP-23
      identity_layer_confidence_missing is HARD per-item.
    minimum: 0
    maximum: 1
  - name: bearer
    type: ref
    description: |
      The entity (operator / company / persona / user) the soul
      describes. The workspace's binding policy declares which
      bearer kinds are allowed; the AIP-23 ownership axis reads
      this through ownership.role=bearer.

statuses:
  - { id: draft, label: Draft, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: bearer
  required: true

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Soul

## Purpose

The `soul` layer captures values, mission, and energy sources — the most stable
parts of who the bearer is. Soul is what changes when a founder pivots, when a
clinical mentor reorients their practice, when an organisation re-founds itself.
It does NOT change with weekly mood, with a single conversation, with a project
completion.

This collection is part of the **identitykit-compagnon** starter library. It is
a faithful translation of the reference implementation's `soul` preset
(packages/core/src/domain/ identity/presets/soul.ts) into the AIP-18 collection
form. Workspaces extending this collection MAY add domain-specific fields
(`philosophicalLeaning`, `coreNarratives`, `originStories`) without forking
AIP-23.

## Conventions

- A bearer has at most ONE soul (per the workspace's exclusivity rule).
- `values` are pairs because trade-off pairs are richer than unordered lists —
  "innovation > tradition" carries more signal than "innovation, tradition" as
  separate values.
- `mission` is one paragraph at most. Longer narratives belong in the bound
  knowledge wiki ([AIP-10](/docs/aip-10)), not in the soul layer.
- `energySources` and `energyDrains` are arrays of short phrases, not
  paragraphs. The compression artifact pipeline packs them into a one-line
  summary at the `short` tier.

## Field guide

`values` is the signature field. The pair structure (`[preferred, over]`) maps
directly to the reference implementation's compression at the `short` tier
(`SOUL: innovation>tradition | impact>money`).

`bearer` is the ownership field. AIP-23 standardises on "bearer" at the
workspace level (the entity that _bears_ the identity); the per-collection
ownership name MAY differ but the convention is clear.

`confidence` is a workspace-level reserved field. Configured souls (manually
authored) MUST be `1.0`. Inferred souls (from the ingestion service) start lower
and are promoted only with audit.

## Examples

```yaml
---
schema: collection.item/v1
collection: soul
id: SOUL-acme-founder
title: Acme founder soul
status: active
bearer: ws://operators/founder
values:
  - [innovation, tradition]
  - [impact, money]
  - [autonomy, conformity]
mission: |
  Build the most useful AI products on the planet, by giving
  builders the highest leverage on every task.
energySources: [hard-problems, teaching, deep-work, founder-mode]
energyDrains: [bureaucracy, status-meetings, micromanagement]
confidence: 1.0
---
# Acme founder soul

The founder's soul. Configured at company founding; reviewed quarterly. Drives
the company's mission and the cultural operating norms surfaced in the bound
playbook.
```

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- The reference implementation's
  [`soul` preset](https://github.com/agentik-net/agentik-studio/blob/main/packages/core/src/domain/identity/presets/soul.ts)
