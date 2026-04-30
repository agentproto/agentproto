---
schema: skills/v1
name: author-collection
title: Author a COLLECTION.md (and optionally items) for AIP-18
description:
  Walk through writing a collection.schema/v1 manifest — either a fresh
  collection or a child that extends a parent — using the defineCollection
  canonical signature, then optionally produce conforming collection.item/v1
  instances.
version: 1.0.0
tags: [aip-18, collections, schema, agentproto, composition, typed-records]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the collection to capture
      (e.g. "a bug tracker for the eng team", "an OKR collection with
      multi-owner cardinality", "a child of `bugs` that adds component
      routing"). The skill picks fresh-collection vs view-mode based on this and
      on whether a parent COLLECTION.md is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new COLLECTION.md will be
      written. Conventionally `<workspace>/collections/<name>/COLLECTION.md`.
  - name: parentCollection
    type: string
    required: false
    description:
      Absolute or relative path to the parent COLLECTION.md, when authoring an
      extension. If omitted, the skill assumes fresh-collection mode and refuses
      to set `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new collection binds to (workspaces, wikis,
      companies, operators, skills). Required when authoring a view bound to
      specific consumers; omitted for generic / standalone collections.
  - name: sampleItems
    type: number
    required: false
    description:
      If set, the skill also drafts this many sample ITEM.md files demonstrating
      the collection's shape.
examples:
  - input:
      intent:
        A bug-tracker collection — severity enum, repro field, single assignee,
        status state machine.
      workspaceDir: /repo/collections/bugs
    output:
      - /repo/collections/bugs/COLLECTION.md (created, fresh collection)
  - input:
      intent:
        An engineering team's view of the bugs collection that adds component
        routing and a 1-hour SLA on critical.
      workspaceDir: /repo/collections/eng-bug
      parentCollection: /repo/collections/bugs/COLLECTION.md
      appliesTo: [ws://workspaces/eng-tracker]
    output:
      - /repo/collections/eng-bug/COLLECTION.md (created, view extending bugs)
---

# Author a `COLLECTION.md` (and optionally items) for AIP-18

Use this skill when the user asks to **draft, extend, or revise** a
`collection.schema/v1` manifest under [AIP-18](/docs/aip-18). The skill produces
a valid `COLLECTION.md` (fresh or extending), with the right cross-AIP refs,
fields, statuses, ownership, deadline, lints, and identity rules, ready for
`defineCollection` to load. Optionally produces sample `collection.item/v1`
instances.

A collection is the schema for a class of records — fields, status state
machine, ownership rules, lints. The same doctype is used in two modes: a
**fresh / standalone** collection (no `extends:`, generic — installable into any
workspace) and a **child** collection (with `extends:` pointing at a parent,
often also bound to specific consumers via `appliesTo`). Authoring either is the
same flow, with one branch on step 1.

## When to use

- "Write a collection for X" — fresh or extending.
- "Add a child collection that specialises an existing one for team Y."
- "Bind an existing collection to a workspace via `appliesTo`."
- "Refactor a hardcoded type out of a workspace AIP into a composable
  `COLLECTION.md`."
- "Produce sample items demonstrating the collection's schema."

## When NOT to use

- The user wants to **author entries on top of an existing collection** without
  changing the schema — drop the `sampleItems` branch into your normal
  item-authoring flow; you don't need this skill's full process for items alone.
- The user wants to **change the AIP-18 spec itself** — schema shape changes are
  governance, not authoring.
- The user wants to **edit an existing `COLLECTION.md` in place without
  considering the chain** — read the parent (if any) first, run the merge in
  your head, then edit. Skipping the merge produces children that override
  fields the parent already provides correctly.

## Process

Follow these steps in order. Composition is the central mechanism; steps 1–2 set
up the right mode, steps 5–10 fill in the schema, step 12 validates.

### 1. Decide: fresh collection or extension?

Two questions:

- **Is there an existing `COLLECTION.md` upstream that this manifest should
  specialise?** If yes → child; if no → fresh.
- **Does the user want the manifest to bind to specific workspaces /
  consumers?** If yes → child (set `appliesTo`); if no → fresh (no `appliesTo`).

Fresh mode declares a generic schema — installable anywhere. Child mode
specialises an existing schema and may bind to specific consumers. There is no
third mode — the schema rejects manifests that mix the two (e.g. `appliesTo`
without `extends`).

If fresh, skip step 2 and proceed to step 3.

### 2. Locate the parent and reference it via `extends:`

For a child, `extends:` is a RELATIVE path from the new manifest's directory to
the parent `COLLECTION.md`. The host resolves it bottom-up; recursion is allowed
(the parent may itself have `extends:`).

```yaml
# Child at /repo/collections/eng-bug/COLLECTION.md
extends: ../bugs/COLLECTION.md
```

Rules:

- Use POSIX path separators in the `extends:` field even on Windows. Hosts
  normalize before resolving.
- Maximum chain depth is eight. Two-to-three levels is the common case; deeper
  chains usually mean the schema needs a refactor.
- If the parent is in another workspace, prefer factoring the shared bits into a
  small standalone collection package both can install — cross-workspace
  `extends:` works mechanically but reviewers can't audit a file they can't
  reach.

Cycle detection and depth-overflow are runtime warnings, not errors. The host
degrades gracefully to local-only and surfaces `collection_extends_cycle` /
`collection_extends_depth_exceeded`. Don't rely on the warning — write a correct
chain.

### 3. Identity (`name`, `title`, `description`, `version`)

Every collection, fresh or child, declares its identity. These fields are NOT
inherited (each collection has its own).

```yaml
schema: collection.schema/v1
name: eng-bug # kebab-case, stable
title: Engineering bugs # human-readable
description: |
  Engineering team's bug collection. Extends the shared `bugs`
  shape with component routing and a 1-hour SLA on critical.
version: 1.0.0 # semver of the SHAPE
```

Bump `version`:

- patch — cosmetic edits to `description` or `metadata`.
- minor — additive changes (new field, new status, new lint).
- major — narrowing-adjacent changes (narrowing enum, renaming fields,
  deprecating a field via `enabled: false`).

### 4. Cross-AIP bindings — `appliesTo`

A child binds to consumers; a fresh collection MUST NOT.

```yaml
appliesTo:
  - ws://workspaces/eng-tracker # AIP-20 work workspace
  - ws://wikis/team-knowledge # AIP-10 wiki
  - ws://companies/acme # AIP-6 company
```

| Field       | Required    | When to set                                                                                                  |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `appliesTo` | conditional | REQUIRED when extending AND binding to a specific consumer. MUST NOT be set for fresh / generic collections. |

The host MUST refuse a child whose `appliesTo` references a non-existent
consumer (`collection_appliesto_unresolvable`) — verify each consumer's
workspace exists before declaring the binding.

### 5. Field schema — declare the shape of items

`fields` is the most consequential block. It tells the host what keys items may
carry, and per-field, what type / constraints apply. Merge-by-name across
composition.

```yaml
fields:
  - name: severity
    type: enum
    enum: [low, medium, high, critical]
    required: true
    description: Impact tier. `critical` items SHOULD page on creation.
  - name: repro
    type: text
    required: true
  - name: affectedVersion
    type: string
    required: false
    pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$"
  - name: assignees
    type: array
    required: false
    items:
      type: ref
      refKind: operators
```

Type system (10 types):

| Type       | Use for                 | Constraints                                  |
| ---------- | ----------------------- | -------------------------------------------- |
| `string`   | short single-line text  | `pattern`, `format`, `min`, `max`            |
| `number`   | numeric value           | `min`, `max`                                 |
| `boolean`  | flag                    | none                                         |
| `enum`     | one of a fixed set      | `enum: [...]` (required)                     |
| `date`     | ISO date                | none                                         |
| `datetime` | ISO datetime            | none                                         |
| `text`     | multi-line prose        | `min`, `max`                                 |
| `url`      | absolute URL            | none                                         |
| `ref`      | pointer to another item | `refKind: <collection-name>` (required)      |
| `array`    | list                    | `items: <fieldDef>`, `min`, `max` for length |

Composition rules:

- `name` is kebab- or camelCase (per the schema's pattern). Merge key for
  composition.
- A child redeclaring a field with the same `name` REPLACES the parent's,
  subject to the type-drift refusal: a child cannot change `type` (string ↛
  number), cannot widen an enum (must be a subset of parent's `enum`), cannot
  widen array `items.type`. Narrowing is fine (adding `pattern`, narrowing
  `min`/`max`, narrowing the enum subset, requiring a previously optional
  field).
- A child cannot remove a parent's field. To deprecate, declare the same field
  with `enabled: false`.

When authoring a child, only redeclare fields you are extending or refining.
Inherited fields pass through untouched.

### 6. Status state machine — declare statuses + transitions

```yaml
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
```

Rules:

- `id` is kebab-case. Merge key for composition.
- `terminal: true` marks a status as closed. Lints like `overdue` typically skip
  terminal statuses.
- `transitionsTo` declares the legal next-status set. Omit to permit all
  transitions.
- A child MAY add new statuses, mark inherited statuses terminal, or narrow
  `transitionsTo`. A child MUST NOT remove a parent status — the host refuses
  with `collection_status_removed`.
- `initialStatus` MUST refer to a status declared (locally or inherited).

If the collection is stateless (e.g. notes, customer records), omit `statuses`
entirely. The host treats absent `statuses` as "no status concept for this
collection" and ignores any `status:` field on items.

### 7. Ownership rules — cardinality, role, required

```yaml
ownership:
  cardinality: single # 'none' | 'single' | 'multiple'
  role: assignee # which item field holds the ref
  required: false # whether items MUST declare an owner
```

Pick `cardinality` first:

- `none` — the collection has no ownership concept. Any `owner` / `assignee` /
  etc. field on items is just a plain field, not interpreted as ownership. The
  `missing-owner` lint is meaningless.
- `single` — exactly one owner. The item's ownership field carries a single ref
  string.
- `multiple` — list of owners. The item's ownership field carries an array of
  refs.

`role` names the item field that holds the ref. Default `'owner'`; collections
often pick a domain-specific name (`assignee` for bugs, `coLeads` for OKRs,
`librarian` for knowledge entries).

`required: true` lets the `missing-owner` lint fire on items without an
ownership ref. `false` means ownership is advisory.

### 8. Deadline rules — kind, required, fieldName

```yaml
deadline:
  kind: target-date # 'none' | 'target-date' | 'window' | 'recurrent'
  required: true # whether items MUST declare a deadline
  fieldName: targetDate # which item field holds the value
```

Pick `kind`:

- `none` — no deadline concept (default). The collection treats any `dueAt`
  field on items as an ordinary field.
- `target-date` — single target date. The field holds an ISO date.
- `window` — start + end. The field holds an array of two ISO datetimes.
- `recurrent` — repeating cadence. The field holds an RRULE-like description.

`required` gates whether items MUST declare the deadline value. `fieldName`
defaults to `dueAt`; collections often rename (`targetDate`,
`targetResolutionAt`, `quarterlyEndAt`).

### 9. Lint rules — required-field, missing-owner, etc.

```yaml
lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: warn
  - id: overdue
    kind: overdue
    appliesTo: "*"
    severity: error
  - id: stale-30
    kind: stale
    appliesTo: "*"
    severity: info
    params:
      days: 30
  - id: required-current
    kind: required-field
    appliesTo: "*"
    severity: info
    params:
      field: current
```

Lint kinds:

| Kind             | Purpose                                             | `params`        |
| ---------------- | --------------------------------------------------- | --------------- |
| `missing-owner`  | Items with `ownership.required: true` and no owner. | none            |
| `overdue`        | Items past their deadline, status not terminal.     | none            |
| `orphan`         | Items with no inbound link.                         | none            |
| `broken-ref`     | Refs that don't resolve.                            | none            |
| `stale`          | `updatedAt` older than `params.days`.               | `days: <n>`     |
| `required-field` | `params.field` missing or empty.                    | `field: <name>` |
| `custom`         | Host-defined; identified by `id`.                   | host-defined    |

Severity guidance:

- `error` — block writes that fail the lint.
- `warn` — surface in the workspace's lint pipeline; do not block.
- `info` — surface in tooling only.

A child MAY soften severity. Governance ([AIP-7](/docs/aip-7)) MAY forbid
softening — the host enforces the policy when bound.

### 10. Identity rules — slugSource, filingPath

```yaml
identity:
  slugSource: hash:title,createdAt
  filingPath: items/{collection}/{slug}.md
```

`slugSource` controls how new items get their `id`:

- `<field-name>` — slugify the value of that field (e.g. `slugSource: title` →
  `"Login crashes" → "login-crashes"`).
- `random` — UUID or short random id.
- `sequence` — monotonic counter (`BUG-1042`, `BUG-1043`).
- `hash:<comma-separated-fields>` — hash of the named fields
  (`hash:title,createdAt`).

`filingPath` is a template for where items live on disk. Tokens: `{collection}`,
`{slug}`, `{year}`, `{month}`. Common patterns:

- Flat: `items/{collection}/{slug}.md`
- Time-grouped: `items/{collection}/{year}/{month}/{slug}.md`
- Quarter-grouped: `items/{collection}/{quarter}/{slug}.md` (the collection MAY
  add a `{quarter}` token via host extensions; see AIP-18 ADAPTER.md).

### 11. Body prose — purpose, conventions, when to use

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this collection captures. When an item belongs here vs in another
collection.

## Conventions

Naming, when fields are filled, what NOT to put on items of this type. The body
is for humans; runtimes do not parse it.

## Field guide

Optional — additional prose about specific fields beyond their descriptions in
the frontmatter.

## Examples

Short snippets showing what a typical item looks like under this collection.
```

Keep the body short — the frontmatter is the contract; prose explains the
choices behind it.

### 12. Validate against `COLLECTION.schema.json`; if extending, dry-run merge and surface diff

Validate the new manifest's frontmatter against the `schema` `$def` in
[AIP-18's schema](../../COLLECTION.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-18/draft/COLLECTION.schema.json \
  -d "<workspaceDir>/COLLECTION.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends` (a child binding to
  consumers must extend a parent).
- `fields[].name` not kebab/camelCase → rename.
- `lints[].id` collisions inside one manifest → ids must be unique per manifest;
  merge happens across manifests, not within one.
- `version` not semver → `1.0.0`, not `1` or `v1`.
- `fields` declares `type: enum` without an `enum: [...]` array → add the
  values.
- `fields` declares `type: ref` without `refKind` → name the target collection.
- `fields` declares `type: array` without `items` → declare the inner shape.

Fix every error before declaring success.

If extending, run the host's resolution algorithm in dry-run mode and present
the diff between the parent's effective config and the merged config:

```md
## Merge diff: eng-bug (vs parent bugs)

Inherited (no change):

- fields: repro, affectedVersion
- statuses: open, triaged, in-progress, fixed, wontfix
- ownership.\*
- identity.\*
- lints: missing-owner-critical, stale-30, broken-ref

Overridden (HARD-refusal-checked):

- fields.severity: enum [low, medium, high, critical] → enum [medium, high,
  critical] (subset narrowing — OK)

Added:

- fields.affectedComponent (enum, required)
- lints.critical-sla-1h (kind=stale, severity=error, params.days=0.04)

Resolution chain: 2 levels (bugs → eng-bug) HARD refusals: none Warnings: none
```

If the diff includes an unintentional override, edit the child to remove it
(deletion of a field reverts to parent's value via the merge). If a HARD refusal
fires, you've made an incompatible change — re-think (subset the enum, add a new
field with a different name, or ship a v2 of the parent).

### Optional — produce sample items

When `sampleItems` is set, draft that many items:

1. Pick representative `collection`-specific values (a critical bug, a high bug,
   a stalled bug).
2. Fill required fields per the resolved schema.
3. Use `slugSource` to derive each `id`.
4. File at `filingPath`.
5. Validate each item against the resolved collection schema.

```md
---
schema: collection.item/v1
collection: eng-bug
id: BUG-1042
title: Login form crashes on Safari 17 with autofill enabled
status: triaged
assignee: ws://operators/eng-frontend-lead
severity: high
affectedComponent: web
repro: |
  1. Open https://app.example.com/login in Safari 17.4.
  2. ...
createdAt: 2026-04-26T09:14:00Z
updatedAt: 2026-04-27T11:02:00Z
---

# Login form crashes on Safari 17 with autofill enabled

<body prose>
```

## Final checklist

Before declaring done:

- [ ] `schema: collection.schema/v1` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If child: `extends:` is a valid relative path to an existing
      `COLLECTION.md`; `appliesTo:` (if set) references existing consumers.
- [ ] If fresh: `extends:` and `appliesTo:` are absent.
- [ ] `fields[].name` are kebab/camelCase; types are valid; type-specific
      constraints (`enum`, `items`, `refKind`) are present where required.
- [ ] `fields` overrides against parent are subset / narrowing only — no
      widening, no type drift.
- [ ] `statuses[].id` are kebab-case; transitions reference declared statuses;
      `initialStatus` resolves.
- [ ] `statuses` does not attempt to remove inherited statuses.
- [ ] `ownership.cardinality` matches the item field shape (`single` → string
      ref, `multiple` → array of refs).
- [ ] `deadline.kind` matches the deadline field shape.
- [ ] `lints[].id` are unique within this manifest.
- [ ] `identity.slugSource` and `identity.filingPath` are set (or inherited from
      parent).
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `COLLECTION.schema.json`.
- [ ] Body is short and prose-only (no fenced code that the host might mistake
      for a second manifest).
- [ ] If child: dry-run merge diff was reviewed; no HARD refusals.
- [ ] If `sampleItems > 0`: every sample item validates against the resolved
      collection schema.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Worked examples

### Example A — `investors` collection (CRM-style record)

A standalone collection for tracking investors as records. No status state
machine (records are reference data, not workflow items); ownership is multi
(relationship lead + back-up); no deadline.

```yaml
schema: collection.schema/v1
name: investors
title: Investors
description:
  Cap-table investors. Reference records, not workflow items — no status state
  machine, no deadline. Tracks contact, fund, board seat, last meeting.
version: 1.0.0

fields:
  - name: fund
    type: string
    required: true
  - name: leadPartner
    type: string
    required: true
  - name: contact
    type: string
    required: false
    format: email
  - name: boardSeat
    type: boolean
    required: false
  - name: lastMeetingAt
    type: datetime
    required: false

ownership:
  cardinality: multiple
  role: relationshipOwners
  required: false

deadline:
  kind: none

lints:
  - id: stale-180
    kind: stale
    appliesTo: "*"
    severity: info
    params:
      days: 180

identity:
  slugSource: leadPartner
  filingPath: items/{collection}/{slug}.md
```

This collection demonstrates that not every collection needs the full status /
deadline / lint stack. Investors are records, not workflow items; the schema
reflects that by omitting `statuses` and setting `deadline.kind: none`.

### Example B — `eng-bug` (extending shared `bugs`)

The full child shape with merge diff:

```yaml
schema: collection.schema/v1
name: eng-bug
title: Engineering bugs
description:
  Engineering team's bug collection. Extends shared `bugs` with component
  routing and a 1-hour SLA on critical.
version: 1.0.0

extends: ../bugs/COLLECTION.md

appliesTo:
  - ws://workspaces/eng-tracker

fields:
  - name: severity
    type: enum
    enum: [medium, high, critical] # narrowed from [low, medium, high, critical]
    required: true
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
      days: 0.04
      onlyIfFieldEquals:
        field: severity
        value: critical
```

Authoring this child involves: locating `../bugs/COLLECTION.md`, checking which
fields the parent declares, narrowing `severity` (subset enum — OK), adding
`affectedComponent` (new field — OK), adding `critical-sla-1h` (new lint — OK),
running the dry-run merge to confirm no HARD refusal.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (fresh / standalone vs child / extending).
3. **Resolution chain** (for a child): root → … → leaf, one path per level.
4. **Effective schema summary** — fields, statuses, ownership/deadline/lints in
   effect after merge.
5. **Bindings** — `appliesTo` (if set), each with a one-line note.
6. **Validation result** — schema clean, dry-run merge clean, no HARD refusals,
   warnings (if any).
7. **Open assumptions** — fields you guessed (`severity` enum, `slugSource`,
   `filingPath`, lint severities) that the user might want to override.
8. **Sample items** (if `sampleItems > 0`): paths, ids, per-item validation
   status.

Do NOT mutate the parent collection, the workspace root, or any existing child
as a side-effect. Authoring a new collection is a LEAF operation — touch only
the file you are creating.

## See also

- [AIP-18 — collections/v1 spec](/docs/aip-18)
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — same composition pattern
- [AIP-13 — agentwork/v1](/docs/aip-13) — hardcoded-types antecedent
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide for hosts
  (collection loading, merge strategy, item validation)
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference collections (`tasks`,
  `bugs`, `okrs`, multi-level chain) and reference items
- [`../../COLLECTION.schema.json`](../../COLLECTION.schema.json) — frontmatter
  validator
