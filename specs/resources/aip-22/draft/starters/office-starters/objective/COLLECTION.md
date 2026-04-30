---
schema: collection.schema/v1
name: objective
title: Objective
description: |
  A goal the organisation pursues — typically OKR-shaped (an
  ambitious objective with measurable key results) but the schema
  is deliberately compatible with MBO, North-Star metrics, and
  custom goal frameworks. Mirrors AIP-6's hardcoded objective
  doctype as an AIP-18 collection. Objectives live OUTSIDE the
  org-tree containment (they are not in allowedKinds by default);
  they are attached to roles or departments by reference rather
  than by parent.
version: 1.0.0
fields:
  - name: accountable
    type: ref
    refKind: role
    description: |
      Role accountable for this objective. The workspace's
      ownership axis reads this through ownership.role=accountable.
  - name: scopedTo
    type: array
    items:
      type: ref
      refKind: department
    description: |
      OPTIONAL — departments / teams this objective applies to.
      Used by reporting walks to find every objective an org
      sub-unit owns.
  - name: timeframe
    type: enum
    enum: [quarterly, annual, multi-year, custom]
    description:
      Objective horizon. Most OKR-shaped goals are quarterly or annual.
  - name: targetDate
    type: date
    description: Target completion date.
  - name: keyResults
    type: array
    items:
      type: object
      properties:
        - { name: id, type: string }
        - { name: description, type: string }
        - { name: target, type: number }
        - { name: current, type: number }
        - { name: unit, type: string }
    description: |
      OPTIONAL — measurable key results for OKR-shaped objectives.
      Orgs using MBO or North-Star formats MAY omit this and use
      a single `targetMetric` field instead (extend the collection).
  - name: priority
    type: enum
    enum: [low, normal, high, critical]
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: draft, label: Draft, transitionsTo: [committed, archived] }
  - {
      id: committed,
      label: Committed,
      transitionsTo: [at-risk, achieved, missed, archived],
    }
  - {
      id: at-risk,
      label: At risk,
      transitionsTo: [committed, achieved, missed],
    }
  - { id: achieved, label: Achieved, terminal: true }
  - { id: missed, label: Missed, terminal: true }
  - { id: archived, label: Archived, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: accountable
  required: true

deadline:
  kind: target-date
  required: false
  fieldName: targetDate

lints:
  - id: objective-missing-accountable
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: objective-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: objective-stale-30d
    kind: stale
    appliesTo: "*"
    severity: warn
    params:
      days: 30

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Objective

## Purpose

An `objective` is a goal the organisation pursues — typically OKR-shaped
(ambitious objective + measurable key results), but compatible with MBO,
North-Star metrics, and custom goal frameworks. Objectives live OUTSIDE the
containment tree by default (they are NOT in `allowedKinds`); they attach to
roles and departments by reference (`accountable`, `scopedTo`).

This collection is part of the **office-starters** starter library. Common
extensions: revenue orgs add a `north_star_metric` field; product orgs add
`theme`; OKR-purist orgs override the status ladder to match Andy Grove's
progression.

## Conventions

- An objective has ONE accountable role. Multiple stakeholders should be
  modelled via `scopedTo` (departments) or via contributing-role references in
  the body.
- `keyResults[]` is OPTIONAL — non-OKR frameworks omit it.
- Status: `draft` is for objectives being shaped; `committed` is signed off;
  `at-risk` flags slipping objectives; `achieved` / `missed` / `archived` are
  terminal.

## Field guide

`accountable` is the ownership field. The workspace's default ownership field
(`owner`) is overridden here to `accountable` via `ownership.role: accountable`.

`scopedTo` is the cross-tree attachment — which departments / teams this
objective applies to. The work tracker (AIP-20) often binds individual work
items to the objective via a separate `objective` ref; this field is the
org-level scope.

## Examples

```yaml
---
schema: collection.item/v1
collection: objective
id: OBJ-q2-2026-onboarding
title: Lift activation rate to 60% by end of Q2 2026
status: committed
accountable: ROLE-vp-product
scopedTo:
  - DEPT-product
  - DEPT-customer-success
timeframe: quarterly
targetDate: 2026-06-30
priority: high
keyResults:
  - id: kr1
    description: Reduce time-to-first-value to under 5 minutes
    target: 5
    current: 12
    unit: minutes
  - id: kr2
    description: Activation rate (D7) at 60%
    target: 60
    current: 38
    unit: percent
labels: [q2-2026, activation, customer-experience]
---
# Q2 2026 onboarding objective

Drive D7 activation rate from 38% to 60% by end of Q2. Owned by the VP of
Product; spans Product and Customer Success.
```
