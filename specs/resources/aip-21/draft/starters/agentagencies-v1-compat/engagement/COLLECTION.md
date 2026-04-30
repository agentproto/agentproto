---
schema: collection.schema/v1
name: engagement
title: Engagement
description: |
  A single client engagement — a concrete commercial deal binding
  the agency to a counterparty for one or more deliverables.
  Mirrors AIP-8's hardcoded `ENGAGEMENT.md` doctype as an AIP-18
  collection. Engagements have a rich state machine (proposed →
  accepted → in-progress → delivered → invoiced → paid → closed)
  and link to an agreement (gating contract), one or more
  deliverables, and one or more invoices. AIP-21 lifecycle rules
  bubble statuses across these collections.
version: 1.0.0
fields:
  - name: counterparty
    type: ref
    refKind: counterparty
    description: |
      Counterparty (client) the engagement is for. Resolves under
      the workspace's `companies:` binding when the counterparty's
      companyRef points at an AIP-6 company.
  - name: agreement
    type: ref
    refKind: agreement
    description: |
      The gating agreement item. When `engagement.terms.contractRequired:
      true` at the workspace level, this field MUST be populated
      before status leaves `proposed`.
  - name: service
    type: ref
    refKind: service
    description: The catalog service this engagement instantiates.
  - name: pricingModel
    type: ref
    refKind: pricing-model
    description: |
      OPTIONAL — engagement-specific pricing override. Falls back
      to the service's default pricingModel.
  - name: amount
    type: number
    description: Engagement total in `currency`.
  - name: currency
    type: string
    description: |
      ISO 4217 currency code (e.g. EUR, USD). Falls back to the
      workspace's engagement.terms.defaultCurrency.
  - name: paymentTerms
    type: string
    description: |
      Payment terms (net-15, net-30, due-on-receipt, ...). Falls
      back to the workspace's engagement.terms.defaultPaymentTerms.
  - name: startDate
    type: date
    description: Engagement start date.
  - name: targetEndDate
    type: date
    description: Target end date.
  - name: appliesTo
    type: array
    items:
      type: string
    description:
      Applicability scope refs (per the workspace's applicability axis).
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: proposed, label: Proposed, transitionsTo: [accepted, declined] }
  - { id: accepted, label: Accepted, transitionsTo: [in-progress, cancelled] }
  - {
      id: in-progress,
      label: In progress,
      transitionsTo: [blocked, delivered, cancelled],
    }
  - { id: blocked, label: Blocked, transitionsTo: [in-progress, cancelled] }
  - { id: delivered, label: Delivered, transitionsTo: [invoiced, closed] }
  - { id: invoiced, label: Invoiced, transitionsTo: [paid, closed] }
  - { id: paid, label: Paid, transitionsTo: [closed] }
  - { id: declined, label: Declined, terminal: true }
  - { id: cancelled, label: Cancelled, terminal: true }
  - { id: closed, label: Closed, terminal: true }

initialStatus: proposed

ownership:
  cardinality: single
  role: owner
  required: true

deadline:
  kind: target-date
  required: false
  fieldName: targetEndDate

lints:
  - id: engagement-missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: engagement-overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: engagement-stale-30d
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

# Engagement

## Purpose

An `engagement` is a single commercial deal — one counterparty, one (or
sometimes more) services, a target date, an amount, and a payment expectation.
Engagements gate the agency's actual work: the items in the work workspace are
organised under engagements, and the lifecycle rules in `AGENCY.md` propagate
state from deliverables and invoices back onto the engagement.

This collection is part of the **agentagencies-v1-compat** starter library. It
is the most-extended collection in v1-compat agencies: SaaS practices add
`targetMRR`, legal practices add `mattertype`, creative practices add
`concepts`. Use [AIP-18](/docs/aip-18) `extends:` on a sibling `COLLECTION.md`
to add domain-specific fields without mutating this starter.

## Conventions

- An engagement has ONE counterparty. Multi-party deals are modeled as multiple
  engagements.
- The `agreement` field is REQUIRED once
  `engagement.terms.contractRequired: true` at the workspace level. Until then,
  the field is optional.
- Status transitions to `delivered` / `invoiced` / `paid` are typically driven
  by AIP-21 lifecycle rules, not direct edits.
- Currency / paymentTerms inherit from the workspace's `engagement.terms` block
  when omitted on the item.

## Field guide

`counterparty` resolves through the workspace's `companies:` root. The
counterparty's `companyRef` field points at the AIP-6 company; the engagement's
`counterparty` field points at the counterparty item.

`amount` is the total — milestones break it into multiple invoices via the
invoice collection's `engagement` ref.

## Examples

```yaml
---
schema: collection.item/v1
collection: engagement
id: ENG-acme-q2
title: Acme Q2 strategy engagement
parent: null
status: in-progress
owner: ws://operators/account-manager
counterparty: CP-acme-corp
agreement: AGR-acme-msa
service: SVC-strategy-workshop
amount: 18000
currency: EUR
paymentTerms: net-30
startDate: 2026-04-01
targetEndDate: 2026-06-30
appliesTo:
  - CP-acme-corp
labels: [q2-2026, strategy]
---
# Acme Q2 strategy engagement

Three half-day strategy workshops with Acme leadership; one deliverable per
workshop; final deliverable is the consolidated strategic plan.
```
