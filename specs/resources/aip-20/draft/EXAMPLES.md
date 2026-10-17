# EXAMPLES.md — agentwork/v2 reference patterns

Concrete files for [AIP-20](/docs/aip-20): a project node's `WORKSPACE.md`
excerpt, its `WORK.md`, a `bug` collection extending `work-item`, items in
every stage of the protocol, a lease file, audit log lines, and a conflict
response. Copy the closest pattern rather than drafting from scratch.

## Contents

1. [The project node and its work root](#1-the-project-node-and-its-work-root)
2. [`WORK.md`](#2-workmd)
3. [The `bug` collection](#3-the-bug-collection)
4. [Items through the protocol](#4-items-through-the-protocol)
5. [Lease file](#5-lease-file)
6. [Audit log](#6-audit-log)
7. [Conflict response](#7-conflict-response)

---

## 1. The project node and its work root

A project is an [AIP-34](/docs/aip-34) workspace node, not a work item. Its
`WORKSPACE.md` points at the work root with the `work:` field; everything
under `work/` is AIP-20's.

`projects/billing-v2/WORKSPACE.md` (excerpt — only the field this AIP cares
about):

```yaml
---
schema: workspace/v1
id: "@acme/billing-v2"
name: Billing v2
owner: { kind: company, slug: acme }
work: { file: work/WORK.md }
---
```

Layout on disk:

```
projects/billing-v2/
├── WORKSPACE.md
└── work/
    ├── WORK.md
    ├── collections/
    │   ├── work-item/COLLECTION.md    # vendored copy of the normative base
    │   └── bug/COLLECTION.md
    ├── items/
    │   ├── initiative/init-01jc8wyyaa.md
    │   ├── task/t-01jc8x2k4r.md
    │   ├── task/t-01jc8wz0aa.md
    │   └── bug/bug-01jc90f1zz.md
    ├── audit/audit-log.jsonl
    └── .work/                 # gitignored
        ├── locks/
        └── leases/task/t-01jc8x2k4r.json
```

---

## 2. `WORK.md`

```yaml
---
schema: work.workspace/v2
name: billing-v2-work
title: Billing v2 work
description: |
  Work tracked for the billing-v2 project: initiatives, tasks, and
  bug reports. Verification gates on task done; approvals route
  through the billing engineering lead.

collections:
  - ref: ws://collections/task
  - ref: ws://collections/initiative
  - ref: ./collections/bug/COLLECTION.md

containment:
  allowedParents:
    task: [initiative, task]
    bug: [initiative]
    initiative: []
  maxDepth: 3

statusRollup:
  enabled: true
  rules:
    - { when: all-children-terminal, category: done }
    - { when: any-child-waiting,     category: waiting }
    - { when: any-child-blocked,     category: active }
    - { when: no-children,           category: todo }

coordination:
  leaseTtlSeconds: 0
  lockStaleSeconds: 30

lints:
  - { id: dangling-blockedby, kind: dangling-dependency, severity: warn, params: {} }
  - { id: stale-active-14d,   kind: stale,               severity: warn, params: { days: 14 } }

defaults:
  auditMutations: true

views:
  - id: active
    title: In flight
    filter: { category: [active, waiting] }
    groupBy: owner
    layout: board
  - id: triage
    title: Unclaimed bugs
    filter: { collection: bug, category: [todo] }
    groupBy: status
    layout: list

executor: ws://operators/billing-triage
governance: ../GOVERNANCE.md
knowledge: ws://wikis/billing/KNOWLEDGE.md
---

# Billing v2 work

## Purpose

Tracks the billing-v2 rewrite: the initiative tree, its tasks, and
bug reports filed against the shipped service.

## Conventions

- A `bug` always parents to an `initiative`, never to a `task`.
- `touches` SHOULD name the billing package paths a task or bug will
  edit, so overlapping claims surface early.
- Tasks that touch payment provider calls declare `verify` (a gate),
  never a self-report done.
```

`WORK.md` declares no `extends:`, no `appliesTo:`, no `scope`, no `display`,
no `defaults.approvalClass` — a host loading this file with any of those
present would refuse it with `work_manifest_invalid`.

---

## 3. The `bug` collection

`work/collections/bug/COLLECTION.md` — extends a vendored copy of the
normative [`work-item`](./collections/work-item/COLLECTION.md) base
collection published with this AIP (`work/collections/work-item/COLLECTION.md`
in the layout above — `extends:` is always a relative path, so a host
vendors the base collection's file into the work root rather than naming it
by registry ref), adding two fields and one extra status in the `active`
category.

```yaml
---
schema: collection.schema/v1
name: bug
title: Bug
description: A defect reported against a shipped service.
version: 1.0.0
extends: ../work-item/COLLECTION.md

fields:
  - name: severity
    type: enum
    enum: [low, medium, high, critical]
    required: true
  - name: repro
    type: text
    description: Steps to reproduce.

statuses:
  - { id: triaging, label: Triaging, category: active, transitionsTo: [in-progress, cancelled] }

initialStatus: pending
---

# Bug

## Conventions

New reports land in `pending`. A manager moves a report to
`triaging` before anyone claims it, to attach `severity`; `claim`
then moves it to `in-progress` as usual. Severity `critical` MUST
carry a `verify` gate — no self-reported done on a critical fix.
```

`pending`, `in-progress`, `awaiting-approval`, `done`, `failed`, `cancelled`
are inherited unchanged from `work-item`, as required; `triaging` is new and
sits in the `active` category alongside `in-progress`.

---

## 4. Items through the protocol

### 4.1 Pending — unclaimed, pre-assigned nothing

`items/task/t-01jc8wz0aa.md`:

```yaml
---
schema: collection.item/v1
collection: task
id: t-01jc8wz0aa
title: Design the webhook retry schema
status: pending
rev: 1

createdBy: operator:billing-triage
sessions: []
runs: []

parent: initiative/init-01jc8wyyaa
blockedBy: []
touches: ["packages/billing/src/webhooks/**"]

approvals: []
artifacts: []

verify: null
verification: null
lastVerifyError: null

closeReason: null
releaseReason: null
reopenedBy: null
note: null
provenance: {}

createdAt: "2026-10-17T09:00:00Z"
updatedAt: "2026-10-17T09:00:00Z"
closedAt: null
---

Design the retry/backoff schema for outbound webhook delivery.
```

Note there is no `owner` key at all — absence, not `null`, is what makes an
item claimable.

### 4.2 Claimed, in progress

`items/task/t-01jc8x2k4r.md` after `claim("task/t-01jc8x2k4r", rev: 2)` by
`session:sess_4117b2b0`:

```yaml
---
schema: collection.item/v1
collection: task
id: t-01jc8x2k4r
title: Wire the billing webhook
status: in-progress
rev: 3

owner: session:sess_4117b2b0
createdBy: host
sessions: [sess_4117b2b0]
runs: [run_01jc9a2f00]

parent: initiative/init-01jc8wyyaa
blockedBy: [task/t-01jc8wz0aa]
touches: ["packages/billing/src/webhooks/**"]

approvals: []
artifacts:
  - { run: run_01jc9a2f00, key: out/diff.patch }

verify: { command: pnpm, args: [test, --filter, "@acme/billing"] }
verification: null
lastVerifyError: null

closeReason: null
releaseReason: null
reopenedBy: null
note: "Blocked task not yet done; starting the HTTP client wiring in parallel."
provenance: { prUrl: "https://github.com/acme/billing-v2/pull/42" }

createdAt: "2026-10-17T09:05:00Z"
updatedAt: "2026-10-17T14:40:00Z"
closedAt: null
---

Wire the retry/backoff client into the outbound webhook sender.
```

The coordinator wrote `rev: 3` — `2` was consumed by the claim itself, and a
later `update` (the `note`/`artifacts`/`runs` edit above) consumed one more.
`blockedBy` listing a non-terminal item is informational: the task was
claimed and started anyway, and a reader surfaces it as derived `blocked`.

### 4.3 Awaiting approval, with a linked request

A `critical` bug fix needing a human sign-off before deploy.
`items/bug/bug-01jc90f1zz.md`:

```yaml
---
schema: collection.item/v1
collection: bug
id: bug-01jc90f1zz
title: Webhook signature check bypassable with empty header
status: awaiting-approval
rev: 5
severity: critical
repro: |
  Send a webhook POST with an empty X-Signature header; the current
  check short-circuits to valid on empty input.

owner: session:sess_4117b2b0
createdBy: user:jeremy
sessions: [sess_4117b2b0]
runs: [run_01jc9b1100]

parent: initiative/init-01jc8wyyaa
blockedBy: []
touches: ["packages/billing/src/webhooks/verify.ts"]

approvals: [apr_01jc9c]
artifacts:
  - { run: run_01jc9b1100, key: out/patch.diff }

verify: { command: pnpm, args: [test, --filter, "@acme/billing", --, verify.test.ts] }
verification: null
lastVerifyError: null

closeReason: null
releaseReason: null
reopenedBy: null
note: "Fix ready, needs sign-off before merge given it touches auth."
provenance: { prUrl: "https://github.com/acme/billing-v2/pull/51" }

createdAt: "2026-10-17T10:10:00Z"
updatedAt: "2026-10-17T15:00:00Z"
closedAt: null
---

Patch closes the empty-header bypass. Needs a human eye on the
security-sensitive diff before it lands.
```

The linked `apr_01jc9c` approval request (AIP-7, not AIP-20):

```json
{
  "doctype": "approval-request",
  "id": "apr_01jc9c",
  "kind": "deploy",
  "title": "Sign off: webhook signature bypass fix",
  "payloadHash": "9b1c2f7a4e0d6b3c8f1a2d5e7c9b0a4f3d6e8c1b5a7f9d2e4c6a8b0d3f5e7c9b",
  "status": "pending",
  "requestedBy": { "sessionId": "sess_4117b2b0" },
  "channels": ["slack:#billing-approvals"],
  "requestedAt": "2026-10-17T15:00:00Z",
  "taskId": "bug/bug-01jc90f1zz"
}
```

### 4.4 Gated done, with verification

Once the gate in `verify` passes, the coordinator (not the caller) moves the
task to `done` and stamps `verification`:

```yaml
---
schema: collection.item/v1
collection: task
id: t-01jc8x2k4r
title: Wire the billing webhook
status: done
rev: 9

owner: session:sess_4117b2b0
createdBy: host
sessions: [sess_4117b2b0]
runs: [run_01jc9a2f00, run_01jc9a3300]

parent: initiative/init-01jc8wyyaa
blockedBy: [task/t-01jc8wz0aa]
touches: ["packages/billing/src/webhooks/**"]

approvals: []
artifacts:
  - { run: run_01jc9a3300, key: out/test-report.json }

verify: { command: pnpm, args: [test, --filter, "@acme/billing"] }
verification: { kind: gate, policyId: null, exitCode: 0, ts: "2026-10-17T15:02:11Z" }
lastVerifyError: null

closeReason: null
releaseReason: null
reopenedBy: null
note: null
provenance: { prUrl: "https://github.com/acme/billing-v2/pull/42" }

createdAt: "2026-10-17T09:05:00Z"
updatedAt: "2026-10-17T15:02:11Z"
closedAt: "2026-10-17T15:02:11Z"
---

Wire the retry/backoff client into the outbound webhook sender.
```

The `update {status: done}` call that preceded this got back
`{ok: true, verifying: true}` and the item stayed `in-progress` until the
gate finished — this file is the *outcome*, written by the coordinator, not
by the caller's own write.

### 4.5 Released, with `releaseReason`

The owning session of `task/t-01jc8wz0aa` crashed mid-work; the issuing
host's liveness sweep released it back to `pending`:

```yaml
---
schema: collection.item/v1
collection: task
id: t-01jc8wz0aa
title: Design the webhook retry schema
status: pending
rev: 4

createdBy: operator:billing-triage
sessions: [sess_3f9a0c21]
runs: []

parent: initiative/init-01jc8wyyaa
blockedBy: []
touches: ["packages/billing/src/webhooks/**"]

approvals: []
artifacts: []

verify: null
verification: null
lastVerifyError: null

closeReason: null
releaseReason: owner-exited
reopenedBy: null
note: null
provenance: {}

createdAt: "2026-10-17T09:00:00Z"
updatedAt: "2026-10-17T16:20:00Z"
closedAt: null
---

Design the retry/backoff schema for outbound webhook delivery.
```

`owner` is absent again — `releaseReason` is the only trace that this item
was once claimed and lost its claimant; `sessions` still remembers who.

---

## 5. Lease file

`.work/leases/task/t-01jc8x2k4r.json`, written when the claim in §4.2
happened, deleted the moment the task leaves `active` (by `done`, release,
or cancel):

```json
{
  "item": "task/t-01jc8x2k4r",
  "owner": "session:sess_4117b2b0",
  "host": "studio-mac",
  "claimedAt": "2026-10-17T09:10:00Z",
  "renewedAt": "2026-10-17T09:10:00Z",
  "ttlSeconds": 0
}
```

`ttlSeconds: 0` means only the issuing host (`studio-mac`) ever releases it,
on observed session death — no other coordinator times it out.

---

## 6. Audit log

`audit/audit-log.jsonl` — one JSON line per applied write or system
transition, in the order they happened (newline-delimited, append-only):

```jsonl
{"action":"work.item.created","actor":"operator:billing-triage","entity":"task/t-01jc8wz0aa","input":{"fromRev":0,"toRev":1,"changes":{}}}
{"action":"work.item.claimed","actor":"session:sess_4117b2b0","entity":"task/t-01jc8x2k4r","input":{"fromRev":2,"toRev":3,"changes":{"status":["pending","in-progress"],"owner":[null,"session:sess_4117b2b0"]}}}
{"action":"work.item.updated","actor":"session:sess_4117b2b0","entity":"task/t-01jc8x2k4r","input":{"fromRev":3,"toRev":4,"changes":{"note":[null,"Blocked task not yet done; starting the HTTP client wiring in parallel."]}}}
{"action":"work.item.approval-linked","actor":"session:sess_4117b2b0","entity":"bug/bug-01jc90f1zz","input":{"fromRev":4,"toRev":5,"changes":{"status":["in-progress","awaiting-approval"],"approvals":[[],["apr_01jc9c"]]}}}
{"action":"work.item.verify-passed","actor":"host","entity":"task/t-01jc8x2k4r","input":{"fromRev":8,"toRev":9,"changes":{"status":["in-progress","done"]}}}
{"action":"work.item.released","actor":"host","entity":"task/t-01jc8wz0aa","input":{"fromRev":3,"toRev":4,"changes":{"status":["in-progress","pending"],"owner":["session:sess_3f9a0c21",null]}}}
```

An item's history is this log filtered by `entity`; `actor: host` on the
last two lines marks them as system transitions, not calls from an external
principal.

---

## 7. Conflict response

Two sessions both read `task/t-01jc8wz0aa` at `rev: 1` and both attempt to
`claim` it. The first write lands and bumps `rev` to `2`. The second
claimant's call:

```ts
claim({ ref: "task/t-01jc8wz0aa", rev: 1 }, caller: "session:sess_9c0a1b2d")
```

gets back:

```json
{
  "ok": false,
  "conflict": true,
  "current": {
    "schema": "collection.item/v1",
    "collection": "task",
    "id": "t-01jc8wz0aa",
    "title": "Design the webhook retry schema",
    "status": "in-progress",
    "rev": 2,
    "owner": "session:sess_3f9a0c21",
    "...": "..."
  }
}
```

No error code, no partial write — the file was never touched by the losing
call. The losing session's caller is expected to inspect `current` (it's now
owned, not `pending`) and move on to a different item rather than retry.

---

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- [`./collections/`](./collections) — the normative `work-item` base
  collection plus the `task` and `initiative` starters
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side authoring skill
- [`./WORK.schema.json`](./WORK.schema.json) — frontmatter validator
