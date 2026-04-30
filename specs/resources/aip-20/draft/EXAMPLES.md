# EXAMPLES.md — agentwork/v2 reference patterns

Reference manifests exemplifying common authoring patterns for
[AIP-20](/docs/aip-20). Each example is a self-contained `WORK.md` a host could
load as-is. Manifest authors should copy the closest pattern and edit fields
rather than draft from scratch.

## Patterns covered

1. [Minimal workspace — solo dev tracker](#example-1--minimal-workspace--solo-dev-tracker)
2. [Per-operator view — eng lead lens](#example-2--per-operator-view--eng-lead-lens)
3. [Multi-collection workspace — engineering tracker](#example-3--multi-collection-workspace--engineering-tracker)
4. [Per-company composition — agency engagement](#example-4--per-company-composition--agency-engagement)
5. [Three-level chain — org → team → operator (one-way switch)](#example-5--three-level-chain--org--team--operator-one-way-switch)

---

## Example 1 — Minimal workspace — solo dev tracker

The smallest legal `WORK.md`: required frontmatter, one inline `task`
collection, status rollup off. Useful for a solo dev tracker that lives next to
the code, with no consumers, no governance, no agency context.

````yaml
---
schema: work.workspace/v2
name: solo-dev
title: Solo dev tracker
description: |
  Personal tracker for the solo dev. One inline 'task' collection,
  no rollup, no cross-AIP bindings. Lives at the repo root next to
  the code.
version: 1.0.0

collections:
  - inline:
      schema: collection.schema/v1
      name: task
      title: Task
      description: An atomic unit of work to complete.
      version: 1.0.0
      fields:
        - name: priority
          type: enum
          enum: [low, normal, high]
        - name: estimate
          type: number
          description: Estimated hours to complete.
      statuses:
        - { id: open, label: Open }
        - { id: in-progress, label: In progress, transitionsTo: [done, blocked] }
        - { id: blocked, label: Blocked, transitionsTo: [in-progress] }
        - { id: done, label: Done, terminal: true }
      initialStatus: open
      ownership:
        cardinality: single
        role: owner
        required: false
      deadline:
        kind: target-date
        required: false
        fieldName: dueAt

scope:
  containment:
    enabled: false
  applicability:
    enabled: false
  ownership:
    enabled: true
    field: owner
    policy: open

statusRollup:
  enabled: false

display:
  defaultGrouping: status
  defaultView: list
---

# Solo dev tracker

## Purpose

Personal task tracker. Just one collection, no rollups, no
governance.

## What this workspace does NOT track

- Multi-person initiatives — there is only one user.
- Cross-team coordination — out of scope.

## Examples

A typical task:

```yaml
---
schema: collection.item/v1
collection: task
id: TASK-1234
title: Refactor auth module
status: in-progress
priority: high
estimate: 4
---
````

````

**When to use.** Solo trackers, scratch notebooks, prototypes. The
workspace deliberately avoids declaring scope axes other than
ownership; there is nothing to compose with.

---

## Example 2 — Per-operator view — eng lead lens

A view that extends a shared engineering workspace, narrows
visibility to project + initiative collections (hides task), adds
a workspace-level lint, and rebinds the executor.

```yaml
---
schema: work.workspace/v2
name: eng-lead-view
title: Engineering lead view
description: |
  Engineering lead's lens on the shared engineering tracker.
  Surfaces only projects and initiatives; tasks are visible through
  parent rollups. Stricter stale-tree lint to catch initiatives
  that have stalled.
version: 1.0.0

extends: ../../engineering/WORK.md
appliesTo:
  - ws://operators/eng-lead

executor: ws://operators/eng-lead

# Inherit collections from parent, but the view uses scope filters
# in the host's UI to surface only project + initiative. The merged
# collections list still includes 'task' — the view doesn't disable
# it, just deprioritises it.
collections:
  - ref: ./collections/project/COLLECTION.md
  - ref: ./collections/initiative/COLLECTION.md

lints:
  - id: stale-initiative-tree
    kind: stale-tree
    severity: warn
    params:
      collections: [initiative]
      days: 14

display:
  defaultGrouping: parent
  defaultView: tree
---

# Engineering lead view

## Purpose

The eng lead's daily landing page. Project + initiative tree, with
stale-tree lint catching initiatives that haven't moved in two
weeks.

## When to extend vs replace

Sub-team leads extending this view should narrow `display.homePage`
to their root project, not redeclare the lints.
````

**When to use.** Whenever an operator (AIP-9) needs a lens on a shared tracker.
The view inherits the workspace's scope axes, status rollups, and one-way
switches; it adds only what's specific to the lead's role.

---

## Example 3 — Multi-collection workspace — engineering tracker

The full engineering tracker: three collections (`project`, `initiative`,
`task`) — two via file ref, one inline; status rollup ON; cross-AIP `governance`
binding. This is the kind of workspace the example-2 view extends.

```yaml
---
schema: work.workspace/v2
name: engineering
title: Engineering tracker
description: |
  Shared engineering coordination workspace. Tracks projects,
  initiatives, tasks, and bugs. Bound to the engineering wiki and
  the engineering governance policy.
version: 2.1.0

executor: ws://operators/eng-triage
governance: ../policies/engineering.yaml
knowledge: ws://wikis/engineering/KNOWLEDGE.md
playbook: ws://playbooks/eng-quarterly

collections:
  # Two starter collections from the agentwork-v1-compat library:
  - ref: ./collections/project/COLLECTION.md
  - ref: ./collections/initiative/COLLECTION.md
  # One inline collection extending the starter task with eng-specific fields:
  - inline:
      schema: collection.schema/v1
      name: task
      title: Engineering task
      description: |
        Atomic unit of engineering work. Adds 'component' and
        'estimate' fields on top of the starter task collection.
      version: 1.0.0
      extends: ../../starters/agentwork-v1-compat/task/COLLECTION.md
      fields:
        - name: component
          type: enum
          enum: [api, web, infra, mobile, docs]
          required: true
        - name: estimate
          type: number
          description: Estimated hours.
        - name: severity
          type: enum
          enum: [trivial, minor, normal, major, critical]
      ownership:
        cardinality: single
        role: assignee
        required: true
  # A registry import for cross-team bug reporting:
  - ref: ws://collections/issue
    alias: bug
    version: "1.x"

scope:
  containment:
    enabled: true
    field: parent
    rules:
      allowedKinds: [project, initiative]
      maxDepth: 3
  applicability:
    enabled: true
    field: appliesTo
    valueClass: role
  ownership:
    enabled: true
    field: owner
    policy: inherit

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

defaults:
  workflow: ./workflows/nightly-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true                     # one-way switch ON

display:
  homePage: PROJ-onboarding
  defaultGrouping: parent
  defaultView: board
---

# Engineering tracker

## Purpose

Coordination workspace for the engineering team. Projects contain
initiatives, initiatives contain tasks and bugs. Status rollup
surfaces blocked / at-risk parents automatically.

## Conventions

- A `task` is a one-person, one-week-or-less unit. Larger work is an
  `initiative`.
- A `bug` is a defect report. Bugs MAY have a project parent but
  often live un-parented.
- `appliesTo` carries roles, not specific operators. Use the role
  registry from the company workspace.

## What this workspace does NOT track

- Customer-facing roadmap items — those live in the product
  tracker.
- HR or hiring tasks — those live in the people tracker.

## When to extend vs replace

Sub-team views (web, infra, mobile) SHOULD extend this workspace
and narrow visibility via `appliesTo`. Forking is rarely the right
move; the registry-of-views pattern keeps everyone on one tree.
```

**When to use.** A multi-team coordination tracker. Mixes ref forms (file +
registry), declares all three scope axes, enables rollup, binds governance +
knowledge + playbook. The engineering team's canonical workspace — every view
extends from here.

---

## Example 4 — Per-company composition — agency engagement

A company workspace that extends a shared org tracker, adds an `okr` collection
ref, binds an [AIP-8](/docs/aip-8) agency for client-billable work, and binds an
[AIP-10](/docs/aip-10) wiki for institutional context.

```yaml
---
schema: work.workspace/v2
name: acme-engagement
title: Acme client engagement tracker
description: |
  Acme's per-client engagement tracker. Extends the shared
  org tracker; adds OKR tracking; binds the Acme-specific agency
  context for time-tracking and billable approvals; binds the
  client knowledge base for institutional context.
version: 1.4.0

extends: ../../org/WORK.md
appliesTo:
  - ws://companies/acme

agency: ws://agencies/internal-consulting
knowledge: ws://wikis/acme-client/KNOWLEDGE.md

collections:
  - ref: ws://collections/okr
    version: "2.x"
  # Inherit project / initiative / task from parent.

scope:
  applicability:
    enabled: true
    field: appliesTo
    valueClass: role-and-company

lints:
  - id: missing-billable-tag
    kind: custom
    severity: warn
    params:
      tag: billable
      collections: [project, initiative]

defaults:
  approvalClass: policy:../policies/billable-mutations.yaml

display:
  homePage: OKR-2026-Q2
  defaultGrouping: kind
  defaultView: board
---

# Acme client engagement

## Purpose

Tracks deliverables for the Acme account. Adds OKR tracking on top
of the shared org tracker; binds the Acme-specific agency for
billable approvals; binds the Acme knowledge base.

## Conventions

- Every billable item carries the `billable` tag — the
  `missing-billable-tag` lint surfaces unmarked items.
- OKRs use the org-shared `okr` registry collection (version 2.x).
- Time-tracking flows through the bound agency.

## What this workspace does NOT track

- Internal Acme team initiatives — that lives in the Acme team's
  own tracker, not this client engagement workspace.
```

**When to use.** Per-client / per-company composition where the company-specific
binding (agency, knowledge, custom lint) is added on top of a shared tracker.
The view inherits all the org-level scope axes and rollups; it only adds what's
company-specific.

---

## Example 5 — Three-level chain — org → team → operator (one-way switch)

A three-level composition demonstrating the one-way switch on
`defaults.auditMutations` and `scope.containment.enabled`. The org sets the
audit + containment switches; the team passes them through unchanged; the
operator's view CANNOT relax them. We also include a counter-example showing the
HARD refusal.

### Level 1 — Org workspace

`org/WORK.md`:

```yaml
---
schema: work.workspace/v2
name: org-root
title: Organisation tracker (root)
description: |
  Organisation-wide root workspace. Sets the audit switch and the
  containment-axis switch — both are one-way; descendants cannot
  relax them. Concrete collections are added by sub-team views.
version: 1.0.0

governance: ../policies/org-default.yaml

collections:
  - ref: ./collections/project/COLLECTION.md
  - ref: ./collections/initiative/COLLECTION.md
  - ref: ./collections/task/COLLECTION.md

scope:
  containment:
    enabled: true                          # ONE-WAY: descendants cannot disable
    field: parent
    rules:
      allowedKinds: [project, initiative]
      maxDepth: 4
  applicability:
    enabled: true
    field: appliesTo
    valueClass: role-and-company           # ONE-WAY: descendants cannot change
  ownership:
    enabled: true
    field: owner
    policy: inherit

defaults:
  approvalClass: on-mutate
  auditMutations: true                     # ONE-WAY: descendants cannot disable
---

# Org root

## Purpose

The organisation's root tracker. Every team and operator extends
this workspace; the audit + containment switches are set here so
no descendant can relax them.

## When to extend vs replace

Always extend. Forking the org root would lose the audit invariant
that compliance relies on.
```

### Level 2 — Team workspace

`teams/eng/WORK.md`:

```yaml
---
schema: work.workspace/v2
name: eng-team
title: Engineering team workspace
description: |
  Engineering team workspace. Inherits the org's audit and
  containment switches unchanged; adds an engineering-specific bug
  collection and the engineering wiki binding.
version: 1.2.0
extends: ../../org/WORK.md

knowledge: ws://wikis/engineering/KNOWLEDGE.md

collections:
  - ref: ws://collections/eng-bug
    alias: bug


# Containment + audit + applicability inherited unchanged.
# scope.applicability.valueClass remains 'role-and-company' (one-way).
# defaults.auditMutations remains true (one-way).
---
# Engineering team

## Purpose

Engineering team's lens on the org tracker. Adds bug tracking and the
engineering wiki; inherits everything else from the org.
```

### Level 3 — Operator view (CORRECT)

`operators/eng-lead/WORK.md`:

```yaml
---
schema: work.workspace/v2
name: eng-lead-view
title: Eng lead lens
description: |
  Engineering lead's lens on the team tracker. Narrows the homepage
  to the eng lead's root project; surfaces a per-lead lint. Does
  NOT touch the audit or scope one-way switches.
version: 1.0.0
extends: ../../teams/eng/WORK.md
appliesTo:
  - ws://operators/eng-lead

lints:
  - id: lead-stale-projects
    kind: stale-tree
    severity: warn
    params:
      collections: [project]
      days: 21
      ownerEquals: ws://operators/eng-lead

display:
  homePage: PROJ-eng-q2
  defaultView: tree
---
# Eng lead lens

## Purpose

Daily landing for the eng lead. Stricter stale-tree lint on the lead's own
projects, narrower default homepage.
```

The chain validates cleanly. The host computes the merged effective config,
exposes the resolution chain
(`org/WORK.md → teams/eng/WORK.md → operators/eng-lead/WORK.md`), and registers
all four collections (`project`, `initiative`, `task`, `bug`) under their
effective names.

### Level 3 — Operator view (COUNTER-EXAMPLE: HARD refusal)

A view that tries to relax the audit switch:

```yaml
---
schema: work.workspace/v2
name: eng-lead-view-broken
title: Eng lead lens (broken)
description: Tries to silence the audit log for this lens.
version: 1.0.0

extends: ../../teams/eng/WORK.md
appliesTo:
  - ws://operators/eng-lead

defaults:
  auditMutations: false # ATTEMPTS TO DOWNGRADE
---
```

**Result.** The host walks the resolution chain:

1. `org/WORK.md` sets `defaults.auditMutations: true`.
2. `teams/eng/WORK.md` inherits it (no override).
3. `operators/eng-lead/WORK.md` (this view) tries `false`.

The host MUST refuse the view with `work_audit_downgrade` (HARD). The view does
NOT degrade to local-only; it fails to load entirely. The author MUST remove
`defaults.auditMutations: false` to load the view at all.

The same posture applies if the view tries `scope.containment.enabled: false`
(refused with `work_scope_disable`) or `scope.applicability.valueClass: company`
(refused with `work_scope_value_class_drift`, since the org set
`role-and-company`).

**When to use.** Three-level (or deeper) compositions where compliance, audit,
or referential-integrity invariants must hold across every descendant. The
one-way switches make the resolution chain trustworthy without re-validating
every leaf.

---

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- [`./WORK.schema.json`](./WORK.schema.json) — frontmatter validator
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/agentwork-v1-compat/`](./starters/agentwork-v1-compat) — starter
  collection library
