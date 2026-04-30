---
schema: collection.schema/v1
name: project
title: Project
description: |
  A bounded body of work with a clear goal, a lead, and a deadline.
  Mirrors AIP-13's hardcoded project doctype as an AIP-18 collection,
  so existing v1 workspaces can opt into AIP-20 without rewriting
  items. Projects contain initiatives and tasks; they themselves are
  contained by nothing in v1's flat hierarchy, but workspaces MAY
  permit nesting via scope.containment.rules.
version: 1.0.0
fields:
  - name: priority
    type: enum
    enum: [low, normal, high, critical]
    description: Project priority — used by sorting and rollup heuristics.
  - name: lead
    type: ref
    refKind: operator
    description: |
      Operator (or user) leading the project. Mirrors AIP-13's
      `lead` field; AIP-20's ownership axis reads this through
      ownership.role=lead.
  - name: members
    type: array
    items:
      type: ref
      refKind: operator
    description: |
      OPTIONAL — operators with explicit access to the project, when
      access is narrower than role-based.
  - name: appliesTo
    type: array
    items:
      type: string
    description: |
      Applicability scope refs. The workspace's
      scope.applicability.valueClass declares the value class
      (company, role, role-and-company); this field carries the
      raw refs.
  - name: targetDate
    type: date
    description: Target completion date.
  - name: priorityRank
    type: number
    description: OPTIONAL stable ordering hint within a parent.
  - name: labels
    type: array
    items:
      type: string
    description: Free-form labels for grouping.

statuses:
  - { id: open, label: Open, transitionsTo: [in-progress, archived] }
  - {
      id: in-progress,
      label: In progress,
      transitionsTo: [blocked, done, archived],
    }
  - { id: blocked, label: Blocked, transitionsTo: [in-progress, archived] }
  - { id: done, label: Done, terminal: true }
  - { id: archived, label: Archived, terminal: true }

initialStatus: open

ownership:
  cardinality: single
  role: lead
  required: true

deadline:
  kind: target-date
  required: false
  fieldName: targetDate

lints:
  - id: project-missing-lead
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: project-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: project-stale-90d
    kind: stale
    appliesTo: "*"
    severity: warn
    params:
      days: 90

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Project

## Purpose

A `project` is a bounded body of work with a clear goal, a single lead, and a
(usually) target completion date. Projects contain initiatives and tasks; the
workspace's `scope.containment.rules` controls what kinds may parent a project.

This collection is part of the **agentwork-v1-compat** starter library — it
ships alongside AIP-20 to make migration from AIP-13 mechanical. Teams MAY
extend this collection ([AIP-18](/docs/aip-18) `extends:`) to add team-specific
fields without forking the AIP itself.

## Conventions

- A project has ONE lead; if you need multiple owners, you probably want an
  `initiative`.
- Projects nest under other projects only when the workspace permits via
  `scope.containment.rules.allowedKinds`.
- The `appliesTo` field is interpreted by the workspace's applicability axis
  (see AIP-20). Per-collection schemas don't re-validate the value class.

## Field guide

`lead` is the canonical ownership field; the workspace's `scope.ownership.field`
defaults to `owner`, but per-collection ownership.role overrides that to `lead`
for projects. Items reference the operator owning the project here.

`members[]` is the access-narrowing escape hatch for projects whose visibility
is narrower than role-based. Most projects do NOT need it.

## Examples

A typical project item:

```yaml
---
schema: collection.item/v1
collection: project
id: PROJ-onboarding
title: Customer onboarding overhaul
status: in-progress
lead: ws://operators/sarah-tng
priority: high
targetDate: 2026-06-30
appliesTo:
  - role/customer-success
  - role/eng
labels: [q2-2026, customer-experience]
---
# Customer onboarding overhaul

Lift the customer onboarding flow from manual to fully automated. Q2 2026
deliverable. Owned by Sarah, with engineering and customer-success
applicability.
```
