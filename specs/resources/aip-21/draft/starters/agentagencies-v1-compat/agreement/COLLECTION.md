---
schema: collection.schema/v1
name: agreement
title: Agreement
description: |
  A signed contractual artifact gating one or more engagements.
  Mirrors AIP-8's hardcoded `AGREEMENT.md` doctype as an AIP-18
  collection. Signature semantics are delegated to AIP-7 — this
  collection's `signatureEvent` field carries an AIP-7 signature
  ref. Workspaces with `governance.signing.required: true` MUST
  refuse agreement transitions to `signed` without a valid
  signature event.
version: 1.0.0
fields:
  - name: counterparty
    type: ref
    refKind: counterparty
    description: |
      Counterparty bound by this agreement. Multiple engagements
      MAY share one master agreement; the engagement's `agreement`
      field references this item.
  - name: signatureEvent
    type: ref
    refKind: signature
    description: |
      Cross-AIP-7 signature event reference. When the workspace's
      governance policy sets `signing.required: true`, transition
      to `signed` requires this field to point at a valid AIP-7
      signature event. Hosts MUST validate the signature event
      resolves and is countersigned where the policy demands.
  - name: signedAt
    type: date
    description: Date the agreement was signed.
  - name: effectiveDate
    type: date
    description: Date the agreement takes effect (often == signedAt).
  - name: expiresAt
    type: date
    description: OPTIONAL — date the agreement expires.
  - name: documentRef
    type: string
    description: |
      OPTIONAL — pointer to the canonical agreement document
      (PDF URL, document store ref). Hosts MUST treat this string
      as opaque.
  - name: agreementType
    type: enum
    enum: [msa, sow, nda, dpa, custom]
    description: |
      Type of agreement. msa = master service agreement; sow =
      statement of work; nda = non-disclosure; dpa = data
      processing addendum.

statuses:
  - { id: draft, label: Draft, transitionsTo: [pending-signature, voided] }
  - {
      id: pending-signature,
      label: Pending signature,
      transitionsTo: [signed, voided],
    }
  - { id: signed, label: Signed, transitionsTo: [active, voided] }
  - { id: active, label: Active, transitionsTo: [closed, voided] }
  - { id: closed, label: Closed, terminal: true }
  - { id: voided, label: Voided, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: true

deadline:
  kind: target-date
  required: false
  fieldName: expiresAt

lints:
  - id: agreement-missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: agreement-pending-signature-stale
    kind: stale
    appliesTo: "status=pending-signature"
    severity: warn
    params:
      days: 14

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Agreement

## Purpose

An `agreement` is a signed contractual artifact — the legal underpinning for one
or more engagements. The agency typically ships an MSA per counterparty plus
per-engagement SOWs that reference the MSA.

This collection is part of the **agentagencies-v1-compat** starter library.
Cross-AIP-7 binding is the central feature: the `signatureEvent` field is a
typed reference to an AIP-7 signature record, not a raw signature blob — AIP-7
owns the signature format, this collection owns the gating logic.

## Conventions

- A draft agreement is a working document; it carries no legal weight.
- Transition to `pending-signature` indicates the agreement is ready for
  counterparty review.
- Transition to `signed` REQUIRES the `signatureEvent` field when the workspace
  governance binding sets `signing.required: true`. The host validates the
  signature event resolves and is countersigned per policy.
- Active vs signed: active agreements are signed AND past `effectiveDate`. Hosts
  MAY auto-bubble signed → active when the effective date passes.
- The AIP-21 lifecycle rule `engagement-terminal` typically bubbles `closed`
  onto agreements when their last engagement becomes terminal.

## Field guide

`signatureEvent` is the AIP-7 reference. The host resolves it through the
workspace's `governance:` binding — the policy file declares which signature
events are accepted (e.g. countersigned by both parties, signed within an
org-wide threshold).

## Examples

```yaml
---
schema: collection.item/v1
collection: agreement
id: AGR-acme-msa
title: Acme master service agreement
status: signed
owner: ws://operators/managing-director
counterparty: CP-acme-corp
signatureEvent: SIG-acme-msa-2026-03-15
signedAt: 2026-03-15
effectiveDate: 2026-04-01
agreementType: msa
documentRef: https://docs.example.com/agreements/acme-msa.pdf
---
# Acme MSA

Master service agreement covering all engagements with Acme Corp through 2027.
Countersigned 2026-03-15.
```
