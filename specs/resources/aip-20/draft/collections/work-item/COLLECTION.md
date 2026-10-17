---
schema: collection.schema/v1
name: work-item
title: Work item
description: |
  Normative base collection of AIP-20. Every work collection enabled in a
  WORK.md extends it. It fixes the fields and the status categories the
  AIP-20 coordination protocol (rev CAS, claim + lease, approvals,
  verification, audit) relies on. Children may add fields and statuses;
  they may not remove, retype or recategorise anything declared here.
version: 1.0.0
fields:
  - name: rev
    type: number
    required: true
    min: 1
    description: Revision token. Written only by the coordinator, +1 per applied write (AIP-20 §4.1).
  - name: createdBy
    type: string
    required: true
    pattern: "^(session:.+|operator:.+|user(:.+)?|host)$"
    description: Principal that created the item (AIP-20 §3.3). The creator is a manager of the item.
  - name: sessions
    type: array
    items: { type: string }
    description: Append-only history of every session that owned the item (AIP-46 ids).
  - name: runs
    type: array
    items: { type: string }
    description: Append-only AIP-58 run ids that executed work for this item.
  - name: blockedBy
    type: array
    items: { type: string }
    description: Item refs (`<collection>/<id>` or `ws://workspaces/<node>#work/<collection>/<id>`). Informational; drives the derived `blocked` condition (AIP-20 §6).
  - name: touches
    type: array
    items: { type: string }
    description: Advisory globs of files the work will edit (AIP-20 §4.6).
  - name: approvals
    type: array
    items: { type: string }
    description: AIP-7 approval-request ids gating this item (AIP-20 §7).
  - name: artifacts
    type: array
    items: { type: object }
    description: "Evidence links: {session, key, sha256} | {approval} | {run, key}. Stored, never dereferenced."
  - name: verify
    type: object
    description: Host gate spec for Tier-1 done (AIP-20 §5).
  - name: verification
    type: object
    description: "How done was reached: {kind: self-report|gate|human, by?, policyId?, exitCode?, ts}. Required on every item in a done-category status."
  - name: lastVerifyError
    type: string
    description: Why the last gated done did not transition.
  - name: closeReason
    type: string
    description: Why the item reached failed/cancelled (e.g. `denied`).
  - name: releaseReason
    type: string
    description: Why the last lease was released (e.g. `owner-exited`, `host-restart`).
  - name: reopenedBy
    type: string
    description: Principal that last reopened the item (done -> todo).
  - name: note
    type: text
    description: Last free-text note from the owner or a manager.
  - name: provenance
    type: object
    description: Free-form string map (prUrl, worktreePath, actionId). Advisory only.
  - name: closedAt
    type: datetime
    description: Set on entering a terminal category, cleared on reopen.

statuses:
  - { id: pending, label: Pending, category: todo, transitionsTo: [in-progress, cancelled] }
  - { id: in-progress, label: In progress, category: active, transitionsTo: [pending, awaiting-approval, done, failed, cancelled] }
  - { id: awaiting-approval, label: Awaiting approval, category: waiting, transitionsTo: [in-progress, cancelled] }
  - { id: done, label: Done, category: done, terminal: true, transitionsTo: [pending] }
  - { id: failed, label: Failed, category: failed, terminal: true, transitionsTo: [] }
  - { id: cancelled, label: Cancelled, category: cancelled, terminal: true, transitionsTo: [] }
initialStatus: pending

ownership:
  cardinality: single
  role: owner
  required: false

identity:
  slugSource: random
  filingPath: "items/{collection}/{id}.md"

lints:
  - { id: done-without-verification, kind: custom, appliesTo: "*", severity: error }
  - { id: stale-active, kind: stale, appliesTo: "*", severity: warn, params: { days: 7 } }
---

# Work item

The base every work kind extends. Read AIP-20 §3 for the meaning of each
field and §4 for the protocol that writes them.

## Conventions

- `owner` absent means claimable. Claim through the coordinator, never by
  editing the file.
- The status machine is defined over categories (AIP-20 §3.5). A child
  collection that adds a status gives it a category and may only narrow
  `transitionsTo`.
- `done → pending` is a reopen and is reserved to managers.
