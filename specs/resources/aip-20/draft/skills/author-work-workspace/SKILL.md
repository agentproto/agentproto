---
schema: skills/v1
name: author-work-workspace
title: Author a WORK.md (workspace root or view) for AIP-20
description:
  Walk through writing a work.workspace/v2 manifest — either the canonical root
  for a new tracker or a per-context view that extends a parent — using the
  defineWorkWorkspace canonical signature, with explicit one-way-switch checks
  before validation.
version: 1.0.0
tags: [aip-20, work, workspace, manifest, agentproto, composition, collections]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a new engineering tracker", "an eng-lead view on the existing tracker",
      "a per-client engagement extending the org workspace"). The skill picks
      workspace-root vs view based on this and on whether a parent WORK.md is in
      scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new WORK.md will be written. For
      a workspace root, this is the work tree root. For a view, this is the
      consumer's folder (e.g. operators/eng-lead).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent WORK.md, when authoring a view. If
      omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, skills).
      Required when authoring a view that wants `appliesTo` populated; omitted
      for workspace-root mode.
examples:
  - input:
      intent:
        A new engineering tracker with project, initiative, task, and bug
        collections; audit on; rollups on.
      workspaceDir: /repo/engineering
    output:
      - /repo/engineering/WORK.md (created, workspace root)
  - input:
      intent:
        An eng-lead view on the existing engineering tracker, narrower homepage
        and stricter stale-tree lint.
      workspaceDir: /repo/operators/eng-lead
      parentManifest: /repo/engineering/WORK.md
      appliesTo: [ws://operators/eng-lead]
    output:
      - /repo/operators/eng-lead/WORK.md (created, view)
---

# Author a `WORK.md` (workspace root or view) for AIP-20

Use this skill when the user asks to **draft, extend, or revise** a
`work.workspace/v2` manifest under [AIP-20](/docs/aip-20). The skill produces a
valid manifest (workspace-root or view), with the right collection declarations,
scope axes, status rollups, lint rules, and cross-AIP refs, ready for
`defineWorkWorkspace` to load.

A `WORK.md` manifest is the machine-readable contract for an
[AIP-20](/docs/aip-20) tracker — which collections are tracked, how the three
scope axes apply, when parent items roll up child status, which
workspace-spanning lints run. The same doctype is used in two modes: a
**workspace root** at the work tree root (no `extends:`), and a **view** in any
operator/company/skill folder (with `extends:` pointing at a parent). Authoring
either is the same flow, with one branch on step 1.

**Critical:** AIP-20 delegates ALL per-item-kind concerns (fields, status state
machines, ownership cardinality, deadline kinds, lint rules per kind) to
[AIP-18](/docs/aip-18). Do NOT re-specify any of those in `WORK.md` — declare
collections, then let AIP-18 own the schemas.

## When to use

- "Set up a new tracker — write its `WORK.md` from scratch."
- "Add a per-operator lens on the existing tracker — write a view that extends
  the workspace."
- "The Acme engagement needs an OKR collection — extend the org view."
- "Bind an [AIP-7](/docs/aip-7) governance policy and an [AIP-10](/docs/aip-10)
  wiki to this workspace."
- "Move three workspace-spanning lints from the org root to a per-team view that
  needs them stricter."

## When NOT to use

- The user wants to **author per-item-kind schemas** (fields, statuses,
  ownership rules) — that's [AIP-18](/docs/aip-18)'s `author-collection` skill.
- The user wants to **write individual items** (`ITEM.md` records) — also
  AIP-18.
- The user wants to **change the AIP-20 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **edit an existing `WORK.md` in place without considering
  the chain** — read the parent first, run the merge in your head, then edit.
  Skipping the merge produces views that override fields the parent already
  provides correctly, or worse, trip a one-way-switch HARD refusal.

## Process

Follow these steps in order. Composition and one-way switches are the central
mechanics; steps 1-2 set up the right mode, steps 4-9 fill in the body, steps
11-12 validate.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `WORK.md` upstream that this manifest should adapt?**
  If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / skill)? If yes → view (set `appliesTo`); if no → workspace root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, set `extends:`, understand one-way switches

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `WORK.md`. The host resolves it bottom-up; recursion is
allowed.

```yaml
# Operator view at /repo/operators/eng-lead/WORK.md
extends: ../../engineering/WORK.md
```

Rules:

- Use POSIX path separators in `extends:` even on Windows.
- Maximum chain depth is eight. Two-to-three levels is the common case; deeper
  chains usually mean a refactor is overdue.
- If the parent is in another tracker tree, prefer factoring the shared bits
  into a small workspace package both can `extends:` locally.

**One-way switches — read the parent FIRST.** Three fields, once set at any
ancestor, MUST NOT be relaxed by descendants. Trying to relax triggers a HARD
refusal — the view fails to load. Before authoring a view, read the parent (and
its parent, if any) and identify which one-way switches are already on:

| Field                            | One-way condition                                           | HARD refusal code              |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `defaults.auditMutations`        | If any ancestor is `true`, descendants cannot set `false`.  | `work_audit_downgrade`         |
| `scope.containment.enabled`      | If any ancestor is `true`, descendants cannot set `false`.  | `work_scope_disable`           |
| `scope.applicability.valueClass` | If any ancestor sets a value, descendants cannot change it. | `work_scope_value_class_drift` |

If the parent has any of these set, do NOT redeclare them on the view — inherit
silently. If you absolutely need a different value, the conversation belongs at
the parent's level (or in [AIP-7](/docs/aip-7) governance), not in this view.

Cycle detection and depth-overflow are runtime warnings, not errors. Do not rely
on the warning — write a correct chain.

### 3. Identity (`name`, `title`, `description`, `version`)

Every manifest, root or view, declares its identity. These fields are NOT
inherited (each manifest has its own).

```yaml
schema: work.workspace/v2
name: eng-lead-view # kebab-case, stable
title: Engineering lead view # human-readable
description: |
  The eng lead's lens on the shared engineering tracker. Surfaces
  projects + initiatives, hides per-task noise, adds a stricter
  stale-tree lint.
version: 1.0.0 # semver of the SHAPE, not content
```

Bump `version` whenever you change `collections`, `scope.*`, `statusRollup.*`,
`lints`, or `defaults.*`. Patch bumps for cosmetic edits to `description`,
`display.*`, or `metadata`.

### 4. Collections — inline vs ref vs aliased

`collections:` is the bridge to [AIP-18](/docs/aip-18). Three forms:

- **Inline.** Full AIP-18 collection.schema/v1 frontmatter embedded in
  `WORK.md`. Useful for small, single-tenant trackers.
- **File ref** (`./collections/<name>/COLLECTION.md`). Useful when the
  collection is shared with peer workspaces.
- **Registry import** (`ws://collections/<slug>`). Useful for third-party or
  org-shared collections.

Aliasing (any ref form):

```yaml
collections:
  - ref: ws://collections/issue
    alias: bug # workspace-local rename
    version: "1.x" # pin schema range
```

Resolution order (highest priority wins):

1. Inline (declared on this `WORK.md`).
2. File ref (resolved relative to this manifest's directory).
3. Registry import (`ws://collections/<slug>`).

Two collection entries resolving to the same effective name (alias or upstream
`name`) is a HARD failure (`work_collection_alias_conflict`). Pick aliases
deliberately.

The merged `collections[]` array is computed across the `extends:` chain via
merge-by-effective-name. Inheriting from the parent is the default; only
redeclare collections you want to override.

When extending an [AIP-18](/docs/aip-18) starter collection (e.g.
`agentwork-v1-compat/task`) with team-specific fields, write the extended
collection inline OR as a sibling file with its own `extends:` — and then ref
the extended file from `WORK.md`. Do NOT mutate the starter file in place.

### 5. Cross-AIP bindings

```yaml
executor: ws://operators/eng-triage
governance: ../policies/engineering.yaml
knowledge: ws://wikis/engineering/KNOWLEDGE.md
agency: ws://agencies/internal-eng
playbook: ws://playbooks/eng-quarterly
```

| Field        | Required    | When to set                                                                                                                                            |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor`   | optional    | Default executor for items without an explicit assignee.                                                                                               |
| `governance` | optional    | Set when [AIP-7](/docs/aip-7) approval gates apply. Workspace-root manifests usually set this; views may override only if the parent's policy permits. |
| `knowledge`  | optional    | Set when items reference an [AIP-10](/docs/aip-10) wiki by default.                                                                                    |
| `agency`     | optional    | Set when work is billable and tracked under an [AIP-8](/docs/aip-8) agency.                                                                            |
| `playbook`   | optional    | Set when an [AIP-12](/docs/aip-12) playbook governs routine plays for this workspace.                                                                  |
| `appliesTo`  | conditional | REQUIRED in view mode (whenever `extends` is set AND the view binds to a consumer). MUST NOT be set in workspace-root mode.                            |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`work_appliesto_unresolvable`) — verify the consumer's workspace exists before
declaring the binding.

The host also refuses workspaces with unresolvable `executor`, `governance`,
`knowledge`, `agency`, or `playbook` refs (`work_xref_unresolvable`, HARD). Do
not bind to a workspace that hasn't been created yet.

### 6. Scope axes (containment / applicability / ownership)

The three orthogonal axes:

```yaml
scope:
  containment:
    enabled: true
    field: parent
    rules:
      allowedKinds: [project, initiative]
      maxDepth: 4
  applicability:
    enabled: true
    field: appliesTo
    valueClass: role-and-company
  ownership:
    enabled: true
    field: owner
    policy: inherit
```

Guidance:

- **Containment** controls parent/child. Use `allowedKinds` to prevent miscoded
  relationships (a `task` having a `bug` parent when only `project` and
  `initiative` are intended). Use `maxDepth` to cap recursion.
- **Applicability** controls visibility. Pick `valueClass` based on what the
  team actually puts in `appliesTo`: `role` if items are about roles, `company`
  if about companies, `role-and-company` for multi-tenant deployments. Once set,
  descendants CANNOT change it.
- **Ownership** is mostly delegated to per-collection [AIP-18](/docs/aip-18)
  ownership rules. The workspace-level `policy` (strict / inherit / open) is the
  cross-collection knob.

Recall the one-way switches — `scope.containment.enabled: true` and
`scope.applicability.valueClass` cannot be relaxed by descendants.

### 7. Status rollup

Per-collection statuses live on AIP-18; status rollup is the _workspace-level_
aggregation:

```yaml
statusRollup:
  enabled: true
  policy:
    - when: all-children-terminal
      bubbleParentStatus: done
    - when: any-child-blocked
      bubbleParentStatus: blocked
    - when: any-child-overdue
      bubbleParentStatus: at-risk
  exposeViaField: rolledStatus
```

Rules:

- `bubbleParentStatus:` MUST be a status id that exists on EVERY parent
  collection (per `scope.containment.rules.allowedKinds`). The host warns and
  degrades to no-op for non-conforming parents.
- First-match wins: clauses are evaluated in declaration order, the first true
  clause's status is bubbled.
- `exposeViaField:` is materialization. Set it when consumers need the rolled
  status to appear in items on disk; leave it unset for query-time evaluation.

### 8. Workspace-spanning lints

AIP-18 lints are per-collection (`missing-owner`, `overdue`, `required-field`).
AIP-20 lints span collections:

```yaml
lints:
  - id: orphan-task
    kind: orphan-across-collections
    severity: error
    params:
      collections: [task, bug]
  - id: stale-tree-30d
    kind: stale-tree
    severity: warn
    params:
      days: 30
  - id: broken-parent
    kind: broken-parent-ref
    severity: error
  - id: scope-mismatch-role
    kind: scope-mismatch
    severity: warn
    params:
      axis: applicability
```

Workspace-spanning lint kinds:

| Kind                        | Purpose                                                                         | `params`                           |
| --------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| `orphan-across-collections` | Item has no inbound parent ref AND no outbound containment ref.                 | `collections: [...]`               |
| `stale-tree`                | Items in a containment tree where no descendant has been updated within `days`. | `days: <n>`, `collections: [...]`  |
| `broken-parent-ref`         | Item's `parent` ref doesn't resolve.                                            | none                               |
| `scope-mismatch`            | Item's applicability conflicts with parent's.                                   | `axis: applicability \| ownership` |
| `custom`                    | Host-defined, identified by `id`.                                               | host-defined                       |

Severity guidance — same as [AIP-10](/docs/aip-10):

- `error` — block writes that fail the lint.
- `warn` — surface in the audit log, do not block.
- `info` — surface in tooling only.

Child views may soften severity (warn → info). A parent's `governance:` policy
MAY forbid softening — the host enforces.

### 9. Routine workflow defaults

```yaml
defaults:
  workflow: ./workflows/nightly-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true
```

| Field            | Values                                                       |
| ---------------- | ------------------------------------------------------------ |
| `workflow`       | path or ws:// ref to an [AIP-15](/docs/aip-15) `WORKFLOW.md` |
| `approvalClass`  | `auto` / `always` / `on-mutate` / `policy:<ref>`             |
| `auditMutations` | boolean — ONE-WAY SWITCH                                     |

`auditMutations: true` is one of the three one-way switches. Enable it
deliberately: once on at any ancestor, no descendant can disable it without
triggering `work_audit_downgrade` (HARD).

### 10. Display / UX hints

```yaml
display:
  homePage: PROJ-eng-q2
  defaultGrouping: parent # kind | status | owner | parent
  defaultView: tree # list | board | tree | timeline
```

Pure UI hints; no validation impact. Pick what makes the workspace landable on
first open.

### 11. Body prose (purpose, conventions, what NOT to track)

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this workspace tracks, who uses it.

## Conventions

When an item belongs in collection A vs B; which scope axes apply.

## What this workspace does NOT track

Set boundaries explicitly. Helps reviewers reject mis-filed items.

## When to extend vs replace

Composition guidance for downstream view authors.
```

Keep the body short. The frontmatter is the contract; the body explains the
choices.

### 12. Validate against `WORK.schema.json`; if view, dry-run merge

Validate the new manifest's frontmatter against
[AIP-20's schema](../../WORK.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-20/draft/WORK.schema.json \
  -d "<workspaceDir>/WORK.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends`.
- `collections[].alias` produces a name collision → rename or remove the alias.
- `statusRollup.policy[].bubbleParentStatus` references a status id not declared
  on the parent collection → either add the status to the collection or change
  the bubble target.
- `lints[].id` collisions inside one manifest → ids must be unique per manifest;
  merge happens across manifests, not within one.
- `version` not semver → `1.0.0`, not `1` or `v1`.

If view, run the host's resolution algorithm in dry-run mode and **explicitly
check that no one-way switch is relaxed**:

```md
## Merge diff: eng-lead-view (vs parent engineering)

Inherited (no change):

- collections: project, initiative, task, bug
- scope.containment: enabled=true, allowedKinds=[project, initiative],
  maxDepth=3
- scope.applicability: enabled=true, field=appliesTo,
  valueClass=role-and-company
- defaults.auditMutations: true (one-way; descendants cannot disable)
- governance: ../policies/engineering.yaml

Overridden:

- display.homePage: PROJ-onboarding → PROJ-eng-q2
- display.defaultView: board → tree

Added:

- lints.lead-stale-projects (kind=stale-tree, severity=warn)
- appliesTo: [ws://operators/eng-lead]

One-way switch check: PASS

- defaults.auditMutations: parent=true, view=undefined → inherits true OK
- scope.containment.enabled: parent=true, view=undefined → inherits true OK
- scope.applicability.valueClass: parent=role-and-company, view=undefined →
  inherits OK

Resolution chain: 2 levels (engineering → eng-lead-view) Warnings: none
```

If the merge diff shows the view RELAXING any one-way switch (e.g.
`auditMutations: true → false`, `containment.enabled: true → false`,
`valueClass: company → role`), the view will be HARD-refused at load — fix it
before declaring success.

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to parent's value via the merge).

## Final checklist

Before declaring done:

- [ ] `schema: work.workspace/v2` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing `WORK.md`;
      `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] `collections[]` entries have unique effective names (alias or `name`);
      refs resolve; inline frontmatters validate against
      [AIP-18's COLLECTION.schema.json](../../../aip-18/draft/COLLECTION.schema.json).
- [ ] Per-item-kind concerns (fields, statuses, ownership rules) are NOT in
      `WORK.md` — they live on `COLLECTION.md` files.
- [ ] `scope.containment.rules.allowedKinds` references real collection names.
- [ ] `scope.applicability.valueClass` is set deliberately; it cannot change in
      descendants.
- [ ] `statusRollup.policy[].bubbleParentStatus` references status ids declared
      on every eligible parent collection.
- [ ] `lints[]` have unique `id`s within this manifest; severities respect any
      parent governance constraints.
- [ ] `defaults.auditMutations` is set deliberately (one-way).
- [ ] Cross-AIP refs (`executor`, `governance`, `knowledge`, `agency`,
      `playbook`) all resolve.
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `WORK.schema.json`.
- [ ] Body is short and prose-only.
- [ ] If view: dry-run merge diff was reviewed; no one-way switch is relaxed.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf, one path per level.
4. **Effective config summary** — the merged shape, in particular which
   collections are active, which scope axes are enabled, and which one-way
   switches are now in effect.
5. **Bindings** — `executor`, `governance`, `knowledge`, `agency`, `playbook`,
   `appliesTo` (if set), each with a one-line note on what it does.
6. **One-way switch report** — for a view, an explicit per-switch line:
   `auditMutations: parent=<x>, view=<y>, status=PASS|FAIL`.
7. **Validation result** — schema clean, dry-run merge clean, warnings (if any).
8. **Open assumptions** — fields you guessed (rollup policy, stale-tree
   thresholds, lint severities) that the user might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation — touch only the file
you are creating.

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this skill
  composes on
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-8 — agentagencies/v1](/docs/aip-8)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP
- [AIP-12 — agentplaybooks/v1](/docs/aip-12)
- [AIP-15 — WORKFLOW.md](/docs/aip-15)
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests
- [`../../WORK.schema.json`](../../WORK.schema.json) — frontmatter validator
- [`../../starters/agentwork-v1-compat/`](../../starters/agentwork-v1-compat) —
  starter collection library
