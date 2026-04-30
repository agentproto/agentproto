---
schema: skills/v1
name: author-office-workspace
title: Author a OFFICE.md (workspace root or view) for AIP-22
description:
  Walk through writing a office.workspace/v1 manifest — either the canonical
  root for a new organisation or a per-context view that extends a parent —
  using the defineOfficeWorkspace canonical signature, with explicit
  one-way-switch checks before validation.
version: 1.0.0
tags:
  [
    aip-22,
    company,
    organisation,
    workspace,
    manifest,
    agentproto,
    composition,
    collections,
    org-tree,
  ]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a new organisation manifest for Acme Corp", "a German subsidiary view
      extending Acme Corp", "an eng-lead lens on the existing org"). The skill
      picks workspace-root vs view based on this and on whether a parent
      OFFICE.md is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new OFFICE.md will be written.
      For a workspace root, this is the company root. For a view, this is the
      consumer's folder (e.g. divisions/research, jurisdictions/de,
      operators/eng-lead).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent OFFICE.md, when authoring a view.
      If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, skills). Required
      when authoring a view that wants `appliesTo` populated; omitted for
      workspace-root mode.
examples:
  - input:
      intent:
        A new organisation manifest for Acme Corp with role, objective,
        department, team, and policy collections; org-tree containment ON;
        reporting graph ON; audit ON.
      workspaceDir: /repo/companies/acme
    output:
      - /repo/companies/acme/OFFICE.md (created, workspace root)
  - input:
      intent:
        A German subsidiary view extending Acme Corp, narrowing jurisdiction and
        rebinding governance to a DPA-aligned policy.
      workspaceDir: /repo/companies/acme/jurisdictions/de
      parentManifest: /repo/companies/acme/OFFICE.md
      appliesTo: [ws://operators/de-country-lead]
    output:
      - /repo/companies/acme/jurisdictions/de/OFFICE.md (created, view)
---

# Author a `OFFICE.md` (workspace root or view) for AIP-22

Use this skill when the user asks to **draft, extend, or revise** a
`office.workspace/v1` manifest under [AIP-22](/docs/aip-22). The skill produces
a valid manifest (workspace-root or view), with the right collection
declarations, identity fields, org-tree rules, reporting graph, lint rules, and
cross-AIP refs, ready for `defineOfficeWorkspace` to load.

A `OFFICE.md` manifest is the machine-readable contract for an
[AIP-22](/docs/aip-22) organisation — its identity, which collections it tracks,
how the org tree nests, who reports to whom, which workspace-spanning lints run.
The same doctype is used in two modes: a **workspace root** at the company root
(no `extends:`), and a **view** in any consumer folder (with `extends:` pointing
at a parent). Authoring either is the same flow, with one branch on step 1.

**Critical:** AIP-22 delegates ALL per-item-kind concerns (fields, status state
machines, ownership cardinality, lint rules per kind) to [AIP-18](/docs/aip-18).
Do NOT re-specify any of those in `OFFICE.md` — declare collections, then let
AIP-18 own the schemas.

## When to use

- "Set up a new organisation — write its `OFFICE.md` from scratch."
- "Add a per-jurisdiction view on the existing organisation — write a view that
  extends the parent."
- "The eng lead needs an org-tree lens — write a view that surfaces the
  engineering departments and roles."
- "Bind an [AIP-7](/docs/aip-7) governance policy and an [AIP-10](/docs/aip-10)
  wiki to this organisation."
- "Add a reporting-graph integrity sweep workflow as the organisation default."

## When NOT to use

- The user wants to **author per-item-kind schemas** (role fields, status
  ladders, ownership rules) — that's [AIP-18](/docs/aip-18)'s
  `author-collection` skill.
- The user wants to **write individual items** (a specific role record, a
  specific objective) — also AIP-18.
- The user wants to **change the AIP-22 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **edit an existing `OFFICE.md` in place without considering
  the chain** — read the parent first, run the merge in your head, then edit.
  Skipping the merge produces views that override fields the parent already
  provides correctly, or worse, trip a one-way-switch HARD refusal.

## Process

Follow these steps in order. Composition and one-way switches are the central
mechanics; steps 1-2 set up the right mode, steps 3-10 fill in the body, steps
11-12 validate.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `OFFICE.md` upstream that this manifest should adapt?**
  If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  skill / division)? If yes → view (set `appliesTo`); if no → workspace root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, set `extends:`, understand one-way switches

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `OFFICE.md`. The host resolves it bottom-up; recursion
is allowed.

```yaml
# Jurisdictional view at /repo/companies/acme/jurisdictions/de/OFFICE.md
extends: ../../OFFICE.md
```

Rules:

- Use POSIX path separators in `extends:` even on Windows.
- Maximum chain depth is eight. Two-to-three levels is the common case; deeper
  chains usually mean a refactor is overdue.
- If the parent is in another tree, prefer factoring the shared bits into a
  small workspace package both can `extends:` locally.

**One-way switches — read the parent FIRST.** Four fields, once set at any
ancestor, MUST NOT be relaxed by descendants. Trying to relax triggers a HARD
refusal — the view fails to load. Before authoring a view, read the parent (and
its parent, if any) and identify which one-way switches are already on:

| Field                                                      | One-way condition                                                                   | HARD refusal code            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `defaults.auditMutations`                                  | If any ancestor is `true`, descendants cannot set `false`.                          | `office_audit_downgrade`     |
| `governance.signing.required` (in bound governance policy) | If any ancestor's policy is `true`, descendants cannot relax.                       | `office_signing_downgrade`   |
| `orgTree.containment.enabled`                              | If any ancestor is `true`, descendants cannot set `false`.                          | `office_orgtree_disable`     |
| `orgTree.containment.rules.maxDepth`                       | If any ancestor sets a value, descendants may NARROW (smaller); not WIDEN (larger). | `office_orgtree_depth_widen` |

If the parent has any of these set, do NOT redeclare them on the view as a
relaxation — inherit silently. If you absolutely need a different (relaxed)
value, the conversation belongs at the parent's level (or in
[AIP-7](/docs/aip-7) governance), not in this view. Narrowing depth is fine: a
parent's `maxDepth: 6` and a view's `maxDepth: 3` is allowed.

Cycle detection and depth-overflow are runtime warnings, not errors. Do not rely
on the warning — write a correct chain.

### 3. Identity (`legalName`, `jurisdiction`, `foundedAt`, `mission`, `defaultCurrency`)

Every manifest, root or view, MAY declare identity fields. Each leaf field
independently overrides via merge — a view MAY narrow `jurisdiction` while
inheriting `mission` from the parent.

```yaml
identity:
  legalName: Acme Corporation
  legalEntity: ws://companies/acme-corp
  jurisdiction: US # ISO 3166-1 alpha-2
  foundedAt: 2024-03-01 # ISO date
  mission: |
    Build the most useful AI products on the planet by giving
    builders the highest leverage on every task.
  defaultCurrency: USD # ISO 4217
  taxId: 99-9999999
```

Guidance:

- `legalEntity` is a self-ref when the manifest IS the legal entity, and a
  parent-entity ref when the manifest is a subsidiary.
- `jurisdiction` is uppercase ISO 3166-1 alpha-2 (US, GB, FR, DE, not "USA" or
  "France").
- `defaultCurrency` is uppercase ISO 4217 (USD, EUR, GBP, JPY).
- A divisional view typically inherits the parent's identity silently and
  overrides only what's specific to it.

### 4. Cross-AIP bindings

```yaml
executor: ws://operators/founder
governance: ../policies/org-default.yaml
work: ws://workspaces/main-tracker
agency: ws://agencies/acme-consulting
knowledge: ws://wikis/handbook/KNOWLEDGE.md
playbook: ws://playbooks/values
```

| Field        | Required    | When to set                                                                                                                                            |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor`   | optional    | Default org-level operator for company-level prompts.                                                                                                  |
| `governance` | optional    | Set when [AIP-7](/docs/aip-7) approval gates apply. Workspace-root manifests usually set this; views may override only if the parent's policy permits. |
| `work`       | optional    | Set to bind the company to an [AIP-20](/docs/aip-20) work tracker (the default tracker for the org's items).                                           |
| `agency`     | optional    | Set when the company also operates as a commercial [AIP-21](/docs/aip-21) agency.                                                                      |
| `knowledge`  | optional    | Set when items reference an [AIP-10](/docs/aip-10) wiki by default.                                                                                    |
| `playbook`   | optional    | Set when an [AIP-12](/docs/aip-12) playbook governs the company's culture / operating rhythm.                                                          |
| `appliesTo`  | conditional | REQUIRED in view mode (whenever `extends` is set AND the view binds to a consumer). MUST NOT be set in workspace-root mode.                            |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`office_appliesto_unresolvable`) — verify the consumer's workspace exists
before declaring the binding.

The host also refuses workspaces with unresolvable `executor`, `governance`,
`work`, `agency`, `knowledge`, or `playbook` refs (`office_xref_unresolvable`,
HARD). Do not bind to a workspace that hasn't been created yet.

### 5. Collections — inline vs ref vs aliased

`collections:` is the bridge to [AIP-18](/docs/aip-18). Three forms:

- **Inline.** Full AIP-18 collection.schema/v1 frontmatter embedded in
  `OFFICE.md`. Useful for small, single-tenant organisations.
- **File ref** (`./collections/<name>/COLLECTION.md`). Useful when the
  collection is shared with peer organisations.
- **Registry import** (`ws://collections/<slug>`). Useful for third-party or
  org-shared collections.

Aliasing (any ref form):

```yaml
collections:
  - ref: ws://collections/department
    alias: division # workspace-local rename
    version: "1.x" # pin schema range
```

Two collection entries resolving to the same effective name (alias or upstream
`name`) is a HARD failure (`office_collection_alias_conflict`). Pick aliases
deliberately.

Starter collections AIP-22 ships in `office-starters/`:

- `role` — a position held by an operator. Mirrors AIP-6's role.
- `objective` — a goal the org pursues. Mirrors AIP-6's objective.
- `department` — NEW: top-level org sub-unit (engineering, design, ops, etc.).
- `team` — NEW: smaller groups within departments.
- `policy` — NEW: internal HR / operating policy. NOT the same as AIP-7
  governance policies — see the collection's body.

The merged `collections[]` array is computed across the `extends:` chain via
merge-by-effective-name. Inheriting from the parent is the default; only
redeclare collections you want to override.

When extending an [AIP-18](/docs/aip-18) starter collection (e.g.
`office-starters/role`) with org-specific fields, write the extended collection
inline OR as a sibling file with its own `extends:` — and then ref the extended
file from `OFFICE.md`. Do NOT mutate the starter file in place.

### 6. Org-tree containment (the AIP-22 distinctive concept)

The org tree is AIP-22's centre of gravity. The matrix declares which collection
kinds nest under which:

```yaml
orgTree:
  containment:
    enabled: true
    field: parent
    rules:
      allowedKinds: [department, team, role]
      allowedParentKinds:
        team: [department] # team under department
        role: [team, department] # role under team OR department
        department: [department] # sub-departments allowed
      maxDepth: 6
```

Guidance:

- **`allowedKinds`** lists the collections that participate in the tree at all.
  `policy`, `objective`, etc. are typically NOT in the tree — they live outside
  it, attached by reference rather than containment.
- **`allowedParentKinds`** is a matrix. Keys are CHILD kinds; values are arrays
  of allowed PARENT kinds. The host enforces this at item-write time. Example: a
  `role` whose parent is a `policy` is refused with
  `office_orgtree_invalid_parent_kind`.
- **`maxDepth`** caps the tree depth. ONE-WAY on widening: once set, descendants
  may narrow but never widen. Pick deliberately — most orgs are 4-6 levels deep
  at most.
- **`enabled`** is the master switch. ONE-WAY on disable: once true, descendants
  cannot turn it off.

### 7. Reporting hierarchy rules

Reporting is logically separate from containment. A role's manager (`reportsTo`)
is independent from its containment parent (team it sits in).

```yaml
orgTree:
  reporting:
    enabled: true
    field: reportsTo
    cardinality: single # or multiple (matrixed)
    rules:
      mustResolveTo: role # the manager MUST be a role
      circularBan: true
```

Guidance:

- **`cardinality: single`** is the typical case (one manager per role). Use
  `multiple` only for matrixed orgs where `reportsTo` becomes an array.
- **`mustResolveTo`** is the kind the manager ref MUST point at. Almost always
  `role` — a role reports to another role.
- **`circularBan: true`** enforces an acyclic reporting graph. Set this true
  unless you have a very specific reason. The host refuses cycle-closing writes
  with `office_orgtree_circular_report` (HARD).

### 8. Workspace-spanning lints

AIP-18 lints are per-collection (`missing-owner`, `overdue`, `required-field`).
AIP-22 lints span collections:

```yaml
lints:
  - id: orphan-role
    kind: orphan-role
    severity: error
    params:
      collections: [role]
  - id: missing-manager-warn
    kind: missing-manager
    severity: warn
  - id: broken-report
    kind: broken-report
    severity: error
  - id: stale-objective-90d
    kind: stale-objective
    severity: warn
    params:
      days: 90
  - id: unassigned-objective
    kind: unassigned-objective
    severity: warn
```

Workspace-spanning lint kinds:

| Kind                   | Purpose                                                                                        | `params`             |
| ---------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| `orphan-role`          | Role item whose holder is no longer an active operator OR whose containment parent is missing. | `collections: [...]` |
| `broken-report`        | Role's `reportsTo` ref doesn't resolve.                                                        | none                 |
| `missing-manager`      | Role declared as needing a manager (per the per-collection schema) but `reportsTo` is unset.   | none                 |
| `unassigned-objective` | Objective with no accountable owner / role.                                                    | none                 |
| `stale-objective`      | Objective not updated in `days`.                                                               | `days: <n>`          |
| `custom`               | Host-defined, identified by `id`.                                                              | host-defined         |

Severity guidance:

- `error` — block writes that fail the lint.
- `warn` — surface in the audit log, do not block.
- `info` — surface in tooling only.

Child views may soften severity (warn → info). A parent's `governance:` policy
MAY forbid softening — the host enforces.

### 9. Routine workflow defaults

```yaml
defaults:
  workflow: ./workflows/monthly-report-graph-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true
```

| Field            | Values                                                       |
| ---------------- | ------------------------------------------------------------ |
| `workflow`       | path or ws:// ref to an [AIP-15](/docs/aip-15) `WORKFLOW.md` |
| `approvalClass`  | `auto` / `always` / `on-mutate` / `policy:<ref>`             |
| `auditMutations` | boolean — ONE-WAY SWITCH                                     |

`auditMutations: true` is one of the four one-way switches. Enable it
deliberately: once on at any ancestor, no descendant can disable it without
triggering `office_audit_downgrade` (HARD). For an organisation with any
compliance posture, this should be `true` at the root.

### 10. Display / UX hints

```yaml
display:
  homePage: DEPT-engineering
  defaultGrouping: department # kind | department | parent
  defaultView: tree # list | tree | board
```

Pure UI hints; no validation impact. `tree` is the typical pick — org charts
render naturally as trees.

### 11. Body prose (purpose, structure, conventions, what NOT to model)

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this organisation is, who it serves.

## Org structure

The human-readable rendering of the tree (departments → teams → roles).

## Conventions

When an item belongs in `department` vs `team`; when a role gets its own
collection vs extends `role`.

## What this workspace does NOT model

Set boundaries explicitly. Helps reviewers reject mis-modelled items.

## When to extend vs replace

Composition guidance for downstream view authors.
```

Keep the body short. The frontmatter is the contract; the body explains the
choices.

### 12. Validate against `OFFICE.schema.json`; if view, dry-run merge — and CHECK no one-way switch is relaxed

Validate the new manifest's frontmatter against
[AIP-22's schema](../../OFFICE.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-22/draft/OFFICE.schema.json \
  -d "<workspaceDir>/OFFICE.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends`.
- `collections[].alias` produces a name collision → rename or remove the alias.
- `orgTree.containment.rules.allowedParentKinds[<child>]` references collection
  names not in `allowedKinds` → fix the matrix.
- `orgTree.reporting.rules.mustResolveTo` references a collection not registered
  → register it or change the rule.
- `lints[].id` collisions inside one manifest → ids must be unique per manifest.
- `version` not semver → `1.0.0`, not `1` or `v1`.
- `identity.jurisdiction` not 2-letter ISO → use US, GB, FR, etc.
- `identity.defaultCurrency` not 3-letter ISO → use USD, EUR, GBP.

If view, run the host's resolution algorithm in dry-run mode and **explicitly
check that no one-way switch is relaxed**:

```md
## Merge diff: uk-research (vs parent acme-uk)

Inherited (no change):

- collections: role, objective, department, team
- identity.legalName: Acme UK Limited
- identity.jurisdiction: GB
- identity.defaultCurrency: GBP
- orgTree.containment.enabled: true (one-way; descendants cannot disable)
- orgTree.containment.rules.allowedKinds: [department, role, team]
- orgTree.containment.rules.maxDepth: 4 (one-way on widen)
- orgTree.reporting: enabled, single, mustResolveTo=role, circularBan=true
- defaults.auditMutations: true (one-way; descendants cannot disable)
- governance: ../../policies/group-default.yaml
- knowledge: ws://wikis/handbook-uk/KNOWLEDGE.md

Overridden:

- orgTree.containment.rules.maxDepth: 4 → 3 (NARROWING — allowed)
- display.homePage: undefined → DEPT-research
- display.defaultView: undefined → tree

Added:

- lints.research-stale-objective (kind=stale-objective, severity=warn)
- appliesTo: [ws://operators/research-lead]

One-way switch check: PASS

- defaults.auditMutations: parent=true, view=undefined → inherits true OK
- orgTree.containment.enabled: parent=true, view=undefined → inherits true OK
- orgTree.containment.rules.maxDepth: parent=4, view=3 → narrowing OK (3 < 4)
- governance.signing.required: parent=undefined, view=undefined → no constraint

Resolution chain: 3 levels (group → acme-uk → uk-research) Warnings: none
```

If the merge diff shows the view RELAXING any one-way switch (e.g.
`auditMutations: true → false`, `containment.enabled: true → false`,
`maxDepth: 4 → 8`, `signing.required: true → false`), the view will be
HARD-refused at load — fix it before declaring success.

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to parent's value via the merge).

## Final checklist

Before declaring done:

- [ ] `schema: office.workspace/v1` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing `OFFICE.md`;
      `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] `identity.jurisdiction` (if set) is uppercase 2-letter ISO.
- [ ] `identity.defaultCurrency` (if set) is uppercase 3-letter ISO.
- [ ] `collections[]` entries have unique effective names (alias or `name`);
      refs resolve; inline frontmatters validate against
      [AIP-18's COLLECTION.schema.json](../../../aip-18/draft/COLLECTION.schema.json).
- [ ] Per-item-kind concerns (fields, statuses, ownership rules) are NOT in
      `OFFICE.md` — they live on `COLLECTION.md` files.
- [ ] `orgTree.containment.rules.allowedKinds` references real collection names.
- [ ] `orgTree.containment.rules.allowedParentKinds` keys + values are all in
      `allowedKinds`.
- [ ] `orgTree.containment.rules.maxDepth` is set deliberately (one-way on
      widening).
- [ ] `orgTree.reporting.rules.mustResolveTo` references a registered
      collection.
- [ ] `orgTree.reporting.rules.circularBan` is `true` unless you have a strong
      reason.
- [ ] `lints[]` have unique `id`s within this manifest; severities respect any
      parent governance constraints.
- [ ] `defaults.auditMutations` is set deliberately (one-way).
- [ ] Cross-AIP refs (`executor`, `governance`, `work`, `agency`, `knowledge`,
      `playbook`) all resolve.
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `OFFICE.schema.json`.
- [ ] Body is short and prose-only.
- [ ] If view: dry-run merge diff was reviewed; **no one-way switch is
      relaxed**.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf, one path per level.
4. **Effective config summary** — the merged shape, in particular identity,
   which collections are active, the org-tree rules, the reporting
   configuration, and which one-way switches are now in effect.
5. **Bindings** — `executor`, `governance`, `work`, `agency`, `knowledge`,
   `playbook`, `appliesTo` (if set), each with a one-line note on what it does.
6. **One-way switch report** — for a view, an explicit per-switch line:
   `auditMutations: parent=<x>, view=<y>, status=PASS|FAIL`;
   `orgTree.containment.enabled: parent=<x>, view=<y>, status=...`;
   `orgTree.containment.rules.maxDepth: parent=<x>, view=<y>, status=...`
   (narrow / inherit / WIDEN-FAIL);
   `governance.signing.required: parent=<x>, view=<y>, status=...`.
7. **Validation result** — schema clean, dry-run merge clean, warnings (if any).
8. **Open assumptions** — fields you guessed (org-tree maxDepth, reporting
   cardinality, lint severities) that the user might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation — touch only the file
you are creating.

## See also

- [AIP-22 — agentoffice/v1 spec](/docs/aip-22)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this skill
  composes on
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — predecessor (deprecated)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP
- [AIP-12 — agentplaybooks/v1](/docs/aip-12)
- [AIP-15 — WORKFLOW.md](/docs/aip-15)
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-21 — agentagencies/v2](/docs/aip-21) — sibling Workspace AIP
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests
- [`../../OFFICE.schema.json`](../../OFFICE.schema.json) — frontmatter validator
- [`../../starters/office-starters/`](../../starters/office-starters) — starter
  collection library
