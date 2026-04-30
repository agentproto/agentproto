---
schema: collection.schema/v1
name: deliverable
title: Deliverable
description: |
  A specific work product the agency owes under an engagement —
  a report, a workshop session, an asset, a code drop. Mirrors
  AIP-8's hardcoded `DELIVERABLE.md` doctype as an AIP-18
  collection. Deliverables roll up to their parent engagement
  via AIP-21 lifecycle rules: when all deliverables under an
  engagement are `accepted`, the engagement bubbles to
  `delivered`.
version: 1.0.0
fields:
  - name: engagement
    type: ref
    refKind: engagement
    description: |
      Engagement this deliverable falls under. The lifecycle rule
      `deliverables-complete` reads this link to roll up engagement
      status.
  - name: assignee
    type: ref
    refKind: operator
    description: Operator responsible for delivering.
  - name: targetDate
    type: date
    description: Target delivery date.
  - name: deliveredAt
    type: date
    description: Date the deliverable was actually delivered.
  - name: acceptedAt
    type: date
    description: Date the counterparty accepted the deliverable.
  - name: deliveryFormat
    type: enum
    enum: [document, session, asset, code, custom]
    description: How the deliverable is materialized.
  - name: assetRef
    type: string
    description: |
      OPTIONAL — pointer to the deliverable artifact (file URL,
      session recording, code branch). Hosts MUST treat this
      string as opaque.
  - name: workItemRef
    type: ref
    refKind: work-item
    description: |
      OPTIONAL — link to an AIP-20 work item tracking the
      execution of this deliverable. Resolves through the
      workspace's `work:` binding.

statuses:
  - { id: draft, label: Draft, transitionsTo: [submitted, cancelled] }
  - { id: submitted, label: Submitted, transitionsTo: [accepted, rejected] }
  - { id: rejected, label: Rejected, transitionsTo: [draft, cancelled] }
  - { id: accepted, label: Accepted, terminal: true }
  - { id: cancelled, label: Cancelled, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: assignee
  required: false

deadline:
  kind: target-date
  required: false
  fieldName: targetDate

lints:
  - id: deliverable-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: deliverable-stale-7d
    kind: stale
    appliesTo: "status=draft"
    severity: warn
    params:
      days: 7
  - id: deliverable-rejected-stale
    kind: stale
    appliesTo: "status=rejected"
    severity: warn
    params:
      days: 5

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Deliverable

## Purpose

A `deliverable` is one specific work product owed under an engagement — a final
report, a workshop session record, a delivered code drop, an accepted asset. The
acceptance status of all deliverables under an engagement is what makes the
engagement "delivered" via AIP-21's lifecycle rules.

This collection is part of the **agentagencies-v1-compat** starter library.

## Conventions

- One deliverable, one assignee. Multi-person deliverables are modeled as
  parent + child deliverables OR as work items in the bound work workspace (via
  `workItemRef`).
- `accepted` is terminal — once accepted, the deliverable does not move.
  Re-engagements create new deliverables.
- The lifecycle rule `deliverables-complete` typically narrows
  `params.terminalStatuses: [accepted]` so cancelled deliverables do NOT count
  toward "all complete".
- `workItemRef` is the bridge to AIP-20: when the agency binds a `work:`
  workspace, deliverables MAY be paired with work items for execution tracking.

## Field guide

`engagement` is the parent ref — REQUIRED for the lifecycle rule to find the
right target item.

`deliveredAt` vs `acceptedAt` — delivery is one-sided (the agency asserts),
acceptance is two-sided (the counterparty acknowledges). The lifecycle rule
reads `acceptedAt`-time terminal status, not `deliveredAt`.

## Examples

```yaml
---
schema: collection.item/v1
collection: deliverable
id: DEL-acme-strategy-doc
title: Acme strategy document v1
status: accepted
assignee: ws://operators/strategy-lead
engagement: ENG-acme-q2
targetDate: 2026-05-15
deliveredAt: 2026-05-14
acceptedAt: 2026-05-18
deliveryFormat: document
assetRef: https://docs.example.com/acme/strategy-v1.pdf
workItemRef: ws://workspaces/agency-engagements/items/task/acme-strategy-doc
---
# Acme strategy document v1

Final consolidated strategy document — 32 pages, three-section structure,
accepted by Acme leadership 2026-05-18.
```
