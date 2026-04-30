---
schema: collection.schema/v1
name: pricing-model
title: Pricing model
description: |
  A reusable pricing rule — fixed, hourly, subscription, or
  success-fee. Mirrors AIP-8's hardcoded `PRICING-MODEL.md`
  doctype as an AIP-18 collection. Service items reference a
  pricing model as their default; engagement items override on
  a per-deal basis.
version: 1.0.0

fields:
  - name: kind
    type: enum
    enum: [fixed, hourly, subscription, success-fee, custom]
    description: |
      Pricing kind. fixed = single total; hourly = rate × hours;
      subscription = recurring billing; success-fee = contingent
      on a defined outcome; custom = host-defined.
  - name: amount
    type: number
    description: |
      Base amount in `currency`. Semantics depend on `kind`:
      fixed = total, hourly = rate, subscription = period amount,
      success-fee = base or percentage anchor.
  - name: currency
    type: string
    description: |
      ISO 4217 currency code. Falls back to the workspace's
      identity.defaultCurrency or engagement.terms.defaultCurrency.
  - name: unit
    type: string
    description: |
      Unit of measure for `kind: hourly` (e.g. "hour", "day") or
      `kind: subscription` (e.g. "month", "quarter", "year").
  - name: minHours
    type: number
    description: OPTIONAL — minimum billable hours for `kind: hourly`.
  - name: contingency
    type: object
    description: |
      OPTIONAL — for `kind: success-fee`, a structured description
      of the success criterion and the contingent amount or
      percentage.

statuses:
  - { id: draft, label: Draft, transitionsTo: [active, retired] }
  - { id: active, label: Active, transitionsTo: [retired] }
  - { id: retired, label: Retired, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none
  required: false

lints: []

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Pricing model

## Purpose

A `pricing-model` is a reusable pricing rule — the abstraction that lets one
service support multiple pricing postures. The agency may sell
`SVC-strategy-workshop` as `PM-fixed-day-rate` to one tier of clients and as
`PM-hourly-senior` to another.

This collection is part of the **agentagencies-v1-compat** starter library.

## Conventions

- A `pricing-model` doesn't bill anyone — it's just a template. Items in the
  engagement and invoice collections carry the realised amount and currency.
- The `success-fee` kind is structured but contingent — the `contingency` field
  carries the criterion. Hosts MAY surface a custom lint when contingencies are
  missing or unclear.
- Currency on the pricing model is the _default_; per-engagement overrides take
  precedence.

## Examples

```yaml
---
schema: collection.item/v1
collection: pricing-model
id: PM-fixed-day-rate
title: Fixed day rate
status: active
owner: ws://operators/managing-director
kind: fixed
amount: 2400
currency: EUR
unit: day
---
# Fixed day rate

Standard senior-consultant day rate for fixed-scope engagements. EUR 2400/day —
used for workshops and discovery work.
```

```yaml
---
schema: collection.item/v1
collection: pricing-model
id: PM-success-fee-acquisition
title: Acquisition success fee
status: active
owner: ws://operators/managing-director
kind: success-fee
amount: 50000
currency: EUR
contingency:
  criterion: "client closes acquisition transaction"
  basis: "fixed bonus on closing"
  cap: 100000
---
# Acquisition success fee

Success fee triggered on closing of an acquisition transaction. Base bonus EUR
50k; contingency capped at EUR 100k for multi-stage deals.
```
