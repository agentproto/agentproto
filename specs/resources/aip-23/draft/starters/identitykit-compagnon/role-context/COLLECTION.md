---
schema: collection.schema/v1
name: role-context
title: Role Context
description: |
  Role-specific context: role type, decision domains, delegation
  style, reporting structure. Captures how the bearer operates
  *within an organisation* — distinct from `personality` (how
  they show up) and `mind` (how they think). Ships in the
  identitykit-compagnon starter library; corresponds to the
  `role-context` layer in the Guilde reference implementation
  (packages/guilde/src/domain/identity/layers.ts).
version: 1.0.0
fields:
  - name: roleType
    type: string
    description: |
      The functional role type. Free-form string by convention,
      but workspaces often constrain to an enum (founder /
      operator / mentor / specialist / analyst). Not the same
      as the AIP-22 role item — this is a CHARACTERISATION of
      the bearer's role, not a slot in an org tree.
  - name: decisionDomains
    type: array
    description: |
      Decision domains the bearer owns. Short phrases. e.g.
      ["product strategy", "hiring", "engineering architecture"].
    items: { type: string }
  - name: delegationStyle
    type: string
    description: |
      How the bearer delegates. Short prose. e.g. "delegates
      outcomes, not steps", "delegates by writing the test
      first", "rarely delegates analytical work".
  - name: reportingTo
    type: string
    description: |
      OPTIONAL — who the bearer reports to. May be a free-form
      role name or a ws://operators/<slug> ref to another
      operator's identity. The AIP-22 reporting graph is more
      authoritative for org-tree hierarchy; this field captures
      the bearer's *self-described* reporting line.
  - name: confidence
    type: number
    description: |
      RESERVED at AIP-23 workspace level. 0..1; 1.0 = configured;
      lower = inferred.
    minimum: 0
    maximum: 1
  - name: bearer
    type: ref
    description: |
      The entity (operator / persona) the role context describes.

statuses:
  - {
      id: draft,
      label: Draft,
      transitionsTo: [active, transitioning, archived],
    }
  - { id: active, label: Active, transitionsTo: [transitioning, archived] }
  - {
      id: transitioning,
      label: Transitioning,
      transitionsTo: [active, archived],
    }
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

# Role Context

## Purpose

The `role-context` layer captures how the bearer operates within an
organisation: their role type, decision domains, delegation style, reporting
line. Where `mind` is how they think and `personality` is how they show up,
role-context is _what they do at work_.

This collection is part of the **identitykit-compagnon** starter library. It is
a faithful translation of the Guilde reference implementation's `role-context`
layer (packages/guilde/src/domain/identity/layers.ts).

## Conventions

- A bearer has at most ONE role-context per organisation (per the workspace's
  exclusivity rule). When a bearer holds roles in multiple organisations, each
  organisation's identity workspace declares its own role-context for that
  bearer.
- `roleType` is descriptive, not normative — the spec does not pin a vocabulary.
  Workspaces SHOULD pick a small enum and stick to it (e.g.
  `[founder, operator, mentor, specialist, analyst, individual-contributor]`).
- `decisionDomains` is the highest-leverage field for an operator-fleet
  identity. The compression artifact pipeline surfaces decision domains in the
  `short` tier.
- `delegationStyle` is short prose; long delegation playbooks belong in the
  bound wiki ([AIP-10](/docs/aip-10)).

## Field guide

`reportingTo` is descriptive — it captures the bearer's _self-perceived_
reporting line. The authoritative reporting graph for an organisation is in the
bound [AIP-22](/docs/aip-22) `OFFICE.md` workspace's `orgTree.reporting`. This
field is for cases where the operator's perception differs from the org tree
(matrix reports, dotted lines), or where there is no org tree.

`transitioning` status is for periods between active roles — the bearer's
role-context is being rewritten as they move between positions.

## Examples

```yaml
---
schema: collection.item/v1
collection: role-context
id: ROLE-acme-founder
title: Acme founder role context
status: active
bearer: ws://operators/founder
roleType: founder
decisionDomains:
  - product strategy
  - hiring (final-round only)
  - engineering architecture (advisory)
  - external partnerships
delegationStyle: |
  Delegates outcomes, not steps. Writes the test before
  delegating; reviews the test, not the implementation.
reportingTo: board (acme-corp)
confidence: 1.0
---
# Acme founder role context

The founder's role within Acme. Drives the operator's visibility into which
decisions land at their door, the delegation patterns the team observes, and the
reporting line external counterparties expect.
```

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-22 — agentoffice/v1](/docs/aip-22) — authoritative org-tree reporting
  graph
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- The Guilde reference implementation's
  [`role-context` layer](https://github.com/agentik-net/agentik-studio/blob/main/packages/guilde/src/domain/identity/layers.ts)
