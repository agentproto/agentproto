---
schema: collection.schema/v1
name: service
title: Service
description: |
  A catalog item for the agency's service catalog — what the agency
  offers to clients. Mirrors AIP-8's hardcoded `SERVICE.md` doctype
  as an AIP-18 collection. A `service` is the abstract offering;
  one or more `engagement` items instantiate it for specific
  counterparties. Workspaces extending this collection MAY add
  domain-specific fields (e.g. delivery format, technology stack)
  without forking AIP-21.
version: 1.0.0
fields:
  - name: pricingModel
    type: ref
    refKind: pricing-model
    description: |
      Reference to a pricing-model item declaring fixed / hourly /
      subscription / success-fee semantics. Items in this collection
      typically reference one pricingModel; engagements override on
      a per-deal basis.
  - name: tags
    type: array
    items:
      type: string
    description:
      Free-form labels for catalog grouping (e.g. "ai", "consulting").
  - name: capacity
    type: number
    description: |
      OPTIONAL — operator-hours per week required to deliver the
      service at the standard pace. Used by capacity-planning
      lints.
  - name: deliveryFormat
    type: enum
    enum: [synchronous, asynchronous, hybrid]
    description: How the service is delivered.
  - name: prerequisites
    type: array
    items:
      type: string
    description: OPTIONAL — prerequisite skills, tools, or context.

statuses:
  - { id: draft, label: Draft, transitionsTo: [live, retired] }
  - { id: live, label: Live, transitionsTo: [retired] }
  - { id: retired, label: Retired, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none
  required: false

lints:
  - id: service-stale-180d
    kind: stale
    appliesTo: "*"
    severity: info
    params:
      days: 180

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Service

## Purpose

A `service` is a catalog item — the abstract offering the agency makes available
to counterparties. A service has a name, a default pricing model, and a delivery
posture; engagement items bind a service to a counterparty with concrete terms.

This collection is part of the **agentagencies-v1-compat** starter library — it
ships alongside [AIP-21](/docs/aip-21) to make migration from
[AIP-8](/docs/aip-8) mechanical. Teams MAY extend this collection
([AIP-18](/docs/aip-18) `extends:`) to add team-specific fields without forking
AIP-21.

## Conventions

- A service is the "menu", not the "order". Bookings live on engagements.
- The `pricingModel` field references a pricing-model item; the same service MAY
  be sold at different prices via per-engagement overrides.
- `capacity` is informational; the workspace's capacity collection models the
  actual operator availability.

## Examples

```yaml
---
schema: collection.item/v1
collection: service
id: SVC-strategy-workshop
title: Strategy workshop
status: live
owner: ws://operators/managing-director
pricingModel: PM-fixed-day-rate
tags: [consulting, strategy, workshop]
deliveryFormat: synchronous
capacity: 8
prerequisites: [executive-stakeholder, agreed-objective]
---
# Strategy workshop

Half-day collaborative workshop with the client's leadership team to align on
objectives and a concrete next-quarter plan.
```
