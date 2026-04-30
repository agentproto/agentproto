---
schema: collection.schema/v1
name: capacity
title: Capacity
description: |
  Operator availability and skill capacity within a window of
  time. Mirrors AIP-8's hardcoded `CAPACITY.md` doctype as an
  AIP-18 collection. Each capacity item declares one operator's
  available hours per week, the skills they can deliver, and an
  effective date range. Workspace lints can compare capacity
  records against active engagements to detect over-allocation.
version: 1.0.0
fields:
  - name: operator
    type: ref
    refKind: operator
    description: |
      AIP-9 operator the capacity record covers. REQUIRED — every
      capacity record is one operator's availability for one
      window.
  - name: hoursPerWeek
    type: number
    description: Available billable hours per week within the window.
  - name: skills
    type: array
    items:
      type: ref
      refKind: skill
    description: AIP-3 skills the operator can deliver in this window.
  - name: effectiveFrom
    type: date
    description: First day the capacity record is in effect.
  - name: effectiveTo
    type: date
    description: |
      Last day the capacity record is in effect. May be omitted
      for open-ended availability.
  - name: notes
    type: string
    description: OPTIONAL — free-form notes (vacation, training, focus areas).

statuses:
  - { id: planned, label: Planned, transitionsTo: [active, expired] }
  - { id: active, label: Active, transitionsTo: [expired, archived] }
  - { id: expired, label: Expired, transitionsTo: [archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: planned

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: target-date
  required: false
  fieldName: effectiveTo

lints:
  - id: capacity-missing-operator
    kind: required-field
    appliesTo: "*"
    severity: error
    params:
      field: operator
  - id: capacity-zero-hours
    kind: custom
    appliesTo: "status=active"
    severity: warn
    params:
      check: hoursPerWeek-greater-than-zero

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Capacity

## Purpose

A `capacity` item declares an operator's availability for a window — billable
hours per week, skills they cover, an effective date range. The capacity
collection is what allocation, planning, and over-booking lints read; engagement
items consume capacity by referring to assignees.

This collection is part of the **agentagencies-v1-compat** starter library. The
starter intentionally keeps capacity simple — one record per operator-window.
Domain-specific extensions (per-skill capacity breakdowns, fractional
allocations across multiple agencies) belong in extending collections.

## Conventions

- One capacity record covers one operator for one date range. Overlapping
  windows are not handled by the spec; hosts MAY surface a `custom` lint when
  they overlap.
- `effectiveTo: null` means open-ended; the next planned record for the same
  operator implicitly closes it.
- Status `active` is for the _current_ window; `planned` is for upcoming
  windows; `expired` is for past windows that haven't yet been archived.

## Field guide

`operator` is REQUIRED — capacity without an operator is meaningless.

`skills` references AIP-3 skill manifests; allocation logic uses this list to
match capacity to engagement requirements.

## Examples

```yaml
---
schema: collection.item/v1
collection: capacity
id: CAP-jane-doe-2026-q2
title: Jane Doe Q2 2026 capacity
status: active
owner: ws://operators/managing-director
operator: ws://operators/jane-doe
hoursPerWeek: 32
skills:
  - ws://skills/strategy-consulting
  - ws://skills/discovery-workshop
  - ws://skills/executive-facilitation
effectiveFrom: 2026-04-01
effectiveTo: 2026-06-30
notes: "Reduced to 32h/week for Q2 due to part-time arrangement."
---

# Jane Doe Q2 2026 capacity

Jane's reduced-hours capacity for Q2 2026: 32 billable hours per
week, three primary skill domains.
```
