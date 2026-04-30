---
schema: collection.schema/v1
name: task
title: Task
description: |
  An atomic unit of work assignable to ONE operator. Mirrors AIP-13's
  hardcoded task doctype as an AIP-18 collection. Tasks parent under
  projects or initiatives; they are the leaf of v1's hierarchy.
  Workspaces extending this collection MAY add domain-specific
  fields (component, severity, estimate) without forking AIP-20.
version: 1.0.0
fields:
  - name: priority
    type: enum
    enum: [low, normal, high, critical]
    description: Task priority.
  - name: assignee
    type: ref
    refKind: operator
    description: |
      Operator (or user) currently doing the task. Mirrors AIP-13's
      `assignee` field; AIP-20's ownership axis reads this through
      ownership.role=assignee. NULL/unset = free for pickup.
  - name: appliesTo
    type: array
    items:
      type: string
    description: |
      Applicability scope refs. Interpreted by the workspace's
      applicability axis (see AIP-20). Often inherited from parent
      initiative or project.
  - name: dueAt
    type: date
    description: Target completion date.
  - name: estimate
    type: number
    description: OPTIONAL estimated effort (hours) — task-only.
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: open, label: Open, transitionsTo: [claimed, in-progress, cancelled] }
  - {
      id: claimed,
      label: Claimed,
      transitionsTo: [in-progress, open, cancelled],
    }
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
  role: assignee
  required: false

deadline:
  kind: target-date
  required: false
  fieldName: dueAt

lints:
  - id: task-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: task-stale-14d
    kind: stale
    appliesTo: "*"
    severity: warn
    params:
      days: 14
  - id: task-broken-parent
    kind: broken-ref
    appliesTo: "*"
    severity: error

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Task

## Purpose

A `task` is an atomic unit of work — one operator, one well-defined outcome,
ideally less than a week of effort. Tasks parent under projects or initiatives;
the workspace's `scope.containment.rules` controls what kinds may parent a task.

This collection is part of the **agentwork-v1-compat** starter library. It is
the most-extended collection in v1-compat workspaces: engineering teams add
`component` and `severity`, design teams add `figma_link`, customer-success
teams add `customer_id`. Use [AIP-18](/docs/aip-18) `extends:` on a sibling
`COLLECTION.md` to add team-specific fields without mutating this starter.

## Conventions

- A task has at most ONE assignee. Multi-assignee work is an initiative.
- Assignee is OPTIONAL; an unassigned task is "free for pickup". This is why
  `ownership.required: false` here (vs `true` on project / initiative).
- The `claimed` status is the explicit "I'm taking this" signal before work
  starts. v1-compat preserves the four-state ladder open → claimed → in-progress
  → done with `blocked` and `cancelled` as off-ramps.

## Field guide

`assignee` is the ownership field (same name AIP-13 used). The workspace's
default ownership field (`owner`) is overridden here to `assignee` via
`ownership.role: assignee`.

`dueAt` is the deadline field (same name AIP-18 declares as the universal-ish
default).

## Examples

```yaml
---
schema: collection.item/v1
collection: task
id: TASK-rewrite-welcome
title: Rewrite welcome email copy
parent: INIT-onboarding-emails
status: in-progress
assignee: ws://operators/marc-content
priority: normal
dueAt: 2026-05-08
estimate: 3
appliesTo:
  - role/customer-success
labels: [content, copy]
---
# Rewrite welcome email copy

Replace the current welcome email with the variant from the new onboarding plan.
3-hour task; should ship before the May 10 release.
```
