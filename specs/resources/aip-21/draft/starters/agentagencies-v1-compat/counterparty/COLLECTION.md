---
schema: collection.schema/v1
name: counterparty
title: Counterparty
description: |
  A client legal entity the agency engages with. Mirrors AIP-8's
  hardcoded `COUNTERPARTY.md` doctype as an AIP-18 collection.
  Counterparties optionally reference an AIP-6 company via
  `companyRef`, in which case the AIP-6 record is the canonical
  source for legal name, jurisdiction, and contact info; this
  collection then carries the agency-specific relationship state.
version: 1.0.0
fields:
  - name: companyRef
    type: ref
    refKind: company
    description: |
      OPTIONAL — cross-AIP-6 reference to the registered legal
      entity. When set, the AIP-6 record is the source of truth
      for legalName, jurisdiction, and contact info; this
      collection carries only agency-specific relationship state.
      Resolves through the workspace's `companies:` root.
  - name: legalName
    type: string
    description: |
      Display string for the counterparty's legal name. Used when
      `companyRef` is absent OR to override the AIP-6 record's
      display name.
  - name: jurisdiction
    type: string
    description: |
      ISO 3166-1 alpha-2 jurisdiction code (e.g. FR, US, GB).
      Falls back to the AIP-6 company's jurisdiction when
      companyRef is set.
  - name: primaryContact
    type: ref
    refKind: operator
    description: |
      OPTIONAL — operator (or contact) at the counterparty,
      modelled as an operator ref for consistency with AIP-9.
  - name: tier
    type: enum
    enum: [strategic, growth, transactional, archived]
    description:
      Internal classification driving prioritisation and capacity allocation.
  - name: relationshipStartedAt
    type: date
    description: Date the agency first engaged with this counterparty.
  - name: tags
    type: array
    items:
      type: string

statuses:
  - { id: prospect, label: Prospect, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [dormant, archived] }
  - { id: dormant, label: Dormant, transitionsTo: [active, archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: prospect

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none
  required: false

lints:
  - id: counterparty-stale-active-180d
    kind: stale
    appliesTo: "status=active"
    severity: info
    params:
      days: 180

identity:
  slugSource: legalName
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Counterparty

## Purpose

A `counterparty` is a client legal entity — the _who_ on the other side of every
engagement and agreement. Counterparties optionally bridge to AIP-6 companies
via `companyRef`, keeping the canonical entity record outside the agency.

This collection is part of the **agentagencies-v1-compat** starter library.
Per-jurisdiction agencies typically extend this collection
([AIP-18](/docs/aip-18) `extends:`) to add jurisdiction-specific identifiers (FR
SIREN/SIRET, US EIN, UK Companies House number).

## Conventions

- Set `companyRef` whenever the counterparty has been registered as an AIP-6
  company in the workspace's `companies:` root. Without it, the agency carries
  the legal name as a string.
- `tier` drives prioritisation. `strategic` counterparties get reserved
  capacity; `transactional` counterparties are one-deal-at-a-time.
- The `prospect` status is for pre-engagement work (sales conversations,
  exploratory chats); `active` is for at-least-one engagement in progress;
  `dormant` is for past clients with no current engagement.

## Field guide

`companyRef` resolves through the workspace's `companies:` root. A counterparty
without `companyRef` is legal-info-shallow but otherwise valid.

`primaryContact` is modelled as an operator ref because AIP-9 generalises beyond
agency operators — external counterparty contacts are operators in the broader
sense.

## Examples

```yaml
---
schema: collection.item/v1
collection: counterparty
id: CP-acme-corp
title: Acme Corp
status: active
owner: ws://operators/account-manager
companyRef: ws://companies/acme-corp
legalName: Acme Corporation Ltd
jurisdiction: GB
primaryContact: ws://operators/jane-doe-acme
tier: strategic
relationshipStartedAt: 2024-09-01
tags: [retail, uk, strategic]
---
# Acme Corp

Strategic counterparty since 2024. Active engagement portfolio in retail
strategy and operations consulting.
```
