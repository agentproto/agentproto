# EXAMPLES.md — collections/v1 reference patterns

Reference collections and items exemplifying common patterns. Each example is a
self-contained snippet a host could load as-is. Authoring agents should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Minimal collection — `tasks`](#example-1--minimal-collection--tasks)
2. [Bug-tracker collection — `bugs`](#example-2--bug-tracker-collection--bugs)
3. [OKR collection — `okrs`](#example-3--okr-collection--okrs)
4. [Composed collection — `eng-bug` extends `bugs`](#example-4--composed-collection--eng-bug-extends-bugs)
5. [Multi-level chain — `incidents` extends `eng-bug` extends `bugs`](#example-5--multi-level-chain--incidents-extends-eng-bug-extends-bugs)
6. [Item examples — a bug item and an OKR item](#example-6--item-examples)
7. [View-mode example — workspace-scoped view](#example-7--view-mode-example--workspace-scoped-view)

---

## Example 1 — Minimal collection — `tasks`

The smallest legal collection: identity + a single string field + a binary
status state machine. Useful for lightweight task tracking where domain-specific
richness is overkill.

```md
---
schema: collection.schema/v1
name: tasks
title: Tasks
description:
  A minimal task collection — title, status, owner. No deadline, no priority.
  Use for lightweight ad-hoc tracking when a fuller spec would be premature.
version: 1.0.0

fields:
  - name: notes
    type: text
    required: false
    description: Free-form prose attached to the task.

statuses:
  - id: todo
    label: To do
    transitionsTo: [in-progress, done]
  - id: in-progress
    label: In progress
    transitionsTo: [todo, done]
  - id: done
    label: Done
    terminal: true
initialStatus: todo

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none

lints:
  - id: orphan
    kind: orphan
    appliesTo: "*"
    severity: info

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md
---

# Tasks

## Purpose

Lightweight task tracking. Items have a title, an optional owner, and a status.
No deadlines, no priority — by design.

## When to use this vs a richer collection

Use `tasks` for ad-hoc work that doesn't need a deadline or a priority signal.
For deadline-driven work, see `okrs`. For defect tracking, see `bugs`.
```

**When to use.** This is the starting point for any new collection. Even if you
eventually need richer fields, shipping the minimal shape first lets you write
items immediately and extend the collection later — every additional field is
purely additive.

---

## Example 2 — Bug-tracker collection — `bugs`

A standard defect-tracking shape: severity enum, repro steps, single assignee,
status state machine with three working states plus two terminal outcomes.

```md
---
schema: collection.schema/v1
name: bugs
title: Bugs
description:
  Defect tracking. Each item captures a reproducible defect with severity, repro
  steps, and an owner accountable for resolution. The status state machine
  encodes the typical triage → fix flow.
version: 1.0.0

fields:
  - name: severity
    type: enum
    enum: [low, medium, high, critical]
    required: true
    description: Impact tier. `critical` items SHOULD page on creation.
  - name: repro
    type: text
    required: true
    description: Minimal repro steps. One numbered list per logical step.
  - name: affectedVersion
    type: string
    required: false
    pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    description: Semver of the version where the bug was first observed.

statuses:
  - id: open
    label: Open
    transitionsTo: [triaged, wontfix]
  - id: triaged
    label: Triaged
    transitionsTo: [in-progress, wontfix]
  - id: in-progress
    label: In progress
    transitionsTo: [fixed, triaged]
  - id: fixed
    label: Fixed
    terminal: true
  - id: wontfix
    label: Won't fix
    terminal: true
initialStatus: open

ownership:
  cardinality: single
  role: assignee
  required: false # bugs may be filed before they have an assignee

deadline:
  kind: none

lints:
  - id: missing-owner-critical
    kind: missing-owner
    appliesTo: "*"
    severity: warn
    params:
      onlyIfFieldEquals:
        field: severity
        value: critical
  - id: stale-30
    kind: stale
    appliesTo: "*"
    severity: info
    params:
      days: 30
  - id: broken-ref
    kind: broken-ref
    appliesTo: "*"
    severity: error

identity:
  slugSource: hash:title,createdAt
  filingPath: items/{collection}/{slug}.md
---

# Bugs

## Purpose

Track defects through triage and resolution. Severity drives escalation; repro
steps drive fix.

## Conventions

- File a bug as soon as a reproducible defect is observed; you don't need to
  know who'll fix it (assignee is optional at creation).
- `repro` is mandatory because a bug without a repro is just a rumour.
- Critical bugs without an assignee surface a `warn` lint — pager / on-call
  owner SHOULD pick them up.
```

**When to use.** This is the canonical shape for any defect tracker. The
severity enum, the repro requirement, and the status state machine are the three
things every bug tracker needs; ship them as a collection so derivative
collections (per-team, per-product) inherit them via `extends:`.

---

## Example 3 — OKR collection — `okrs`

A quarterly objective-and-key-results collection. Multi-owner (co-leads),
target-date deadline, structured key-result fields (metric + target + current
value).

```md
---
schema: collection.schema/v1
name: okrs
title: OKRs
description:
  Quarterly objectives and their key results. Each item is one objective with
  multiple co-owners, a quarter target date, and a structured set of measurable
  key results.
version: 1.0.0

fields:
  - name: objective
    type: text
    required: true
    description: The qualitative objective. One sentence.
  - name: keyResults
    type: array
    required: true
    description: Measurable key results that gate the objective.
    items:
      type: string
  - name: metric
    type: string
    required: true
    description: The single headline metric for the objective.
  - name: target
    type: number
    required: true
    description: Target value for the metric at the end of the quarter.
  - name: current
    type: number
    required: false
    description: Current value of the metric. Updated by the owner each week.
  - name: quarter
    type: string
    required: true
    pattern: "^[0-9]{4}-Q[1-4]$"
    description: ISO-style quarter identifier, e.g. `2026-Q2`.

statuses:
  - id: planning
    label: Planning
    transitionsTo: [active]
  - id: active
    label: Active
    transitionsTo: [achieved, missed, dropped]
  - id: achieved
    label: Achieved
    terminal: true
  - id: missed
    label: Missed
    terminal: true
  - id: dropped
    label: Dropped
    terminal: true
initialStatus: planning

ownership:
  cardinality: multiple
  role: coLeads
  required: true

deadline:
  kind: target-date
  required: true
  fieldName: targetDate

lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: error
  - id: overdue
    kind: overdue
    appliesTo: "*"
    severity: warn
  - id: required-current
    kind: required-field
    appliesTo: "*"
    severity: info
    params:
      field: current

identity:
  slugSource: title
  filingPath: items/{collection}/{quarter}/{slug}.md
---

# OKRs

## Purpose

Quarterly objectives. One headline metric per objective, multiple key results,
multiple co-leads. The target-date deadline and the multi-owner cardinality are
the two non-default knobs.

## Conventions

- Every OKR carries one and only one `metric`. If you need two, file two OKRs.
- `current` is updated weekly; the `required-current` lint surfaces missing
  updates as an `info` finding.
- Co-leads share accountability; mark all of them, not just a primary.
```

**When to use.** When the workspace's planning artefacts have a fixed cadence
(quarterly), measurable outcomes, and shared accountability. The multi-owner
ownership and target-date deadline are non-default; the rest of the schema
follows from those two choices.

---

## Example 4 — Composed collection — `eng-bug` extends `bugs`

A specialised bug collection for the engineering team. Inherits the parent's
fields, statuses, and lints; adds `affectedComponent` as an enum; narrows
`severity` to a subset (no `low` — the team files those as tasks); adds an
engineering-specific lint.

```md
---
schema: collection.schema/v1
name: eng-bug
title: Engineering bugs
description:
  Engineering team's bug collection. Extends the shared `bugs` shape with
  `affectedComponent`, narrows severity (no `low`), and adds an SLA lint for
  `critical`.
version: 1.0.0

extends: ../bugs/COLLECTION.md

fields:
  - name: severity
    type: enum
    enum: [medium, high, critical] # narrowed: dropped 'low'
    required: true
  - name: affectedComponent
    type: enum
    enum: [api, web, mobile, infra, docs]
    required: true
    description:
      Which component the bug lives in. Drives routing to the on-call rota.

lints:
  - id: critical-sla-1h
    kind: stale
    appliesTo: "*"
    severity: error
    params:
      days: 0.04 # ~1 hour
      onlyIfFieldEquals:
        field: severity
        value: critical
---

# Engineering bugs

Engineering's lens on the shared `bugs` collection. Routes by
`affectedComponent`; gates `critical` items behind a 1-hour SLA lint (the
parent's `stale-30` still applies to non-critical).
```

**When to use.** When a team needs a specialised version of a shared collection.
The child narrows what's permissible (no `low` severity), adds a domain-specific
field (`affectedComponent`), and tightens lints (1-hour SLA for `critical`). All
three are permitted refinements: narrowing an enum is a subset operation, adding
a field is purely additive, adding a lint is additive.

**Effective resolved schema** (after merging `bugs` parent into `eng-bug`
child):

| Field / aspect                 | Source                | Value                                          |
| ------------------------------ | --------------------- | ---------------------------------------------- |
| `fields.severity`              | overridden by child   | enum [medium, high, critical]                  |
| `fields.repro`                 | inherited from parent | text, required                                 |
| `fields.affectedVersion`       | inherited from parent | string, optional                               |
| `fields.affectedComponent`     | added by child        | enum [api, web, mobile, infra, docs], required |
| `statuses.*`                   | inherited from parent | open → triaged → in-progress → fixed/wontfix   |
| `ownership.*`                  | inherited from parent | single, role: assignee, optional               |
| `lints.missing-owner-critical` | inherited from parent | warn                                           |
| `lints.stale-30`               | inherited from parent | info                                           |
| `lints.broken-ref`             | inherited from parent | error                                          |
| `lints.critical-sla-1h`        | added by child        | error                                          |
| `identity.*`                   | inherited from parent | hash:title,createdAt                           |

A debug surface query against this child returns the chain
`[../bugs/COLLECTION.md, ./COLLECTION.md]` and the merged config above.

---

## Example 5 — Multi-level chain — `incidents` extends `eng-bug` extends `bugs`

Three-level chain. The shared `bugs` collection is the root; `eng-bug` adds
engineering specifics; `incidents` further specialises for production incidents
— adds an `impactWindow`, narrows status (no `wontfix` for incidents), and binds
the collection to a specific operations workspace via `appliesTo`.

**Level 1** — `<workspace>/collections/bugs/COLLECTION.md` (the same as
[Example 2](#example-2--bug-tracker-collection--bugs)).

**Level 2** — `<workspace>/collections/eng-bug/COLLECTION.md` (the same as
[Example 4](#example-4--composed-collection--eng-bug-extends-bugs)).

**Level 3** — `<workspace>/collections/incidents/COLLECTION.md`:

```md
---
schema: collection.schema/v1
name: incidents
title: Production incidents
description:
  Production incidents. Extends `eng-bug` with `impactWindow` and tighter status
  flow. Bound to the ops workspace.
version: 1.0.0

extends: ../eng-bug/COLLECTION.md

appliesTo:
  - ws://workspaces/ops-tracker

fields:
  - name: impactWindow
    type: array
    required: true
    description:
      ISO datetime pairs marking the start and end of customer impact.
    items:
      type: datetime
  - name: severity
    type: enum
    enum: [high, critical] # further narrowed from [medium, high, critical]
    required: true

statuses:
  - id: open
    label: Open
    transitionsTo: [triaged] # narrowed from parent's [triaged, wontfix]
  # `wontfix` deliberately not redeclared — INHERITED but unused
  # because `open.transitionsTo` no longer reaches it. Existing
  # incident items in `wontfix` (if any) still validate.

ownership:
  required: true # narrowed from parent's required: false

deadline:
  kind: target-date
  required: true
  fieldName: targetResolutionAt

lints:
  - id: incident-postmortem
    kind: required-field
    appliesTo: "*"
    severity: warn
    params:
      field: postmortemUrl
---

# Production incidents

Severity floor of `high`; ownership required at file time; `open` only
transitions to `triaged` (no shortcut to `wontfix`, which remains in the schema
only for legacy items).
```

**Effective config** (after merging all three):

| Field                         | Source            | Value                                                                                                                  |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `fields.severity`             | overridden by L3  | enum [high, critical] (subset of L2's [medium, high, critical], itself a subset of L1's [low, medium, high, critical]) |
| `fields.repro`                | inherited from L1 | text, required                                                                                                         |
| `fields.affectedComponent`    | inherited from L2 | enum [api, web, mobile, infra, docs], required                                                                         |
| `fields.impactWindow`         | added by L3       | array<datetime>, required                                                                                              |
| `statuses.open.transitionsTo` | overridden by L3  | [triaged] (narrowed)                                                                                                   |
| `statuses.wontfix`            | inherited from L1 | terminal (still present, just unreachable from `open` under L3)                                                        |
| `ownership.required`          | overridden by L3  | true                                                                                                                   |
| `deadline.kind`               | overridden by L3  | target-date                                                                                                            |
| `deadline.fieldName`          | overridden by L3  | targetResolutionAt                                                                                                     |
| `lints.critical-sla-1h`       | inherited from L2 | error                                                                                                                  |
| `lints.incident-postmortem`   | added by L3       | warn                                                                                                                   |
| `appliesTo`                   | local to L3       | [ws://workspaces/ops-tracker]                                                                                          |

**When to use.** Multi-level chains demonstrate composability across team /
product / scope axes. `bugs` (org default) → `eng-bug` (team specialisation) →
`incidents` (operational mode). Each level is small (a handful of overrides)
because everything not redeclared inherits mechanically.

The HARD refusals are stress-tested by this example:

- L3 narrows `severity` enum to `[high, critical]` — a subset of L2's
  `[medium, high, critical]`, itself a subset of L1's
  `[low, medium, high, critical]`. **Permitted** (subset chain).
- L3 narrows `open.transitionsTo` to `[triaged]` — narrowing is permitted.
  `wontfix` is still in the resolved schema because L3 didn't try to remove it;
  it's just unreachable from `open`.
- L3 strengthens `ownership.required: true` — narrowing a constraint (false →
  true) is permitted because every parent item that lacks an owner is now a lint
  failure but still loads (the validation gate fires on lint, not on parse).

---

## Example 6 — Item examples

A bug item under the `bugs` collection (Example 2) and an OKR item under the
`okrs` collection (Example 3).

### A bug item

```md
---
schema: collection.item/v1
collection: bugs
id: BUG-1042
title: Login form crashes on Safari 17 with autofill enabled

# Universal-ish fields — collection.ownership says assignee is optional
status: triaged
assignee: ws://operators/eng-frontend-lead
tags: [auth, safari, autofill, regression]
createdAt: 2026-04-26T09:14:00Z
updatedAt: 2026-04-27T11:02:00Z
attachments:
  - sources/2026-04-26-safari-crash-trace.txt

# Collection-specific fields
severity: high
affectedVersion: 4.2.1
repro: |
  1. Open https://app.example.com/login in Safari 17.4.
  2. Have password autofill enabled.
  3. Tap the email field; tap the password field once autofill kicks in.
  4. Observe: page goes white, console shows
     `TypeError: Cannot read properties of null (reading 'addEventListener')`.

metadata:
  example_corp:
    sentry_issue_id: SEN-9482
---

# Login form crashes on Safari 17 with autofill enabled

## Context

Reported via support ticket on 2026-04-26 by three customers within ten minutes
of each other. Sentry triage points at the `useFocusGuard` hook — Safari's
autofill races the React mount and the hook's ref hasn't been set when
`addEventListener` runs.

## Working hypothesis

`useFocusGuard` should defer the listener attach until after mount; current code
runs in `useLayoutEffect` synchronously.

## Resolution path

- [ ] Reproduce locally on Safari 17.4 (Tom — owner).
- [ ] Patch `useFocusGuard` to defer.
- [ ] Add Playwright test against autofill flow.
```

**When to use.** Standard bug-filing flow. Universal fields (`status`,
`assignee`, `tags`, `attachments`, `createdAt`, `updatedAt`) carry the metadata
every bug needs; collection-specific fields (`severity`, `affectedVersion`,
`repro`) carry the domain-specific schema. The body is free-form prose that
humans read; the frontmatter is what the host validates.

### An OKR item

```md
---
schema: collection.item/v1
collection: okrs
id: 2026Q2-runway-extension
title: Extend operating runway by 6 months without raising

# Universal fields
status: active
coLeads:
  - ws://operators/cfo-assistant
  - ws://operators/coo-assistant
tags: [finance, runway]
createdAt: 2026-03-15T00:00:00Z
updatedAt: 2026-04-25T16:00:00Z

# Collection-specific fields
objective: Extend operating runway by 6 months without raising a new round
keyResults:
  - Bridge note from existing lead investor closed by 2026-05-31
  - Q2 monthly burn reduced from $1.4M to $1.1M
  - All non-essential SaaS contracts renegotiated by 2026-06-30
metric: runway_months
target: 18
current: 12.5
quarter: 2026-Q2
targetDate: 2026-06-30
---

# Extend operating runway by 6 months without raising

The Q2 plan: ship a bridge note (existing lead investor) and a recurring-cost
cut, in parallel. Either alone gets to ~15 months; together gets to 18.

## Status check (2026-04-25)

- Bridge — term sheet exchanged, expected close 2026-05-15.
- Burn cut — $200k/mo of $300k/mo target signed off; remaining $100k pending CFO
  review.
- SaaS renegotiation — 4 of 11 contracts done; 7 in flight.
```

**When to use.** Standard OKR-filing flow. The multi-owner `coLeads` field
reflects the collection's `ownership.cardinality: multiple, role: coLeads`. The
required `targetDate` reflects
`deadline.kind: target-date, required: true, fieldName: targetDate`. The
collection's required fields (`objective`, `keyResults`, `metric`, `target`,
`quarter`) are all present; `current` is optional and present here because the
OKR is mid-quarter.

---

## Example 7 — View-mode example — workspace-scoped view

A view that binds an inherited collection to a specific workspace. Demonstrates
the registry-of-views pattern applied to schemas.

The `eng-team-bug` collection extends `bugs` with engineering specialisations
and binds the result to a specific work tracker workspace. Items in that
workspace use `eng-team-bug` as their collection; items in other workspaces
still use the parent `bugs`.

```md
---
schema: collection.schema/v1
name: eng-team-bug
title: Engineering team — bug view
description:
  Engineering team's view of the shared `bugs` collection, bound to the
  eng-tracker workspace. Adds component routing and a 1-hour SLA on `critical`.
  Bound exclusively to the eng-tracker workspace via appliesTo.
version: 1.0.0

extends: ../bugs/COLLECTION.md

appliesTo:
  - ws://workspaces/eng-tracker

fields:
  - name: affectedComponent
    type: enum
    enum: [api, web, mobile, infra, docs]
    required: true

lints:
  - id: critical-sla-1h
    kind: stale
    appliesTo: "*"
    severity: error
    params:
      days: 0.04 # ~1 hour
      onlyIfFieldEquals:
        field: severity
        value: critical
---

# Engineering team — bug view

Eng-tracker's local lens on the shared bugs collection. Outside the eng-tracker
workspace, the parent `bugs` collection applies unchanged.
```

**When to use.** When a team or workspace needs a tighter contract on a shared
collection without forking the registry entry. The view extends the shared base,
adds team-specific fields and lints, and uses `appliesTo` to pin the view to one
workspace. Hosts MUST refuse to register this view in any workspace not in
`appliesTo`.

The pattern matches AIP-10's view-mode for `KNOWLEDGE.md` and AIP-7's view-mode
for `GOVERNANCE.md` — same composition mechanic, applied to a schema doctype.

---

## Anti-patterns to avoid

- **Putting status / ownership / deadline in the universal core.** AIP-18
  deliberately keeps the universal core to `schema`/`collection`/`id`/`title`.
  Reaching for "let's just declare `status` on every item" reintroduces the
  AIP-13 tax — collections that don't have status (research notes, customer
  records) carry a meaningless field. Push status into the collection's schema.
- **Removing inherited fields by omission.** A child whose `fields:` array
  doesn't redeclare a parent field INHERITS the field. To deprecate without
  breaking existing items, set `enabled: false` on the inherited field. Trying
  to delete the field outright surfaces `collection_field_removed`.
- **Removing inherited statuses.** Same shape as field removal. Use
  `terminal: true` and `transitionsTo: []` to mark a status as effectively
  unreachable; do not try to remove it.
- **Widening an enum across composition.** A child enum MUST be a subset of the
  parent's enum. Widening (adding a new value) invalidates parent items if they
  ever loaded against a validator that expected the parent's set. Surface the
  wider set as a NEW enum on a child field with a different name, or ship a v2
  of the parent collection.
- **Filing items outside `identity.filingPath`.** The host MAY refuse items
  whose path doesn't match the template; even when it tolerates them, the
  collection's index and `_log.md` may drift. Honour the filing path or
  redeclare it in the child.
- **Using `metadata.<vendor>` for policy-bearing flags.** Vendor metadata is
  advisory. A flag like `metadata.team.disable_lint` that the host honours is a
  spec violation: the host MUST treat vendor metadata as opaque. Express policy
  via governance ([AIP-7](/docs/aip-7)), not metadata.
- **Putting `appliesTo` on a workspace-root collection.** `appliesTo` requires
  `extends`. A collection that wants to be generic (installable into any
  workspace) leaves both blank; a collection that binds to a consumer extends a
  parent and lists consumers in `appliesTo`. Mixing the two surfaces a schema
  validation failure (`collection_invalid`).
- **Cross-workspace `extends:` chains.** Like AIP-10, AIP-18's composition is
  expected to walk a single repository's tree. Cross-workspace `extends:` works
  mechanically but reviewers can't audit a file they can't reach. Factor shared
  bits into a small standalone collection package both workspaces can install
  locally.
- **Forgetting to bump `version` on a shape change.** A collection's `version`
  is the contract surface; downstream consumers compare versions to decide
  whether to re-index. Patch bump for cosmetic changes (description, body);
  minor bump for additive changes (new field, new status); major bump for
  HARD-refusal-adjacent changes (narrowing an enum, renaming a field — even when
  the narrowing is technically permitted).
- **Treating `id` as a display field.** The `id` is for addressing (slug, FK,
  URL). Use `title` for human display. Treating `id` as display invites pressure
  to make it human-readable, which then drives renames, which break inbound
  refs. Keep `id` stable; rename `title` freely.

## See also

- [AIP-18 — collections/v1 spec](/docs/aip-18)
- [AIP-1 — agent.json](/docs/aip-1)
- [AIP-2 — AIP template](/docs/aip-2)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-10 — agentknowledge/v1](/docs/aip-10)
- [AIP-13 — agentwork/v1](/docs/aip-13)
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./COLLECTION.schema.json`](./COLLECTION.schema.json) — frontmatter validator
- [`./skills/author-collection/SKILL.md`](./skills/author-collection/SKILL.md) —
  agent-side authoring skill
