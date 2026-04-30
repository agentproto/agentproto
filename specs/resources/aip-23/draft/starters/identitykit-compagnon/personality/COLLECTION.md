---
schema: collection.schema/v1
name: personality
title: Personality
description: |
  Big-Five-flavored personality traits, communication style,
  strengths and weaknesses, background. Captures the
  surface-observable layer of who the bearer is — how they show
  up in conversation, what they're known for. Ships in the
  identitykit-compagnon starter library; corresponds to the
  `personality` layer in the Guilde reference implementation
  (packages/guilde/src/domain/identity/layers.ts).
version: 1.0.0
fields:
  - name: traits
    type: object
    description: |
      Trait band scores in 0..10. Five canonical traits drawn
      from the reference implementation: creativity, analytical,
      warmth, precision, proactivity. Workspaces extending this
      collection MAY add domain-specific traits (curiosity,
      assertiveness, agreeableness) by extending the trait
      object.
    properties:
      creativity: { type: number, minimum: 0, maximum: 10 }
      analytical: { type: number, minimum: 0, maximum: 10 }
      warmth: { type: number, minimum: 0, maximum: 10 }
      precision: { type: number, minimum: 0, maximum: 10 }
      proactivity: { type: number, minimum: 0, maximum: 10 }
  - name: communicationStyle
    type: object
    description: |
      Communication style descriptors — short qualitative
      strings, not enums. Designed to be readable in compression
      artifacts.
    properties:
      tone: { type: string }
      formality: { type: string }
      verbosity: { type: string }
      humor: { type: string }
  - name: strengths
    type: array
    description: Strengths the bearer is known for.
    items: { type: string }
  - name: weaknesses
    type: array
    description: |
      Known weaknesses. The bearer is honest about these; this
      is a feature of the layer, not a flaw.
    items: { type: string }
  - name: petPeeves
    type: array
    description: |
      Things that visibly irritate the bearer. Useful for
      compression — petPeeves are diagnostic signals others can
      read about the bearer.
    items: { type: string }
  - name: background
    type: string
    description: |
      One-paragraph background statement. Short prose; long
      biographies belong in the wiki.
  - name: confidence
    type: number
    description: |
      RESERVED at AIP-23 workspace level. 0..1; 1.0 = configured;
      lower = inferred. AIP-23 identity_layer_confidence_missing
      is HARD per-item.
    minimum: 0
    maximum: 1
  - name: bearer
    type: ref
    description: |
      The entity the personality describes.

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

# Personality

## Purpose

The `personality` layer captures the surface-observable layer of who the bearer
is: trait bands, communication style, strengths and weaknesses, pet peeves,
background. Personality is the layer the bearer's _peers_ would describe — soul
is what _they_ would describe.

This collection is part of the **identitykit-compagnon** starter library. It is
a faithful translation of the Guilde reference implementation's `personality`
layer (packages/guilde/src/domain/identity/layers.ts). Workspaces extending this
collection MAY add Big-Five traits not in the canonical five (curiosity,
assertiveness, agreeableness, extraversion, neuroticism), bandwidth indicators,
or domain-specific style fields.

## Conventions

- A bearer has at most ONE personality (per the workspace's exclusivity rule).
- `traits` are 0..10 bands by convention. The reference implementation uses this
  scale; extending workspaces MAY switch to 0..1 or 1..5 (Likert) if their
  domain expects it, but consistency across the workspace's items matters more
  than the scale chosen.
- `communicationStyle` strings are SHORT (one to three words): `"warm"`,
  `"direct"`, `"medium-formality"`, `"verbose with examples"`. Long descriptions
  belong in the bound wiki.
- `weaknesses` and `petPeeves` are first-class — they're honesty markers. An
  identity that lists no weaknesses is suspicious.

## Field guide

`traits` is the structured field; the others are unstructured arrays / strings.
Compression at the `short` tier serialises trait bands as `T:c5/a8/w7/p9/pr6`
(creativity 5, analytical 8, warmth 7, precision 9, proactivity 6).

`background` is one paragraph max. The full bearer biography lives in the wiki
under their dossier; the personality layer just carries the headline.

## Examples

```yaml
---
schema: collection.item/v1
collection: personality
id: PERS-acme-founder
title: Acme founder personality
status: active
bearer: ws://operators/founder
traits:
  creativity: 9
  analytical: 8
  warmth: 6
  precision: 7
  proactivity: 9
communicationStyle:
  tone: warm-direct
  formality: low
  verbosity: medium
  humor: dry
strengths:
  - synthesises across domains quickly
  - holds technical and business context simultaneously
  - explains complex ideas through analogy
weaknesses:
  - impatient with unfocused meetings
  - reverts to founder-mode under stress
  - over-trusts pattern matching from past contexts
petPeeves:
  - hedge words in commitments
  - status reports without decisions
  - "circling back" without follow-through
background: |
  Founder, 12 years across two companies, technical background,
  spent the last 4 years operating in AI tooling.
confidence: 1.0
---
```

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- The Guilde reference implementation's
  [`personality` layer](https://github.com/agentik-net/agentik-studio/blob/main/packages/guilde/src/domain/identity/layers.ts)
