# ADAPTER.md — implementing AIP-20 in a host runtime

This document is the implementer's guide for a **coordinator**: the process
that loads a `WORK.md` work root and serves the write verbs of
[AIP-20](/docs/aip-20) over the item files in it. It is normative for the
parts marked MUST and informative for the parts marked SHOULD.

The audience is a runtime author — someone shipping a `TaskStore`-shaped
component (the reference one is the agentproto daemon's task ledger, moved
onto files). Authors who just want to write a `WORK.md` and work items by
hand should read
[`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
instead.

## Contract overview

A conforming coordinator implements four responsibilities:

1. **Load `WORK.md`** — parse, validate against
   [`./WORK.schema.json`](./WORK.schema.json), resolve `collections[]` through
   [AIP-18](/docs/aip-18), and refuse anything carrying a field from the
   retired design (§1 below).
2. **Serve the write verbs** — `create`, `get`, `list`, `claim`, `update`,
   `link-approval` — over `items/<collection>/<id>.md`, enforcing the rev CAS,
   the lock discipline, rights, and the category state machine on every write
   (§2–§5).
3. **Run the lease and liveness sweep** — release claims owned by dead
   sessions (§6).
4. **Append the audit trail** — one [AIP-7](/docs/aip-7) `audit-event` per
   applied write or system transition, in the same lock as the item write
   (§7).

Everything here operates on **files**: `items/<collection>/<id>.md` inside one
work root. A coordinator that keeps its own in-memory index MUST treat the
files as the source of truth and rebuild the index from them, never the
reverse.

## 1. Loading `WORK.md`

1. **Parse the frontmatter** as YAML. Validate against
   [`./WORK.schema.json`](./WORK.schema.json). On failure, surface
   `work_manifest_invalid` with the failing field path.
2. **Refuse retired fields.** `WORK.md` has no `extends:`, no `appliesTo:`, no
   view mode, no `scope`, no `display`, no `defaults.approvalClass`. A
   manifest carrying any of these MUST be refused with
   `work_manifest_invalid` — do not silently drop the field, and do not try to
   interpret it as the pre-rewrite draft did. There is exactly one `WORK.md`
   per node; there are no per-consumer views of it (consumers get `views:`,
   §9 below).
3. **Resolve `collections[]`.** For each entry, resolve per
   [AIP-18](/docs/aip-18)'s order: inline → local file → registry.
   - Compute the effective name (`alias` if set, else the resolved
     collection's `name`). Two entries resolving to the same effective name
     are refused with `work_collection_alias_conflict`.
   - Walk the resolved collection's own `extends:` chain (AIP-18's, not
     AIP-20's — AIP-20 collections don't chain against each other, they chain
     against `work-item`). If `work-item` is not in the chain and the
     collection is not `work-item` itself, refuse with
     `work_collection_not_work_item`.
   - A versioned ref (`{ ref, version: "1.x" }`) pins the schema version
     range; a resolved collection outside the range is refused per AIP-18's
     pinned-drift vocabulary.
4. **Validate `containment.allowedParents`.** Keys and values MUST name
   effective collection names from step 3. This is checked at manifest load
   so a bad key fails fast rather than at the first item write.
5. **Validate cross-AIP refs** — `executor`, `governance`, `knowledge`. Each
   MUST resolve inside the node's own tenant; an unresolvable ref is refused
   with `work_xref_unresolvable`.
6. **Validate `views[]`.** Each view's `filter` keys MUST be a subset of
   `{collection, status, category, owner, parent, blocked, includeClosed}`;
   `groupBy` and `layout` MUST be one of the enumerated values (§9 of the
   spec). The first view is the default. Views are saved queries only — a
   host MUST NOT let a view change which collections are tracked or weaken
   any protocol rule; that is the whole point of dropping view mode.
7. **Register `coordination` tunables.** `leaseTtlSeconds` (default `0`) and
   `lockStaleSeconds` (default `30`) are read once at load and apply to every
   item in the root.

The host MUST NOT execute any code found in `WORK.md`; it is data.

## 2. Item files and the work root layout

```
work/
├── WORK.md
├── collections/<name>/COLLECTION.md     # local collections (optional)
├── items/<collection>/<id>.md           # one item per file — normative
├── audit/audit-log.jsonl                # AIP-7 audit chain, this root's scope
└── .work/                               # coordinator state, NOT committed
    ├── locks/<collection>/<id>.lock
    └── leases/<collection>/<id>.json
```

The filing rule `items/<collection>/<id>.md` is normative — the protocol
addresses items by path, not by an index. If a collection declares AIP-18
`identity.filingPath`, the host MUST refuse to register it in a work root
unless that template equals `items/{collection}/{id}.md`.

`id` MUST match `^[a-z0-9][a-z0-9-]{0,63}$` and be unique **within the work
root**, not only within its collection — the coordinator MUST check this
across all registered collections' `items/` directories, because `create`'s
`work_id_taken` check is root-scoped.

An **item ref** is `<collection>/<id>` for a local item, or
`ws://workspaces/<node-id>#work/<collection>/<id>` for a cross-root ref (only
legal for `blockedBy`, and only when the target node exports its work root to
the caller's node).

## 3. The write algorithm

Every verb except `get` and `list` goes through this sequence. `create` and
`link-approval` skip the rev check (§3.2, §3.6) but otherwise follow the same
lock → write → audit → unlock shape.

### 3.1 Lock

```ts
async function withItemLock<T>(
  root: WorkRoot, collection: string, id: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockPath = `${root}/.work/locks/${collection}/${id}.lock`
  while (true) {
    try {
      await fs.open(lockPath, "wx") // O_CREAT|O_EXCL
      break
    } catch (e) {
      if (e.code !== "EEXIST") throw e
      const stat = await fs.stat(lockPath).catch(() => null)
      if (stat && ageSeconds(stat) > root.coordination.lockStaleSeconds) {
        await fs.unlink(lockPath).catch(() => {}) // break a stale lock
        continue
      }
      await backoff()
    }
  }
  await fs.writeFile(lockPath, JSON.stringify({ host, pid, acquiredAt: now() }))
  try {
    return await fn()
  } finally {
    await fs.unlink(lockPath)
  }
}
```

A coordinator that is the *only* writer of a root MAY substitute an
in-process mutex for the fast path, but MUST still create and honour the
lock file, because a second coordinator (another host, a CLI) may be writing
the same root concurrently. Readers never take the lock: rename atomicity
(§3.3) guarantees a reader observes either the pre-write or the post-write
file, never a partial one.

### 3.2 Read and check

```ts
const current = await readItem(path) // parse + AIP-18 validate
if (verb !== "create" && verb !== "link-approval") {
  if (current.rev !== input.rev) {
    return { ok: false, conflict: true, current }
  }
}
assertTransitionLegal(current.status, input, collectionSchema) // §4 below
assertRights(caller, current, verb, input)                     // §5 below
const next = applyVerb(current, input)                         // pure merge
assertSchemaValid(next, collectionSchema)                       // AIP-18
```

Any failure here returns `{ ok: false, conflict: false, code, message }` and
takes no further action — the lock is released without a write.

### 3.3 Write (atomic)

```ts
const tmp = `${itemPath}.tmp-${host}-${pid}`
await fs.writeFile(tmp, serialize(next))
await fs.fsync(tmp)         // flush to stable storage before rename
await fs.rename(tmp, itemPath)
// hosts SHOULD also fsync the containing directory, since rename
// durability on some filesystems depends on the directory entry's own flush
```

`next.rev` is the caller's `rev + 1` (or `1` on `create`). The coordinator
never writes `rev` from anywhere but this increment — rev is
coordinator-maintained, full stop.

### 3.4 Audit

Append one AIP-7 `audit-event` line to `<work root>/audit/audit-log.jsonl`
*before* releasing the lock (§7 below), when
`defaults.auditMutations` is `true` (the default; `false` is legal only on a
scratch root).

### 3.5 Unlock

Delete the lock file. If the process crashes between write and unlock, the
next writer finds a stale lock (stat age > `lockStaleSeconds`) and breaks it;
the file on disk is already consistent because the rename in §3.3 already
completed or didn't.

### 3.6 Result shape

```ts
type WorkWriteResult =
  | { ok: true;  item: WorkItem; verifying?: true }
  | { ok: false; conflict: true;  current: WorkItem }
  | { ok: false; conflict: false; code: WorkErrorCode; message: string }
```

A conflict is not an error: the caller is expected to re-read `current` and
retry with its `rev`, not surface a failure to the end user.

## 4. Status categories and legal transitions

The coordinator validates against **categories**, never literal status ids —
a collection may rename or add statuses freely. Base statuses:
`pending`→`todo`, `in-progress`→`active`, `awaiting-approval`→`waiting`,
`done`→`done`, `failed`→`failed`, `cancelled`→`cancelled`.

| From category → to | Who | Verb |
|---|---|---|
| `todo → active` | any caller with write access, item unowned | `claim` only |
| `todo → active` | owner (pre-assigned) | `update` |
| `active → todo` | owner or manager | `update` (release) |
| `active → waiting` | owner or manager; `approvals` non-empty when target is the approval-wait status | `update` / `link-approval` |
| `waiting → active` | owner or manager, or system on approval granted | `update` / system |
| `active → done` | owner or manager, subject to the verify gate | `update` |
| `active → failed` | owner or manager | `update` |
| `todo / active / waiting → cancelled` | manager, or system on approval denied | `update` / system |
| `done → todo` | manager only (reopen) | `update` |
| `failed`, `cancelled` | — | none (final) |

A target status whose category is not reachable from the current category by
this table is refused with `work_invalid_transition`, before the collection's
own (narrower) `transitionsTo` is even consulted. The collection's
`transitionsTo` MAY narrow further (e.g. forbid `in-progress → failed`
directly, requiring `in-review` first) but MUST NOT legalise a move this
table forbids.

Moving an unowned item to an `active` status by `update` (bypassing `claim`)
is refused with `work_unowned_start`.

## 5. Claim

```ts
function claim(ref: ItemRef, rev: number, caller: Principal) {
  return withItemLock(ref, () => {
    const current = readItem(ref)
    if (current.owner !== undefined || current.rev !== rev) {
      return { ok: false, conflict: true, current } // either failure races identically
    }
    if (categoryOf(current.status) !== "todo") {
      return { ok: false, conflict: false, code: "work_not_claimable", message: "..." }
    }
    current.owner = callerRef(caller)
    current.status = firstActiveStatus(collectionOf(current))
    if (caller.kind === "session") current.sessions.push(caller.id)
    current.rev += 1
    current.updatedAt = now()
    writeAtomic(ref, current)
    if (caller.kind === "session") writeLease(ref, caller, current)
    audit("work.item.claimed", caller, ref, { fromRev: rev, toRev: current.rev })
    return { ok: true, item: current }
  })
}
```

Owner-absent and rev-match are checked together so two racing claimants can
never both succeed: whichever write lands first bumps `rev`, and the second
claimant's `rev` no longer matches — it gets a `conflict`, not a silent
double-claim.

Pre-assignment (`create` or a manager `update` setting `owner` on a `todo`
item) is not a claim: the item stays `todo`, its owner has first right to
claim it, but `claim` is still the verb that moves it to `active`.

## 6. Lease and liveness

A claim by a `session:` owner writes `.work/leases/<collection>/<id>.json`:

```json
{ "item": "task/t-01jc8x2k4r", "owner": "session:sess_4117b2b0",
  "host": "studio-mac", "claimedAt": "…", "renewedAt": "…", "ttlSeconds": 0 }
```

Leases are coordinator state, never committed, and a renewal never touches
the item file — that is the whole reason they live outside the frontmatter
(a heartbeat would otherwise be a git diff and a merge conflict every few
seconds).

- **The issuing host** releases the item when its owning session exits, and
  at its own start-up for every lease whose session did not survive the
  restart.
- **Release** = clear `owner`, move an `active` item back to the collection's
  initial `todo` status, set `releaseReason` (`owner-exited` /
  `host-restart`), delete the lease file, bump `rev`, audit
  `work.item.released`.
- An item in a `waiting` category is **never** released by liveness — a
  human decision may still be outstanding and the owner's death doesn't
  cancel it.
- With `coordination.leaseTtlSeconds > 0`, the owning host renews
  `renewedAt` on its own cadence; *any* coordinator serving the root MAY
  release a lease whose `renewedAt` is older than `ttlSeconds`. With the
  default `0`, only the issuing host ever releases, and only on observed
  session death — there is no cross-host timeout race to design for.
- `operator:`, `user:`, `user`, and `host` owners have no lease file and are
  never released automatically; a manager has to reassign or release them by
  hand.

Liveness release can never fail an item into `failed` or `cancelled` — a
released item goes back to `todo`, claimable by anyone, because an item is
intent, not a run; its work may simply be resumed.

```ts
async function sweepDeadLeases(root: WorkRoot) {
  for (const lease of await listLeases(root)) {
    if (!(await sessionIsAlive(lease.owner))) {
      await withItemLock(lease.item, () => releaseItem(lease.item, "owner-exited"))
    }
  }
}
```

Run the sweep at host start-up (covers leases orphaned by a crash) and on
every observed session-exit event thereafter — a coordinator MUST NOT rely
on a polling-only sweep as its sole release path, since a crashed host also
means no poller is running until the *next* host starts.

## 7. Rights

Two roles, no per-field matrix:

- **Owner** — the principal in `owner` (`host`/`user` callers act as owner of
  items owned by `host`/`user` respectively). MAY change `status` within the
  legal moves (§4), release itself, and set `note`, `approvals`,
  `artifacts`, `runs`, `touches`, `provenance`.
- **Manager** — the item's `createdBy`, the `host` principal, or any
  principal the bound [AIP-7](/docs/aip-7) governance grants `work.manage`
  on the root. MAY additionally edit `title`, body, `blockedBy`, `parent`,
  `verify`, reassign or clear `owner`, cancel, and reopen.

`create` and `claim` are open to anyone with write access to the root — they
don't touch another principal's state. A write attempted by a caller who is
neither owner nor manager for that item is refused with `work_forbidden`.

System transitions — liveness release (§6), approval decided (§8), a settled
verify gate (§9) — are not subject to rights at all; they are attributed to
`host` in the audit log because no external caller requested them.

```ts
function assertRights(caller: Principal, item: WorkItem, verb: Verb, input: UpdateInput) {
  if (verb === "create" || verb === "claim") return
  const isOwner = refEquals(item.owner, caller) || (item.owner === "host" && caller.kind === "host") || (item.owner === "user" && caller.kind === "user")
  const isManager = refEquals(item.createdBy, caller) || caller.kind === "host" || governanceGrants(caller, "work.manage")
  const ownerFields = new Set(["status", "note", "approvals", "artifacts", "runs", "touches", "provenance"])
  const managerOnlyFields = new Set(["title", "body", "blockedBy", "parent", "verify", "owner"])
  const touched = changedFields(input)
  if (touched.some((f) => managerOnlyFields.has(f)) && !isManager) {
    throw workError("work_forbidden")
  }
  if (touched.some((f) => ownerFields.has(f)) && !isOwner && !isManager) {
    throw workError("work_forbidden")
  }
}
```

## 8. Path claims (`touches`)

`touches` is advisory, never enforced as a lock. At `claim` time, compare the
claimant's intended `touches` globs (carried on `create`, or already present
on the item) against the `touches` of every other item in the root currently
`active` or `waiting`. On overlap, return the claim as applied but attach a
warning:

```ts
{ ok: true, item, warnings: [{ code: "work_touches_overlap", with: ["task/t-..."] }] }
```

Never refuse a claim, and never take a filesystem lock on the touched paths
themselves — `touches` is a courtesy signal between agents, not mutual
exclusion over the repo.

## 9. Verification (done integrity)

Two tiers, chosen per item by whether it carries `verify`:

- **Tier 0 — no `verify`.** `update {status: done}` applies immediately,
  stamping `verification: {kind: self-report, by, ts}` (or
  `{kind: human, ts}` when the caller is `user`/`host`). Visible as
  self-reported in every reader, never silently indistinguishable from a
  gated done.
- **Tier 1 — `verify` declared.** `update {status: done}` is *accepted but
  not applied*: respond `{ok: true, verifying: true}`, leave the item in its
  current `active` status, and run the gate out of band.
  - **Pass** → transition to `done`,
    `verification: {kind: gate, policyId?, exitCode?, ts}`, clear
    `lastVerifyError`.
  - **Fail** → stay `active`, set `lastVerifyError`.
  - Both outcomes bump `rev` and are audited as a system transition
    (`work.item.verify-passed` / `.verify-failed`).
  - A second `done` request while a gate is already running for the same
    item is refused with `work_verify_in_flight`.
  - A gate outcome that arrives after the item left `active` by some other
    path (released, cancelled) is discarded — it no longer describes the
    item's current state.
- **Evidence shortcut.** `update {status: done, evidence: {policyId}}`
  applies `done` immediately **only if the host can independently confirm**
  that `policyId` already passed (e.g. it ran the gate itself and has the
  result on file); otherwise refuse with `work_evidence_not_passed`. A
  coordinator MUST NOT accept a caller's unverified claim that a policy
  passed.

A coordinator that cannot run a declared gate MUST fail it, never pass it by
default, and MUST NOT infer `done` from a session's turn simply ending —
"the agent stopped talking" is not a verification outcome.

```ts
async function settleVerifyGate(ref: ItemRef, gate: VerifySpec) {
  const result = await runGate(gate).catch((e) => ({ passed: false, error: String(e) }))
  await withItemLock(ref, () => {
    const current = readItem(ref)
    if (categoryOf(current.status) !== "active") return // discarded, left active
    if (result.passed) {
      current.status = terminalDoneStatus(collectionOf(current))
      current.verification = { kind: "gate", policyId: gate.policyId, exitCode: result.exitCode, ts: now() }
      current.lastVerifyError = null
      current.closedAt = now()
    } else {
      current.lastVerifyError = result.error
    }
    current.rev += 1
    writeAtomic(ref, current)
    audit(result.passed ? "work.item.verify-passed" : "work.item.verify-failed", "host", ref, {})
  })
}
```

## 10. Approvals

AIP-20 only links [AIP-7](/docs/aip-7) `approval-request` records; it does
not decide them.

1. The owner creates an AIP-7 approval request with `taskId` set to the item
   ref, then calls `link-approval(item, approvalId)` — no `rev` required,
   idempotent. The id is appended to `approvals`; an `active` item moves to
   the collection's approval-wait status. Only the owner or a manager may
   link, and only on an `active` or `waiting` item.
2. An `update` that targets the approval-wait status directly, with
   `approvals` still empty, is refused with `work_approval_required`.
3. On the AIP-7 decision, the coordinator applies a **system transition** to
   every `waiting` item that lists that approval id:
   - `approved` → back to the collection's first `active` status.
   - `denied` → `cancelled`, with `closeReason: denied`.
   - `expired` → no transition; it surfaces on the item for a reader to act
     on, it does not auto-cancel.
   - An item that already left `waiting` by some other path before the
     decision lands is not touched.
4. The owner or a manager MAY leave the wait manually (`waiting → active`)
   or cancel at any time — linking an approval is not a one-way gate on the
   item, only on the decision itself.

Whether a transition *requires* an approval at all is a governance question
answered by the bound `GOVERNANCE.md` (AIP-7 `defaultApproval`, `policy:`
refs), not by AIP-20. The coordinator consults governance before accepting an
`update` into `active → waiting` where governance mandates an approval was
never created, and otherwise only enforces the structural rule in point 2
above.

## 11. External edits

The coordinator records the content hash of every file it writes. On every
read, if the on-disk hash differs from the last one the coordinator itself
wrote, that is an **external edit** — a human, a git pull, or another tool
touched the file outside the protocol:

- If the file still validates against the collection's resolved schema and
  its `rev` is ≥ the coordinator's last known `rev`, adopt it: set
  `rev = max(known, file) + 1`, and append a `work.item.external-edit` audit
  event. The bump guarantees the adopted file's `rev` is still unique going
  forward even though it didn't come from this coordinator's own write path.
- If it does not validate, do **not** load it as an item. Surface
  `work_item_invalid` to any caller, and keep serving the last valid version
  **read-only** (reject all writes to it) until the file is fixed on disk.

Agents and tools MUST NOT edit item frontmatter directly while a coordinator
serves the root — this path exists for humans and git, not as a sanctioned
second write API.

## 12. Git

The item files, the collections, and the audit log are designed to be
committed; `.work/` (locks, leases) is not.

- A work root MUST be read and written through **one authoritative
  checkout**. An agent working in its own git worktree or branch MUST reach
  the board through the coordinator serving the authoritative checkout —
  never by writing its worktree's copy of `items/` directly, or every branch
  ends up with its own board and no coordinator can arbitrate between them.
- `.work/` MUST be listed in `.gitignore` for the work root.
- Coordinators SHOULD batch commits of item and audit files rather than
  commit on every single write — commit-per-write is correct but needlessly
  noisy in history.
- On a merge conflict in an item file: the version with the higher `rev`
  wins automatically. Equal `rev` with different content cannot be
  auto-resolved and surfaces `work_merge_conflict` for a manager to resolve
  by hand.

## 13. Verbs and error codes

| Verb | Input | Notes |
|---|---|---|
| `create` | collection, title, body?, owner?, parent?, blockedBy?, verify?, touches?, provenance? | `status` = collection `initialStatus`; `createdBy` = caller; `rev: 1`. |
| `get` | item ref | |
| `list` | filter: collection?, status?, category?, owner?, parent?, includeClosed? (default false) | Terminal items excluded unless asked. |
| `claim` | item ref, rev | §5. |
| `update` | item ref, rev, and any of: status, title, body, owner (string = reassign, null = release), blockedBy, parent, approvals, artifacts, runs, touches, note, provenance, evidence | Release cannot be combined with a status change in the same call. |
| `link-approval` | item ref, approval id | §10. No `rev` — idempotent. |

Error codes:

| Code | Raised when |
|---|---|
| `work_manifest_invalid` | `WORK.md` fails schema validation, or carries a retired field (§1). |
| `work_collection_alias_conflict` | Two `collections[]` entries resolve to the same effective name. |
| `work_collection_not_work_item` | A resolved collection's `extends:` chain does not include `work-item`. |
| `work_xref_unresolvable` | `executor` / `governance` / `knowledge` does not resolve inside the node's tenant. |
| `work_containment_violation` | An item's `parent` is not listed in `containment.allowedParents[<collection>]`, or exceeds `maxDepth`. |
| `work_not_found` | No item at the given ref. |
| `work_forbidden` | Caller is neither owner nor manager for a field it touched (§7). |
| `work_invalid_transition` | Target status's category is not reachable from the current category (§4), or the collection's own `transitionsTo` forbids it. |
| `work_not_claimable` | `claim` called on an item not in a `todo` status. |
| `work_unowned_start` | `update` tries to move an unowned item to `active` (bypassing `claim`). |
| `work_approval_required` | `update` targets the approval-wait status with `approvals` still empty. |
| `work_verify_in_flight` | A second `done` request while a Tier-1 gate is already running. |
| `work_evidence_not_passed` | Evidence shortcut cites a policy the host cannot independently confirm passed. |
| `work_id_taken` | `create` targets an `id` that already exists anywhere in the work root. |
| `work_item_invalid` | An on-disk item fails schema validation (typically after an external edit). |
| `work_merge_conflict` | A git merge produced two versions of an item at equal `rev` with different content. |

`work_touches_overlap` is not an error code — it is a warning attached to an
otherwise-successful `claim` result (§8).

## 14. Audit event shape

Every applied write and every system transition appends one line to
`<work root>/audit/audit-log.jsonl`, in the same lock as the item write:

```json
{
  "action": "work.item.claimed",
  "actor": "session:sess_4117b2b0",
  "entity": "task/t-01jc8x2k4r",
  "input": { "fromRev": 6, "toRev": 7, "changes": { "status": ["pending", "in-progress"], "owner": [null, "session:sess_4117b2b0"] } }
}
```

`action` is one of `work.item.created`, `.claimed`, `.status` (any write
that changes `status`), `.updated` (other fields only), `.released`,
`.reopened`, `.approval-linked`, `.verify-passed`, `.verify-failed`,
`.external-edit` — exactly one per applied write. `actor` is `host` for every system
transition. An item's history is simply the audit log filtered by `entity`.

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — collections, items,
  status categories this AIP builds on
- [AIP-7 — governance, approval, audit](/docs/aip-7) — `approval-request`,
  `audit-event`
- [AIP-34 — WORKSPACE.md](/docs/aip-34) — the node that owns a work root
- [AIP-46 — agent sessions](/docs/aip-46) — session claimants and liveness
- [AIP-54 — refs](/docs/aip-54) — principal and item ref grammar
- [AIP-58 — RUN](/docs/aip-58) — runs linked from items
- [`./WORK.schema.json`](./WORK.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — concrete manifests and items
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side authoring skill
