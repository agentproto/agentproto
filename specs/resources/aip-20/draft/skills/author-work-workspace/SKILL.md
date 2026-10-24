---
schema: skill/v1
name: author-work-workspace
title: Author a WORK.md work root and work it through the AIP-20 protocol
description:
  Set up a new AIP-20 work root for a project node — a WORK.md manifest, a
  collection extending the normative work-item base, and the initial items —
  then work items through the coordination protocol (claim with rev, link
  approvals, never edit item frontmatter directly). Covers both authoring a
  new root and adding a collection or items to an existing one.
version: 2.0.0
tags: [aip-20, work, coordination, manifest, agentproto, collections, claim]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing the goal (e.g. "set up work tracking for a new
      project", "add a bug collection to the existing work root", "claim and
      finish task t-01jc8x2k4r"). The skill picks the right section based on
      this.
  - name: nodeDir
    type: string
    required: true
    description:
      Absolute path to the AIP-34 workspace node (the directory holding
      WORKSPACE.md) whose work this concerns.
  - name: workRootDir
    type: string
    required: false
    description:
      Absolute path to the work root (holding WORK.md). Defaults to
      `<nodeDir>/work`. Required only if the node's WORKSPACE.md doesn't
      already declare `work:`.
  - name: itemRef
    type: string
    required: false
    description:
      "`<collection>/<id>` of an existing item, when the intent is to claim,
      update, or otherwise work an item rather than author the root."
examples:
  - input:
      intent: Set up work tracking for the billing-v2 project.
      nodeDir: /repo/projects/billing-v2
    output:
      - /repo/projects/billing-v2/work/WORK.md (created)
      - /repo/projects/billing-v2/WORKSPACE.md (edited — work: field added)
  - input:
      intent: Add a bug collection extending work-item to the existing root.
      nodeDir: /repo/projects/billing-v2
      workRootDir: /repo/projects/billing-v2/work
    output:
      - /repo/projects/billing-v2/work/collections/bug/COLLECTION.md (created)
      - /repo/projects/billing-v2/work/WORK.md (edited — collections[] entry added)
  - input:
      intent: Claim task t-01jc8x2k4r and move it to done once tests pass.
      nodeDir: /repo/projects/billing-v2
      itemRef: task/t-01jc8x2k4r
    output:
      - claim() then update() calls through the coordinator; no direct file edits
---

# Author a `WORK.md` work root and work it through the AIP-20 protocol

Use this skill for three related jobs under [AIP-20](/docs/aip-20):
**(A)** stand up a new work root for a project node, **(B)** add a collection
or items to an existing root, or **(C)** work an existing item through the
coordination protocol (claim, update, approve, verify). Jump to
[Part A](#part-a-stand-up-a-new-work-root), [Part B](#part-b-add-a-collection-or-items),
or [Part C](#part-c-work-an-item-through-the-protocol) based on `intent`.

**Critical ground rules, true in every part:**

- A project (or any AIP-34 node) is **not** a work item. AIP-20 starts at the
  node's `work:` boundary; the node itself is AIP-34's concern.
- `WORK.md` has no `extends:`, no `appliesTo:`, no view mode, no `scope`, no
  `display`, no `defaults.approvalClass`. One manifest per node. Per-context
  lenses are `views:` — saved queries, not a second manifest.
- Every work collection MUST extend the normative `work-item` base collection
  (fields, categories, base statuses). Never redeclare `work-item`'s fields
  or remove its base statuses — extend, add, never strip.
- **Once a coordinator serves a root, item frontmatter is not a file you
  hand-edit.** Every mutation is a verb call (`create`, `claim`, `update`,
  `link-approval`) that takes the lock, checks `rev`, writes atomically, and
  audits. A hand edit is only legitimate as an "external edit" the
  coordinator reconciles on next read (§4.7 of the spec) — it is not a
  sanctioned authoring path.

## When to use

- "Set up work tracking for `<project>`."
- "Add a `bug`/`okr`/`epic` collection on top of the existing tracker."
- "Claim this task and work it to done."
- "File a bug and link it to an approval request."
- "A session died mid-claim — what happens to its task?" (read Part C, §C.4)

## When NOT to use

- The user wants to design **AIP-18 field/status shape** in the abstract,
  unrelated to a work root — that's AIP-18's own authoring skill.
- The user wants to **change the AIP-20 spec itself** — that's governance,
  not authoring.
- The user wants to **bypass the coordinator** and hand-edit an item file
  while a coordinator is running against the root — refuse, and explain the
  external-edit reconciliation path instead (ADAPTER.md §11).

---

## Part A — stand up a new work root

### A.1 Confirm the node and wire `work:`

Read the node's `WORKSPACE.md`. If it already has a `work:` field, use that
path as `workRootDir` and skip to A.2. Otherwise add:

```yaml
work: { file: work/WORK.md }
```

(conventionally `work/WORK.md` relative to the node). Only add this one
field — do not touch anything else on `WORKSPACE.md`.

### A.2 Scaffold the layout

```
<workRootDir>/
├── WORK.md
├── collections/            # local collections, if any
├── items/                  # created lazily, one dir per collection
├── audit/audit-log.jsonl   # starts empty
└── .work/                  # add to .gitignore — never commit
```

Add `.work/` to the node's (or repo's) `.gitignore` before anything is
written under it.

### A.3 Decide collections

For each kind of work this root will track, decide: reuse a registry
collection (`ws://collections/task`), vendor + extend the normative
`work-item` base locally (see [Part B](#part-b-add-a-collection-or-items)),
or both. A root needs at least one collection; `task` from the registry is
the common starting point.

### A.4 Write `WORK.md`

```yaml
---
schema: work.workspace/v2
name: <kebab-case-id>
title: <human-readable>
description: <one paragraph — what this root tracks, for whom>

collections:
  - ref: ws://collections/task

containment:
  allowedParents:
    task: []
  maxDepth: 5

statusRollup:
  enabled: false

coordination:
  leaseTtlSeconds: 0
  lockStaleSeconds: 30

defaults:
  auditMutations: true

views:
  - id: active
    title: In flight
    filter: { category: [active, waiting] }
    groupBy: owner
    layout: board
---

# <title>

## Purpose

What this root tracks, who claims from it.

## Conventions

When an item belongs in one collection vs another; containment rules in
plain language.
```

Guidance per field:

- **`collections[]`** — same three forms as AIP-18 (inline, file ref,
  registry), with the AIP-20 constraint that every resolved collection MUST
  extend `work-item`. An entry that doesn't is refused with
  `work_collection_not_work_item` — don't point at an arbitrary AIP-18
  collection.
- **`containment.allowedParents`** — map child collection → list of allowed
  parent collections. An empty list means "no parent allowed", not "any
  parent" — leave the key out entirely to allow any enabled collection as
  parent.
- **`statusRollup.rules`** — only meaningful once there's a containment
  tree worth rolling up; leave `enabled: false` for a flat root.
- **`coordination.leaseTtlSeconds: 0`** (the default) means only the host
  that issued a claim ever releases it, on observed session death — set a
  positive TTL only if you actually want cross-host timeout release.
- **`views[]`** — saved queries for consumers. The first one is the
  default. These never change which collections are tracked or any
  protocol rule — if you find yourself wanting a view to narrow
  `collections[]`, that's a different root, not a view.
- **`executor` / `governance` / `knowledge`** — optional cross-AIP refs;
  each MUST resolve inside the node's own tenant or the root is refused
  with `work_xref_unresolvable`. Don't bind to something that doesn't
  exist yet.

Do NOT add `extends`, `appliesTo`, `scope`, `display`, or
`defaults.approvalClass` — these belong to the retired draft and a
conforming host refuses them with `work_manifest_invalid`.

### A.5 Validate

```bash
npx ajv validate -s <path-to>/WORK.schema.json -d "<workRootDir>/WORK.md"
```

Then confirm every `collections[]` entry resolves and extends `work-item`,
every `containment.allowedParents` key/value names a tracked collection, and
every cross-AIP ref resolves.

---

## Part B — add a collection or items

### B.1 Extending `work-item`

Never redeclare `work-item`'s fields or base statuses (`pending`,
`in-progress`, `awaiting-approval`, `done`, `failed`, `cancelled`) — AIP-18's
drift refusals (`collection_field_removed`, `collection_status_removed`)
exist precisely to stop this. Vendor a copy of the normative
`work-item/COLLECTION.md` into the work root's `collections/` (since
`extends:` is a relative path, not a registry ref), then write the new
collection beside it:

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

statuses:
  - { id: triaging, label: Triaging, category: active, transitionsTo: [in-progress, cancelled] }

initialStatus: pending
---
```

Every status you add MUST carry a `category` (`work-item` requires it on
every status, not just the base ones) — a status without one makes the
protocol unable to reason about the item at all.

Add the collection to `WORK.md`'s `collections[]` (file ref to the new
`COLLECTION.md`) and, if it has a parent relationship, to
`containment.allowedParents`.

### B.2 Creating items

Items are created through the `create` verb, never by writing a file into
`items/<collection>/` by hand:

```ts
create({
  collection: "bug",
  title: "Webhook signature check bypassable with empty header",
  severity: "critical",
  parent: "initiative/init-01jc8wyyaa",
  touches: ["packages/billing/src/webhooks/verify.ts"],
})
// -> { ok: true, item: { ...rev: 1, status: "pending", createdBy: <caller>, ... } }
```

The coordinator stamps `id`, `rev: 1`, `status` (the collection's
`initialStatus`), `createdBy` (the caller), and the timestamps. Don't invent
an `id` or a `rev` yourself.

---

## Part C — work an item through the protocol

### C.1 Claim

```ts
const current = await get("task/t-01jc8x2k4r")
if (current.owner) { /* already claimed — pick another item */ }
const result = await claim({ ref: "task/t-01jc8x2k4r" }, current.rev)
if (result.conflict) { /* someone else won the race — re-read and move on */ }
```

Always read first to get the current `rev`; always handle `conflict` by
re-reading, never by retrying the same `rev` blindly.

### C.2 Update, release, reassign

```ts
update({ ref, rev }, { note: "Blocked task not done; starting in parallel." })
update({ ref, rev }, { owner: null })               // release — no status change in the same call
update({ ref, rev }, { status: "failed" })          // owner or manager only
```

Reassigning or clearing `owner`, editing `title`/`body`/`blockedBy`/`parent`,
cancelling, and reopening are manager-only (the item's `createdBy`, `host`,
or a principal the bound governance grants `work.manage`). Everything else
(`status` within the legal moves, `note`, `approvals`, `artifacts`, `runs`,
`touches`, `provenance`) is owner territory.

### C.3 Approvals and verification

```ts
// request a human decision, then link it:
const approvalId = await requestApproval({ taskId: ref, kind: "deploy", payload })
await linkApproval(ref, approvalId)   // no rev — idempotent; moves to awaiting-approval

// a done gate:
create({ collection: "task", title: "...", verify: { command: "pnpm", args: ["test"] } })
// later:
update({ ref, rev }, { status: "done" })   // -> { ok: true, verifying: true }; item stays active
// the coordinator settles it to done (pass) or leaves it active with lastVerifyError (fail)
```

Don't call `update {status: done, evidence: {...}}` unless the host can
independently confirm the cited policy already passed — the evidence
shortcut is not a way to self-certify.

### C.4 When a claimant disappears

Do nothing by hand. The issuing host's liveness sweep releases a
`session:`-owned item back to `todo` on observed session death (or at its
own restart), sets `releaseReason`, and bumps `rev` — this is a system
transition, not something a caller requests. An item in a `waiting` category
is never released this way; a human decision may still be outstanding.

---

## Final checklist

- [ ] `WORK.md` has `schema: work.workspace/v2`, `name`, `title`,
      `description`; no `extends`, `appliesTo`, `scope`, `display`, or
      `defaults.approvalClass`.
- [ ] Every `collections[]` entry resolves and extends `work-item` (or is
      `work-item` itself).
- [ ] Any new/extended collection keeps every inherited field and base
      status; every status (inherited or new) carries a `category`.
- [ ] `containment.allowedParents` only names tracked collection names.
- [ ] `executor` / `governance` / `knowledge`, if set, resolve inside the
      node's own tenant.
- [ ] `.work/` is gitignored; nothing under it is ever committed.
- [ ] No item file was hand-edited while a coordinator serves the root —
      every mutation went through `create` / `claim` / `update` /
      `link-approval`.
- [ ] Every write that could race (claim, update) read `rev` first and
      handles `conflict` by re-reading, not by blind retry.

## Output

Reply with:

1. The files written or edited (`WORK.md`, any `COLLECTION.md`, the node's
   `WORKSPACE.md` if `work:` was added).
2. The collections registered, each with its `extends:` chain down to
   `work-item`.
3. For Part C work: the verb calls made, in order, with the `rev` each one
   consumed and the resulting `status`/`owner`.
4. Any assumption made (containment depth, lease TTL, which fields are
   owner- vs manager-only beyond the spec default) that the user might want
   to change.

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — collection authoring
  this skill composes on
- [AIP-7 — governance, approval, audit](/docs/aip-7) — approval requests,
  `work.manage` grants
- [AIP-34 — WORKSPACE.md](/docs/aip-34) — the node's `work:` field
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide (the
  coordinator side of every verb used above)
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — full worked example of a work
  root, a collection, and items through every stage
- [`../../WORK.schema.json`](../../WORK.schema.json) — frontmatter validator
