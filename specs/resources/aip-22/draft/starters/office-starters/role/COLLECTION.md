---
schema: collection.schema/v1
name: role
title: Role
description: |
  A position within the company, held by zero or one operators.
  Mirrors AIP-6's hardcoded role doctype as an AIP-18 collection.
  Roles parent under teams or departments (per the workspace's
  orgTree.containment.rules); a role's manager line is expressed
  via the orthogonal reportsTo field. Workspaces extending this
  collection MAY add domain-specific fields (clearance,
  certifications, level, comp_band) without forking AIP-22.
version: 1.0.0
fields:
  - name: holder
    type: ref
    refKind: operator
    description: |
      Operator (or human) currently holding the role. NULL/unset =
      open / unfilled. AIP-22's ownership axis reads this through
      ownership.role=holder.
  - name: reportsTo
    type: ref
    refKind: role
    description: |
      Manager line — points at the role this role reports to. The
      workspace's orgTree.reporting axis enforces the cycle ban and
      the must-resolve-to-role rule. For matrixed (multiple-manager)
      orgs, switch the workspace's reporting.cardinality to
      'multiple' and this field becomes an array.
  - name: appointedAt
    type: date
    description: Date the current holder was appointed.
  - name: level
    type: enum
    enum: [ic, lead, manager, director, vp, c-suite, founder]
    description: |
      OPTIONAL — coarse career-level marker. Many orgs override this
      enum or replace it entirely with a domain-specific level
      ladder (engineering ladder, clinical ladder).
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: proposed, label: Proposed, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [suspended, archived] }
  - { id: suspended, label: Suspended, transitionsTo: [active, archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: proposed

ownership:
  cardinality: single
  role: holder
  required: false

lints:
  - id: role-unfilled-30d
    kind: stale
    appliesTo: "*"
    severity: warn
    params:
      days: 30
      filter:
        holder: unset

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Role

## Purpose

A `role` is a position within the company — a slot in the org tree, held by zero
or one operators. Roles are the leaf of the containment tree (a team contains
roles; a role does not contain anything). The role's manager line is expressed
via `reportsTo`, which the workspace's `orgTree.reporting` axis validates.

This collection is part of the **office-starters** starter library. It is the
most-extended collection in v1-compat organisations: clinical orgs add
`clearance` and `certifications`, engineering orgs add `level` ladder
customisation, regulated companies add `audit_certified`. Use
[AIP-18](/docs/aip-18) `extends:` on a sibling `COLLECTION.md` to add
org-specific fields without mutating this starter.

## Conventions

- A role has at most ONE holder. Multi-holder positions should be modelled as
  multiple roles (or a `team` if the work is collective).
- The `reportsTo` field MUST point at another `role` item — the workspace's
  reporting axis enforces this.
- `proposed` status is for roles that have been defined but not yet filled.
  `active` is the steady state. `suspended` is for roles temporarily vacated
  (parental leave, sabbatical). `archived` is terminal.

## Field guide

`holder` is the ownership field — same name AIP-6 used. The workspace's default
ownership field (`owner`) is overridden here to `holder` via
`ownership.role: holder`.

`reportsTo` carries the manager line. It is logically separate from the role's
containment parent (which team it sits in). A role's `parent` (containment) and
`reportsTo` (authority) MAY be the same item (when the role's manager is the
team lead) or different (matrix orgs, cross-team reports).

## Examples

```yaml
---
schema: collection.item/v1
collection: role
id: ROLE-vp-engineering
title: VP of Engineering
parent: DEPT-engineering
status: active
holder: ws://operators/sarah-tng
reportsTo: ROLE-cto
appointedAt: 2024-09-01
level: vp
labels: [engineering, leadership]
---
# VP of Engineering

VP-level role leading the engineering department. Reports to the CTO; sits
inside the engineering department in the containment tree.
```
