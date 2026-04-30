---
schema: collection.schema/v1
name: department
title: Department
description: |
  A top-level org sub-unit (Engineering, Design, Operations,
  Growth, Finance, People, etc.). NEW in v2 — implicit-only in
  AIP-6 v1, made first-class here so the org tree has a clear
  decomposition rule. Departments contain teams and roles, and
  MAY nest as sub-departments (per workspace orgTree rules).
version: 1.0.0
fields:
  - name: head
    type: ref
    refKind: role
    description: |
      Role acting as the department head. The workspace's
      ownership axis reads this through ownership.role=head.
      Department heads are typically VP-level or director-level
      roles.
  - name: function
    type: enum
    enum:
      [
        engineering,
        product,
        design,
        operations,
        growth,
        sales,
        marketing,
        finance,
        people,
        legal,
        compliance,
        research,
        other,
      ]
    description: |
      OPTIONAL — coarse functional grouping. Useful for cross-org
      reporting (sum headcount by function across subsidiaries).
      Many orgs override the enum to match their internal taxonomy.
  - name: chargingCode
    type: string
    description: |
      OPTIONAL — internal charging / cost-centre code. Lets the
      bound work tracker (AIP-20) and agency (AIP-21) attribute
      effort and revenue to this department.
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: forming, label: Forming, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [restructuring, archived] }
  - {
      id: restructuring,
      label: Restructuring,
      transitionsTo: [active, archived],
    }
  - { id: archived, label: Archived, terminal: true }

initialStatus: forming

ownership:
  cardinality: single
  role: head
  required: true

lints:
  - id: department-missing-head
    kind: missing-owner
    appliesTo: "*"
    severity: error

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Department

## Purpose

A `department` is a top-level org sub-unit — Engineering, Design, Operations,
Growth, Finance, People, etc. Departments contain teams (when modelled) and
roles directly; they are the primary decomposition of the company below the
company root.

This collection is **NEW in v2**. AIP-6 had no first-class department type — the
concept was implicit through parent refs that were never validated. AIP-22 lifts
departments to first-class items so the containment matrix can validate parent
kinds: a team or role under a department is an explicit org-tree relationship.

## Conventions

- Every department has ONE head (typically a VP or director-level role).
  Multi-head departments should be modelled as one department with multiple
  senior roles, OR split into sibling departments.
- Departments MAY nest (sub-departments) when the workspace's
  `allowedParentKinds.department: [department]` permits.
- `forming` is for new departments being stood up. `active` is the steady state.
  `restructuring` flags departments mid-reorg. `archived` is terminal.

## Field guide

`head` is the ownership field. The workspace's default ownership field (`owner`)
is overridden here to `head` via `ownership.role: head`. The head MUST be a
`role`, not a raw operator — the authority chain stays in the role graph.

`function` is the coarse functional grouping. Useful when reporting across
subsidiaries that have different department names but matching functions (e.g.
"Engineering" in US, "Ingénierie" in FR).

## Examples

```yaml
---
schema: collection.item/v1
collection: department
id: DEPT-engineering
title: Engineering
status: active
head: ROLE-vp-engineering
function: engineering
chargingCode: ENG-001
labels: [tech, eng]
---
# Engineering

The engineering department. Houses platform, product-eng, and infra teams; led
by the VP of Engineering.
```
