---
schema: collection.schema/v1
name: policy
title: Internal policy
description: |
  An internal HR / operating policy record — handbook entries,
  expense rules, working-hours norms, equipment allowances, code-
  of-conduct sections. NEW in v2 — implicit-only in AIP-6 (these
  lived in wikis or unstructured docs). Made first-class here so
  the org can track which policies are in force, who owns them,
  and when they were last reviewed.

  IMPORTANT: this collection is NOT the same as an AIP-7
  governance policy. AIP-7 governance policies are machine-
  enforceable approval gates that the host evaluates at write time
  (e.g. "every role mutation requires VP approval"). AIP-22's
  `policy` items are HUMAN-readable handbook entries (e.g.
  "Working hours are flexible; core collaboration window is
  10:00-15:00 UTC"). When an internal policy is formalised into
  a machine-enforceable rule, the policy item SHOULD reference
  the AIP-7 policy via `governanceRef` so auditors can see the
  link.

  Policies live OUTSIDE the org-tree containment (they are not
  in allowedKinds by default); they attach to departments, teams,
  or the whole company by reference.
version: 1.0.0
fields:
  - name: owner
    type: ref
    refKind: role
    description: |
      Role accountable for keeping this policy current. The
      workspace's ownership axis reads this through
      ownership.role=owner. Policy owners are typically heads of
      People, Legal, or Compliance.
  - name: appliesTo
    type: array
    items:
      type: string
    description: |
      Refs to departments, teams, roles, or the company root the
      policy applies to. Empty / unset = applies to the whole
      company.
  - name: category
    type: enum
    enum:
      [
        hr,
        compensation,
        benefits,
        working-hours,
        remote-work,
        equipment,
        expense,
        travel,
        code-of-conduct,
        confidentiality,
        ip,
        other,
      ]
    description: Coarse policy category for indexing and discovery.
  - name: governanceRef
    type: string
    description: |
      OPTIONAL — ws:// or path ref to an AIP-7 governance policy
      that machine-enforces this internal policy. Set this when an
      HR policy has been formalised into an approval gate.
  - name: lastReviewedAt
    type: date
    description: Date the owner last reviewed and confirmed the policy.
  - name: nextReviewAt
    type: date
    description: |
      Target date for the next review. Lints SHOULD flag policies
      whose nextReviewAt is past.
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: draft, label: Draft, transitionsTo: [in-review, published, archived] }
  - {
      id: in-review,
      label: In review,
      transitionsTo: [draft, published, archived],
    }
  - {
      id: published,
      label: Published,
      transitionsTo: [in-review, retired, archived],
    }
  - { id: retired, label: Retired, terminal: true }
  - { id: archived, label: Archived, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: true

deadline:
  kind: target-date
  required: false
  fieldName: nextReviewAt

lints:
  - id: policy-missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: policy-overdue-review
    kind: overdue
    appliesTo: "*"
    severity: warn

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Internal policy

## Purpose

A `policy` item is an internal HR / operating policy record — a handbook entry,
expense rule, working-hours norm, code-of-conduct section. The body is
human-readable; the frontmatter tracks ownership, applicability, review cadence.

This collection is **NEW in v2**. AIP-6 had no first-class policy type —
handbook entries lived in wikis or unstructured docs. Lifting them into the org
workspace lets the company track which policies are in force, who owns them, and
when they were last reviewed.

## Difference from AIP-7 governance policies

This is the most-asked clarification. The two are NOT the same:

| AIP-22 `policy` item                                         | AIP-7 governance policy                    |
| ------------------------------------------------------------ | ------------------------------------------ |
| Human-readable handbook entry                                | Machine-enforceable approval gate          |
| "Working hours are flexible; core window is 10:00-15:00 UTC" | "Every role mutation requires VP approval" |
| Body prose, with cross-refs                                  | Frontmatter rules, evaluated at write time |
| Owned by a role (head of People, Legal, Compliance)          | Owned by the org's governance binding      |
| Reviewed periodically                                        | Hashed, signed, version-controlled         |
| Lives in the company workspace                               | Lives in the governance workspace          |
| `category: hr / compensation / ...`                          | Has approval-class semantics               |

When an internal policy is formalised into a machine-enforceable gate, set
`governanceRef` to the AIP-7 policy that enforces it. This gives auditors a
clear link from "the rule humans read" to "the rule machines apply".

## Conventions

- Every policy has ONE owner — typically a head of People, Legal, or Compliance.
- `appliesTo` may be empty (whole company) or list specific departments, teams,
  or roles.
- `lastReviewedAt` and `nextReviewAt` track review cadence — most orgs review
  handbook policies annually.
- Status: `draft` → `in-review` → `published` → `retired` / `archived`.

## Field guide

`owner` is the ownership field. The workspace's default ownership field is
overridden here to `owner` (matching the field name) via
`ownership.role: owner`.

`governanceRef` is the bridge to AIP-7. When set, indicates that some part of
this policy has been mechanised; auditors SHOULD diff the prose body against the
AIP-7 policy to ensure consistency.

## Examples

```yaml
---
schema: collection.item/v1
collection: policy
id: POLICY-working-hours
title: Working hours and core collaboration window
status: published
owner: ROLE-head-of-people
appliesTo: []
category: working-hours
lastReviewedAt: 2026-01-15
nextReviewAt: 2027-01-15
labels: [handbook, hr]
---

# Working hours and core collaboration window

We operate a flexible-hours model. Each person picks their own
work hours; we expect everyone to be available during the core
collaboration window of 10:00-15:00 UTC for synchronous meetings
and pair work. Outside that window, async communication is the
default.

Time-zone-bridging exception: roles in APAC may shift their core
window 3 hours later (13:00-18:00 UTC); see
[POLICY-apac-collaboration](./POLICY-apac-collaboration.md) for
details.
```
