---
schema: collection.schema/v1
name: invoice
title: Invoice
description: |
  A bill issued under an engagement. Mirrors AIP-8's hardcoded
  `INVOICE.md` doctype as an AIP-18 collection. Invoices have
  financial fields (currency, amount, dueAt, lineItems) and a
  state machine (draft → sent → paid → overdue → cancelled). The
  `any-invoice-paid` lifecycle rule typically bubbles `invoiced`
  onto the parent engagement when at least one invoice is paid.
version: 1.0.0
fields:
  - name: engagement
    type: ref
    refKind: engagement
    description: Engagement this invoice bills against.
  - name: counterparty
    type: ref
    refKind: counterparty
    description: |
      Counterparty being billed. Typically inherited from the
      engagement; explicitly carried for reporting flexibility.
  - name: amount
    type: number
    description: Invoice total in `currency`.
  - name: currency
    type: string
    description: |
      ISO 4217 currency code. Falls back to the engagement's
      currency, which falls back to the workspace's
      engagement.terms.defaultCurrency.
  - name: lineItems
    type: array
    items:
      type: object
    description: |
      OPTIONAL — line item breakdown. Each item carries a
      description, quantity, unit price, and (optional) tax rate.
      Hosts SHOULD validate that line items sum to `amount`.
  - name: issuedAt
    type: date
    description: Invoice issue date.
  - name: dueAt
    type: date
    description: |
      Payment due date. Defaults to issuedAt + paymentTerms (per
      engagement.terms.defaultPaymentTerms or the engagement's
      paymentTerms field).
  - name: paidAt
    type: date
    description: Date payment was received and confirmed.
  - name: paymentReference
    type: string
    description: OPTIONAL — bank reference, payment processor id, etc.
  - name: poNumber
    type: string
    description: OPTIONAL — counterparty's purchase order number.
  - name: documentRef
    type: string
    description: OPTIONAL — pointer to the canonical invoice PDF.

statuses:
  - { id: draft, label: Draft, transitionsTo: [sent, cancelled] }
  - { id: sent, label: Sent, transitionsTo: [paid, overdue, cancelled] }
  - { id: overdue, label: Overdue, transitionsTo: [paid, cancelled] }
  - { id: paid, label: Paid, terminal: true }
  - { id: cancelled, label: Cancelled, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: true

deadline:
  kind: target-date
  required: true
  fieldName: dueAt

lints:
  - id: invoice-overdue
    kind: overdue
    appliesTo: "status=sent"
    severity: error
  - id: invoice-missing-due
    kind: required-field
    appliesTo: "status=sent"
    severity: error
    params:
      field: dueAt

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Invoice

## Purpose

An `invoice` is a bill issued under an engagement. Invoices have financial
fields and a state machine; payment events transition the invoice to `paid`,
which the AIP-21 lifecycle rule `any-invoice-paid` typically uses to bubble
`invoiced` (or `paid`) onto the parent engagement.

This collection is part of the **agentagencies-v1-compat** starter library.
Financial-domain extensions (tax computation, multi-line breakdowns, discount
fields) belong in domain-specific child collections, not in this starter.

## Conventions

- Multi-milestone engagements have multiple invoices, one per milestone. The
  `any-invoice-paid` rule fires on the first paid invoice; refine the rule's
  `params.statusEquals` if you need "all invoices paid" semantics.
- Currency MUST be set on the item, even when it matches the workspace default —
  explicit values aid reporting and cross- jurisdiction reconciliation.
- `dueAt` is REQUIRED once the invoice transitions out of `draft`. The
  `invoice-missing-due` lint enforces this.
- `overdue` status is typically reached automatically by a nightly workflow (the
  workspace's `defaults.workflow`) after `dueAt + gracePeriodDays`.

## Field guide

`engagement` is the parent ref — REQUIRED for the AIP-21 lifecycle rules to find
the right target item.

`amount` SHOULD be the total of `lineItems`; hosts validating this collection
MAY surface a `custom` lint when the sum drifts.

## Examples

```yaml
---
schema: collection.item/v1
collection: invoice
id: INV-acme-q2-001
title: Acme Q2 milestone 1 invoice
status: paid
owner: ws://operators/finance-controller
engagement: ENG-acme-q2
counterparty: CP-acme-corp
amount: 6000
currency: EUR
issuedAt: 2026-05-15
dueAt: 2026-06-14
paidAt: 2026-06-10
paymentReference: WIRE-20260610-XYZ
poNumber: PO-ACME-2026-Q2
documentRef: https://docs.example.com/invoices/INV-acme-q2-001.pdf
lineItems:
  - description: Strategy workshop session 1
    quantity: 1
    unitPrice: 6000
    taxRate: 0
---
# Acme Q2 milestone 1 invoice

First milestone invoice for the Acme Q2 strategy engagement. Paid 2026-06-10 by
wire transfer.
```
