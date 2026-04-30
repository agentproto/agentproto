---
schema: collection.schema/v1
name: emotional-bond
title: Emotional Bond
description: |
  Trust level, shared moments, and communication preferences
  between an AI persona and a user. The relationship layer.
  TEMPORAL — observations are tracked over time via temporal-entry
  companion items rather than as direct mutations on this layer.
  Ships in the identitykit-compagnon starter library;
  corresponds to the `emotional-bond` layer in the Simone
  reference implementation
  (packages/simone/src/domain/identity/layers.ts).
version: 1.0.0
# This collection is TEMPORAL: the workspace's
# layers.temporal.enabled MUST be true to use this collection,
# and the host MUST register a sibling temporal-entry collection
# linking back to items here via parentLayer.
temporal: true

fields:
  - name: trustLevel
    type: number
    description: |
      Trust level built over time, 0..1. The effective trust
      level is computed by walking active (non-expired)
      temporal-entry items and aggregating per host policy
      (typically the most-recent-active or weighted-by-intensity
      mean).
    minimum: 0
    maximum: 1
  - name: sharedMoments
    type: array
    description: |
      Significant exchanges that shaped the relationship. Each
      moment is a small object with a description, an optional
      date, and a significance score. Long history belongs in
      the wiki under the bearer's dossier; this field captures
      only the milestone exchanges.
    items:
      type: object
      properties:
        description: { type: string }
        date: { type: string }
        significance: { type: number, minimum: 0, maximum: 1 }
  - name: communicationPreferences
    type: object
    description: |
      How the user prefers to interact. Not a list of
      preferences from the user's mouth — these are observed /
      inferred preferences the persona adapts to.
    properties:
      prefersDirect: { type: boolean }
      emotionalDepth: { type: number, minimum: 0, maximum: 1 }
      humor: { type: boolean }
  - name: confidence
    type: number
    description: |
      RESERVED at AIP-23 workspace level. 0..1; 1.0 = configured;
      lower = inferred. Most emotional-bond items start with
      lower confidence (inferred from observation) and rise as
      observations accumulate.
    minimum: 0
    maximum: 1
  - name: bearer
    type: ref
    description: |
      The bearer entity (typically the persona or operator).
      The user the bond is *with* is encoded in the
      sharedMoments and communicationPreferences via host
      junction tables, not as a field here.

statuses:
  - { id: forming, label: Forming, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: forming

ownership:
  cardinality: single
  role: bearer
  required: true

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Emotional Bond

## Purpose

The `emotional-bond` layer captures the relationship between an AI persona and a
user — trust level, shared moments, communication preferences. It is the
canonical TEMPORAL layer: the bond's effective state at read time is computed by
walking active temporal-entry observations, not by reading the layer's
last-written values directly.

This collection is part of the **identitykit-compagnon** starter library. It is
a faithful translation of the Simone reference implementation's `emotional-bond`
layer (packages/simone/src/domain/identity/layers.ts) into the AIP-18 collection
form.

## Conventions

- A bearer has at most ONE emotional-bond per user (per the workspace's
  exclusivity rule plus host-side per-user junctioning).
- The layer carries an "anchor" snapshot — the values at the most recent
  reconciliation. The live truth is the temporal-entry stream.
- New observations land as **temporal-entry items** with
  `parentLayer = <emotional-bond-item-id>`, NOT as direct mutations on this
  layer. The reference implementation's identity-ingestion service writes
  temporal-entry items.
- Significance ratings on `sharedMoments` are 0..1; 0.5 is the neutral default
  for a moment without explicit weighting.

## Field guide

`trustLevel` is the headline field. It is a _cached_ value at the layer level;
the live value comes from walking the temporal-entry stream and applying the
host's aggregation rule (typically: most-recent-active intensity).

`sharedMoments` is a curated list — only milestone moments (first conversation,
first argument, first reconciliation) should land here. The bound wiki carries
the full history.

`communicationPreferences` is observed, not declared. The persona infers from
behaviour; the user does not author it.

## Temporal entries

A typical temporal-entry item:

```yaml
---
schema: collection.item/v1
collection: temporal-entry
id: TENT-bond-2026-04-15-trust-rise
parentLayer: BOND-acme-founder-with-jeremy
content:
  trustLevel: 0.85
  reason: handled disagreement with grace, acknowledged my point
observedAt: 2026-04-15T14:00:00Z
intensity: 0.9
validUntil: null # still active
source: observed
confidence: 0.8
---
```

The host's expiry walk on read filters out entries with `validUntil` in the
past; the surviving entries feed into trustLevel aggregation.

## Examples

```yaml
---
schema: collection.item/v1
collection: emotional-bond
id: BOND-simone-with-jeremy
title: Simone's bond with Jeremy
status: active
bearer: ws://personas/simone
trustLevel: 0.85
sharedMoments:
  - description: First conversation about the founder's mission
    date: 2026-01-10
    significance: 0.9
  - description: |
      Disagreed about a hire; Simone held a position, founder
      changed mind after reflection.
    date: 2026-03-05
    significance: 0.85
communicationPreferences:
  prefersDirect: true
  emotionalDepth: 0.7
  humor: true
confidence: 0.9
---
# Simone's bond with Jeremy

The companion's relationship anchor. trustLevel is cached 0.85 from the most
recent active observation. The full temporal-entry stream lives in
items/temporal-entry/ under parentLayer = BOND-simone-with-jeremy.
```

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23) — temporal-entry contract
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- The Simone reference implementation's
  [`emotional-bond` layer](https://github.com/agentik-net/agentik-studio/blob/main/packages/simone/src/domain/identity/layers.ts)
