---
schema: collection.schema/v1
name: initiative
title: Initiative
description: |
  A multi-task body of work narrower than a project but broader
  than a task — typically a workstream within a project, owned by
  one lead, decomposable into tasks. Mirrors AIP-13's hardcoded
  initiative doctype as an AIP-18 collection. Initiatives are
  deliberately a SIBLING of project (not a subtype) so workspaces
  can mix-and-match — a workspace MAY skip initiatives entirely
  and parent tasks directly under projects.
version: 1.0.0
fields:
  - name: priority
    type: enum
    enum: [low, normal, high, critical]
    description: Initiative priority.
  - name: lead
    type: ref
    refKind: operator
    description: Operator leading the initiative.
  - name: appliesTo
    type: array
    items:
      type: string
    description: |
      Applicability scope refs. Interpreted by the workspace's
      applicability axis (see AIP-20).
  - name: targetDate
    type: date
    description: Target completion date.
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: open, label: Open, transitionsTo: [in-progress, cancelled] }
  - {
      id: in-progress,
      label: In progress,
      transitionsTo: [blocked, done, cancelled],
    }
  - { id: blocked, label: Blocked, transitionsTo: [in-progress, cancelled] }
  - { id: done, label: Done, terminal: true }
  - { id: cancelled, label: Cancelled, terminal: true }

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
  - id: initiative-missing-lead
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: initiative-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: initiative-stale-30d
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

# Initiative

## Purpose

An `initiative` is a focused workstream — typically a few weeks of effort,
decomposable into tasks. Initiatives sit between projects (quarterly bodies of
work) and tasks (atomic units). Most teams use initiatives when a project is too
big to track at the task level but the work doesn't merit a separate project.

This collection is part of the **agentwork-v1-compat** starter library.
Workspaces that don't use initiatives can omit this collection from their
`WORK.md` `collections[]` array — there is no required-collection list in
AIP-20.

## Conventions

- An initiative has ONE lead. Multi-leader workstreams should be modelled as
  multiple initiatives or as a project with members.
- Initiatives parent under projects (in v1-compat workspaces) but the
  workspace's `scope.containment.rules` is authoritative.
- The `cancelled` status is terminal; v1 used `archived` for projects but
  `cancelled` for initiatives — preserved here for fidelity to AIP-13's
  vocabulary.

## Field guide

`lead` is the canonical ownership field (same as project — both use
`role: lead`). Tasks under initiatives use `assignee` instead.

## Examples

```yaml
---
schema: collection.item/v1
collection: initiative
id: INIT-onboarding-emails
title: Onboarding email rewrite
parent: PROJ-onboarding
status: in-progress
lead: ws://operators/sarah-tng
priority: normal
targetDate: 2026-05-15
appliesTo:
  - role/customer-success
labels: [emails, content]
---
# Onboarding email rewrite

Rewrite the welcome / day-3 / day-7 emails. Initiative under the customer
onboarding overhaul project.
```
