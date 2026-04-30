---
schema: collection.schema/v1
name: mind
title: Mind
description: |
  Cognitive style, decision patterns, learning preferences — how
  the bearer thinks. Captures the decision process, principles,
  questions they always ask, and mental models they apply. Ships
  in the identitykit-compagnon starter library; corresponds
  to the `mind` preset in the reference implementation
  (packages/core/src/domain/identity/presets/mind.ts).
version: 1.0.0
fields:
  - name: decisionProcess
    type: array
    description: |
      Ordered steps the bearer takes when making decisions. Each
      step is a short phrase. e.g. ["frame the problem", "list
      assumptions", "stress-test against the inverse"].
    items: { type: string }
  - name: principles
    type: array
    description: |
      Rules and operating principles the bearer lives by. Short
      phrases. e.g. ["bias toward action when reversible",
      "kill projects that bore you"].
    items: { type: string }
  - name: questions
    type: array
    description: |
      Questions the bearer always asks. Often the most
      diagnostic field — these are the bearer's hooks for
      surfacing the real signal in a situation.
    items: { type: string }
  - name: mentalModels
    type: array
    description: |
      Frameworks the bearer reaches for when reasoning. e.g.
      ["Pareto", "first principles", "second-order effects",
      "regret minimisation"].
    items: { type: string }
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
      The entity (operator / company / persona / user) the mind
      layer describes.

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

# Mind

## Purpose

The `mind` layer captures how the bearer thinks: decision process, principles,
signature questions, mental models. Mind is more stable than personality but
more fluid than soul — it changes when the bearer adopts a new framework, takes
on a new domain, learns from a major mistake.

This collection is part of the **identitykit-compagnon** starter library. It is
a faithful translation of the reference implementation's `mind` preset
(packages/core/src/domain/identity/presets/mind.ts) into the AIP-18 collection
form. Domain-specific extensions (`epistemicHumilityIndicators`,
`cognitiveTrapsKnown`) live on extension collections; do not mutate this starter
in place.

## Conventions

- A bearer has at most ONE mind (per the workspace's exclusivity rule).
- Each field is an array of short phrases. Long narratives belong in the wiki,
  not in the mind layer.
- `questions` is often the highest-signal field; the bearer's signature
  questions reveal the bearer's mental model efficiently.
- The compression artifact pipeline packs `decisionProcess` into the medium-tier
  sectioned form; full-tier renders all four arrays as markdown bullet lists.

## Field guide

`decisionProcess` is ORDERED — the order matters and is preserved in compression
artifacts. Other fields are unordered.

`mentalModels` overlaps with `principles` and `questions`; the distinction is
that mental models are _named frameworks_ the bearer borrows (Pareto, first
principles), principles are _rules of operation_ the bearer authors (bias to
action), and questions are _concrete prompts_ the bearer asks aloud.

## Examples

```yaml
---
schema: collection.item/v1
collection: mind
id: MIND-acme-founder
title: Acme founder mind
status: active
bearer: ws://operators/founder
decisionProcess:
  - frame the problem in one sentence
  - list assumptions explicitly
  - stress-test against the inverse
  - decide and write down what would change my mind
principles:
  - bias toward action when reversible
  - kill projects that bore you
  - hire for taste over experience
questions:
  - what would have to be true for this to be a great decision?
  - what's the smallest test we can ship this week?
  - if we delete this, what breaks?
mentalModels:
  - first principles
  - regret minimisation
  - second-order effects
  - Pareto
confidence: 1.0
---
# Acme founder mind

Cognitive style of the founder. Drives the way org decisions get framed, the
questions that get asked in reviews, the mental models the team adopts.
```

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- The reference implementation's
  [`mind` preset](https://github.com/agentik-net/agentik-studio/blob/main/packages/core/src/domain/identity/presets/mind.ts)
