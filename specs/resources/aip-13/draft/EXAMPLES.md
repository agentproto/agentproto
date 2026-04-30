# EXAMPLES.md — agentwork/v1 doctype reference patterns

Reference `PROJECT.md` / `INITIATIVE.md` / `TASK.md` files exemplifying common
patterns. Each example is a self-contained doctype a host could load as-is.
Authors should copy the closest pattern and edit fields rather than draft from
scratch.

Each example calls out the **three orthogonal axes** explicitly so readers can
see them stay separate:

- **Containment** = `parent` (cascade-delete semantics).
- **Applicability** = `scope.*` (most-restrictive wins, AND across fields,
  inherits from parent).
- **Ownership** = `assignee` (tasks) / `lead` (projects, initiatives) — mutable,
  may be `null` for unclaimed.

## Patterns covered

1. [Minimal task](#example-1--minimal-task)
2. [Initiative with child tasks](#example-2--initiative-with-child-tasks)
3. [Project with initiative tree](#example-3--project-with-initiative-tree)
4. [Task with cross-product applicability](#example-4--task-with-cross-product-applicability)
5. [Task owned by an operator (AIP-9)](#example-5--task-owned-by-an-operator-aip-9)
6. [Task linked to an objective (AIP-6)](#example-6--task-linked-to-an-objective-aip-6)
7. [Task with dependencies](#example-7--task-with-dependencies)
8. [Workspace root manifest (`WORK.md`)](#example-8--workspace-root-manifest-workmd)
9. [Per-operator view](#example-9--per-operator-view)
10. [Per-company composition](#example-10--per-company-composition-aip-6-binding)
11. [Multi-level chain](#example-11--multi-level-chain-org--team--operator)

---

## Example 1 — Minimal task

The smallest valid `TASK.md`. Top-level (no parent), unclaimed, visible to the
whole company.

```md
---
schema: work/v1
slug: write-launch-blog-post
kind: task
title: Write the launch announcement blog post
status: open
parent: null
scope:
  company: acme
assignee: null
priority: normal
---

# Write the launch announcement blog post

## Description

Draft a 600-word announcement post for next week's product launch. Aim for a
confident, slightly playful tone. Cover what shipped, who it's for, and one
customer quote.

## Acceptance criteria

- [ ] 600 words ±10%
- [ ] At least one customer quote
- [ ] Reviewed by founder before publish
```

**When to use.** A new task you're capturing fast — author knows the work,
doesn't yet know who'll do it, and trusts the company's default visibility. The
three axes are at their most relaxed: containment is empty (top-level),
applicability is the whole company, ownership is unclaimed. The fields are still
all explicitly set — notice `parent: null` and `assignee: null` are spelled out,
not omitted, so readers see the author chose those values deliberately.

---

## Example 2 — Initiative with child tasks

An initiative containing two tasks. The tasks **inherit scope** from the
initiative — note they don't repeat `scope.company`.

`initiatives/q2-onboarding-revamp/INITIATIVE.md`:

```md
---
schema: work/v1
slug: q2-onboarding-revamp
kind: initiative
title: Q2 onboarding revamp
status: in-progress
parent: null
scope:
  company: acme
  role: marketing
lead:
  kind: operator
  ref: alice
deadline: 2026-06-30T23:59:59Z
priority: high
labels: [marketing, onboarding, q2]
---

# Q2 onboarding revamp

## Description

Modernise the onboarding email sequence and self-serve setup flow to lift
activation by 15%. Spans copy, design, and product changes.

## Outcomes

- 15% lift in 7-day activation rate.
- Reduced time-to-first-value to under 10 minutes.
```

`tasks/draft-onboarding-emails/TASK.md`:

```md
---
schema: work/v1
slug: draft-onboarding-emails
kind: task
title: Draft the new onboarding email sequence
status: claimed
parent:
  kind: initiative
  ref: q2-onboarding-revamp
scope: {}
assignee:
  kind: operator
  ref: alice
priority: high
---

# Draft the new onboarding email sequence

…
```

`tasks/redesign-setup-flow/TASK.md`:

```md
---
schema: work/v1
slug: redesign-setup-flow
kind: task
title: Redesign the self-serve setup flow
status: open
parent:
  kind: initiative
  ref: q2-onboarding-revamp
scope: {}
assignee: null
priority: high
---

# Redesign the self-serve setup flow

…
```

**When to use.** The work has multiple discrete deliverables but a single
coordinated outcome. The initiative carries the _why_ and the deadline; tasks
carry the _what_ and the assignment. Both child tasks have `scope: {}` — they
inherit `company: acme, role: marketing` from the initiative. Ownership differs
(alice claimed one, the other is unclaimed) without affecting visibility.

---

## Example 3 — Project with initiative tree

A long-lived project containing two initiatives, themselves containing tasks.
Containment is two-deep; scope is inherited through both layers.

`projects/customer-success/PROJECT.md`:

```md
---
schema: work/v1
slug: customer-success
kind: project
title: Customer Success
status: in-progress
parent: null
scope:
  company: acme
  project: customer-success
lead:
  kind: operator
  ref: bob
members:
  - kind: operator
    ref: alice
  - kind: operator
    ref: bob
  - kind: role
    ref: support
priority: normal
labels: [cs, ongoing]
---

# Customer Success

## Description

The standing project that owns post-sale customer health, churn-reduction work,
and renewal motions.
```

`initiatives/q2-renewal-push/INITIATIVE.md`:

```md
---
schema: work/v1
slug: q2-renewal-push
kind: initiative
title: Q2 renewal push
status: in-progress
parent:
  kind: project
  ref: customer-success
scope: {}
lead:
  kind: operator
  ref: bob
deadline: 2026-06-30T23:59:59Z
priority: high
---

# Q2 renewal push

…
```

`tasks/contact-top-20-accounts/TASK.md`:

```md
---
schema: work/v1
slug: contact-top-20-accounts
kind: task
title: Personally contact the top 20 accounts up for renewal
status: in-progress
parent:
  kind: initiative
  ref: q2-renewal-push
scope: {}
assignee:
  kind: operator
  ref: bob
priority: high
---

# Personally contact the top 20 accounts up for renewal

…
```

**When to use.** Long-lived workstreams with rolling initiatives. The project
sets `scope.project: customer-success` once at the root; every descendant
inherits it. The resolver climbs two levels for the task — initiative → project
— to compute effective scope. The project's `members[]` narrows access below
role level: even if a support-role operator exists, only listed members see
project content.

---

## Example 4 — Task with cross-product applicability

A task scoped to a single role across no specific operator. Visible to everyone
in `role: design` company-wide, regardless of which project they're in.

```md
---
schema: work/v1
slug: refresh-brand-tokens
kind: task
title: Refresh brand-token palette across products
status: open
parent: null
scope:
  company: acme
  role: design
assignee: null
priority: normal
labels: [design, brand, cross-product]
---

# Refresh brand-token palette across products

## Description

Roll out the updated brand tokens (introduced in the rebrand last month) to
every product surface. Owners of individual products should self-claim slices.

## Acceptance criteria

- [ ] All product apps reference the new tokens
- [ ] Storybook regenerated
- [ ] Old token definitions removed
```

**When to use.** Cross-cutting work that doesn't belong to a single project but
is relevant to a specific role. `scope.role: design` makes it visible to
designers across the company; `scope.project` deliberately empty (no narrowing);
`assignee: null` so any designer can self-claim. **Note** scope.role is _who can
see and pick this up_, not _who must do it_ — the latter is ownership, set when
someone claims.

---

## Example 5 — Task owned by an operator (AIP-9)

A task assigned to a specific [AIP-9](/docs/aip-9) operator, with the work
itself visible to a broader audience. Demonstrates the ownership / applicability
split.

```md
---
schema: work/v1
slug: investigate-checkout-error-spike
kind: task
title: Investigate the 2026-04-27 checkout 500 spike
status: in-progress
parent: null
scope:
  company: acme
  role: engineering
assignee:
  kind: operator
  ref: pager-bot
priority: high
deadline: 2026-04-29T17:00:00Z
labels: [incident, checkout, billing]
---

# Investigate the 2026-04-27 checkout 500 spike

## Description

Yesterday between 14:00–14:40 UTC, checkout 500 rate climbed to 12% before
recovering. Logs and metrics linked below.

## Acceptance criteria

- [ ] Root cause identified
- [ ] Post-mortem doc started in the wiki
- [ ] Followup task filed for any code change

## Scratchpad

…
```

**When to use.** Highlight that `assignee` resolves against the
[AIP-9 OPERATOR.md](/docs/aip-9) catalog — `pager-bot` is an operator,
identified the same way a human teammate would be. The _applicability_ axis
(`scope.role: engineering`) means everyone in engineering can see, comment, and
reassign; the _ownership_ axis (`assignee`) says pager-bot is currently driving.
If pager-bot escalates to a human, only the assignee changes — scope and parent
are untouched.

---

## Example 6 — Task linked to an objective (AIP-6)

A task that contributes to an [AIP-6 OBJECTIVE.md](/docs/aip-6). Linkage uses
`attachments.objectives[]` (slug ref, not path).

```md
---
schema: work/v1
slug: ship-self-serve-billing
kind: task
title: Ship self-serve billing UI
status: in-progress
parent:
  kind: project
  ref: monetisation
scope: {}
assignee:
  kind: operator
  ref: carol
attachments:
  objectives: [reduce-sales-touch-on-smb]
  wiki: [billing-architecture]
  lessons: [q1-pricing-experiment]
deadline: 2026-05-15T17:00:00Z
priority: high
labels: [billing, monetisation]
---

# Ship self-serve billing UI

## Description

Build the in-product billing self-service UI so SMB customers upgrade without a
sales touch. Tied to the
[reduce-sales-touch-on-smb](../../objectives/reduce-sales-touch-on-smb/OBJECTIVE.md)
objective.

## Acceptance criteria

- [ ] Plan picker, payment method update, invoice download
- [ ] Linked from settings.com/billing
- [ ] Telemetry events fire on plan-change
```

**When to use.** The work supports a higher-level objective without _containing_
it (objectives outlive tasks; cascading would be wrong).
`attachments.objectives[]` is the right home — it's informational, NOT
cascade-delete. If the objective is closed or archived, this task survives. If
the task is archived, the objective is unaffected. Same pattern works for
`attachments.deliverables[]`, `attachments.wiki[]`, `attachments.lessons[]` —
all are inert references.

---

## Example 7 — Task with dependencies

A task that can't start until two upstream deliverables are ready. AIP-13
doesn't ship a dedicated `dependsOn` field — dependencies flow through
`attachments.deliverables[]` and (informally) through status of upstream tasks.

```md
---
schema: work/v1
slug: prepare-launch-press-kit
kind: task
title: Assemble the launch press kit
status: blocked
parent:
  kind: project
  ref: q2-launch
scope: {}
assignee:
  kind: operator
  ref: dana
attachments:
  deliverables:
    - hero-product-shots
    - founder-quotes-finalised
  conversations:
    - launch-comms-thread
deadline: 2026-05-20T12:00:00Z
priority: high
labels: [comms, launch]
---

# Assemble the launch press kit

## Description

Bundle the hero shots, founder quotes, product spec sheet, and embargo notes
into a press-kit zip. Cannot start until both upstream deliverables are `done`.

## Acceptance criteria

- [ ] Press kit zip in the workspace
- [ ] One-page key-messages summary
- [ ] Embargo date stamped on every asset

## Why blocked

Waiting on:

- `hero-product-shots` (deliverable, currently in-progress)
- `founder-quotes-finalised` (deliverable, in-progress)

Will move to `claimed` automatically (host adapter prompt) when both upstreams
reach `done`.
```

**When to use.** Sequenced work with explicit upstream dependencies. The status
`blocked` documents _why_ it's not progressing; the `attachments.deliverables[]`
list documents _what_ it's waiting on. The host adapter's dependency-resolution
layer (see
[ADAPTER.md § Dependency resolution](./ADAPTER.md#dependency-resolution)) SHOULD
surface a UI prompt when upstream deliverables reach `done`, suggesting the user
transition this task off `blocked`. The spec doesn't auto-transition — silent
state changes erode trust in the audit log.

---

---

## Example 8 — Workspace root manifest (`WORK.md`)

The `WORK.md` that lives at the work-tree root for an engineering team's
tracker. It declares which item kinds are first-class, the status state machine,
scope-axis defaults, lint policy, and binds the workspace to an executor
operator and a knowledge wiki.

`my-company/WORK.md`:

```md
---
schema: work.workspace/v1
name: acme-engineering
title: Acme engineering tracker
description: |
  The shared engineering work tracker for Acme. Tracks projects (long-
  lived workstreams), initiatives (quarter-scoped efforts), and tasks
  (the unit of execution). Companion to the engineering wiki and bound
  to the standing approval policy for production-changing work.
version: 1.0.0
executor: ws://operators/eng-router
knowledge: ws://wikis/engineering/KNOWLEDGE.md
governance: ../policies/engineering-work.yaml

itemKinds:
  - name: project
    enabled: true
    icon: 📦
    description: Long-lived workstream owned by a single engineer.
  - name: initiative
    enabled: true
    icon: 🎯
    description: Quarter-scoped effort that bundles multiple tasks.
  - name: task
    enabled: true
    icon: ✅
    description: Unit of execution. Default kind for new work.

statuses:
  - id: backlog
    label: Backlog
    terminal: false
    transitionsTo: [in-progress, archived]
  - id: in-progress
    label: In progress
    terminal: false
    transitionsTo: [done, blocked, archived]
  - id: blocked
    label: Blocked
    terminal: false
    transitionsTo: [in-progress, archived]
  - id: done
    label: Done
    terminal: true
    transitionsTo: [archived]
  - id: archived
    label: Archived
    terminal: true
    transitionsTo: []

scope:
  defaultOwner: ws://operators/eng-router
  ownershipPolicy: inherit

lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: task
    severity: warn
  - id: overdue-14d
    kind: overdue
    appliesTo: "*"
    severity: warn
    params:
      days: 14
  - id: stale-30d
    kind: stale
    appliesTo: task
    severity: info
    params:
      days: 30
  - id: broken-attachment
    kind: broken-ref
    appliesTo: "*"
    severity: error

defaults:
  approvalClass: on-mutate

display:
  defaultGrouping: status
---

# Acme engineering tracker

## Purpose

This is the canonical work tracker for the engineering team. Every engineering
project, initiative, and task lives under this workspace. Per-operator views
narrow the lens for triage agents, on-call runbots, and individual engineers.

## Conventions

- Tasks default to the `eng-router` operator if no `assignee` is set. The router
  auto-assigns based on labels; humans can override.
- Production-changing work (anything with `labels: [prod]`) requires approval
  per `defaults.approvalClass: on-mutate`.
- Closing a task transitions to `done`; archiving is reserved for cancelled or
  obsolete work.
```

**When to use.** This is what every engineering team's `WORK.md` should look
like as a starting point. It declares the three base kinds, the standard
six-state status machine, and a single executor operator. The `governance`
binding makes scope-widening, terminal flips, and lint-softening reviewable
through one policy file. `knowledge:` lets `attachments.wiki[]` on individual
tasks resolve slugs against the engineering wiki by default — authors don't have
to repeat the wiki path on every task.

---

## Example 9 — Per-operator view

The engineering lead's narrower lens on the workspace from Example 8. Focuses on
projects + initiatives (not individual tasks), filters ownership to the lead's
circle, and softens the overdue lint because the lead manages around blockers
rather than chasing dates.

`operators/eng-lead/WORK.md`:

```md
---
schema: work.workspace/v1
name: eng-lead-view
title: Engineering lead view
description: |
  The engineering lead's lens on the Acme engineering tracker. Hides
  task-level work (the lead trusts engineers to drive their own
  tasks); focuses on projects and initiatives. Softens overdue and
  hides done items by default.
version: 1.0.0
extends: ../../my-company/WORK.md
appliesTo:
  - ws://operators/eng-lead

itemKinds:
  - name: task
    enabled: false # lead doesn't track individual tasks

scope:
  defaultApplicability: [eng-leads] # narrow new items to the eng-leads circle

lints:
  - id: overdue-14d
    kind: overdue
    appliesTo: "*"
    severity: info # softened from 'warn'

display:
  defaultGrouping: kind # group by project / initiative
---

# Engineering lead view

## Purpose

The lead doesn't operate on tasks day-to-day. This view hides them to keep the
surface manageable, leaves projects and initiatives visible, and softens overdue
notifications because the lead manages around blockers rather than chasing
dates.

## What this view changes

- Disables `task` kind (still exists in the parent — just hidden in this lens).
- Softens `overdue-14d` from `warn` to `info`.
- Sets `defaultGrouping: kind` so the lead sees projects vs initiatives at a
  glance.
- Inherits everything else from the workspace root: status state machine,
  governance binding, knowledge wiki, executor operator.
```

**When to use.** A specific role wants a different lens on the same tracker
without forking the rules. Inheritance keeps the lead in sync with the team —
when the workspace adds a new lint or tightens governance, the lead's view picks
it up automatically. The view only declares what's _different_: kind filter,
scope defaults, lint severity, display grouping. Everything else flows through
the merge. **Inherited:** statuses, governance, knowledge, executor, lints
(except the softened `overdue-14d`), defaults, item kinds (except the disabled
`task`). **Overridden:** lint severity, display grouping. **Added:**
`appliesTo`, `scope.defaultApplicability`, `itemKinds.task.enabled: false`.

---

## Example 10 — Per-company composition (AIP-6 binding)

A company-level view on a shared org workspace. Adds a custom kind (`bug`),
binds the company to a specific governance policy, and links to the company's
own knowledge wiki rather than the org-wide one.

`companies/acme/WORK.md`:

```md
---
schema: work.workspace/v1
name: acme-company-view
title: Acme company tracker view
description: |
  The Acme company's lens on the org-wide engineering workspace.
  Adds a 'bug' kind for customer-reported issues, binds Acme's
  governance policy, and points to Acme's product wiki.
version: 1.0.0
extends: ../../org/WORK.md
appliesTo:
  - ws://companies/acme

governance: ./policies/acme-strict.yaml # override org default
knowledge: ws://wikis/acme-product/KNOWLEDGE.md

itemKinds:
  - name: bug
    enabled: true
    icon: 🐛
    fields: [reportedBy, severity, customerImpact]
    description: Customer-reported defect. Tracked separately from tasks.

statuses:
  - id: triage
    label: Triage
    terminal: false
    transitionsTo: [in-progress, backlog, archived]

lints:
  - id: bug-needs-severity
    kind: custom
    appliesTo: bug
    severity: error
    params:
      requireField: severity

scope:
  defaultOwner: ws://operators/acme-triage-bot
  ownershipPolicy: strict # bugs MUST match scope.applicability
---

# Acme company tracker view

## Purpose

The Acme product team operates on top of the shared engineering workspace, with
two narrowings: a `bug` kind for customer-reported issues (tracked separately so
they don't pollute the regular task backlog) and a stricter ownership policy
because customer-impact bugs need a clear owner from the moment they're filed.

## What this view changes

- **Adds** the `bug` kind with custom fields (`reportedBy`, `severity`,
  `customerImpact`).
- **Adds** a `triage` status that comes before `in-progress` for new bugs.
- **Adds** the `bug-needs-severity` lint — bugs without a `severity` field fail
  validation.
- **Overrides** `governance` to the Acme-specific strict policy (parent's policy
  permits this — verify before declaring).
- **Overrides** `knowledge` to point at Acme's product wiki.
- **Tightens** `scope.ownershipPolicy` from `inherit` to `strict`.

## Cross-AIP composition

- [AIP-6](/docs/aip-6) `appliesTo: ws://companies/acme` — this view activates
  whenever an operator loads inside the Acme company.
- [AIP-7](/docs/aip-7) `governance: ./policies/acme-strict.yaml` — Acme's policy
  is the gate for status transitions and ownership changes inside this view.
- [AIP-9](/docs/aip-9) `scope.defaultOwner` — Acme's triage bot catches new
  items by default.
- [AIP-10](/docs/aip-10) `knowledge:` — `attachments.wiki[]` on Acme's tasks
  resolves against the product wiki, not the org wiki.
```

**When to use.** A company shares the org workspace but needs domain-specific
kinds, stricter ownership, or its own governance binding. The view declares only
what's specific to the company; the rest of the workspace (item kinds, base
statuses, base lints, default workflow) flows through. **Inherited:**
project/initiative/task kinds, the org's base statuses
(backlog/in-progress/blocked/done/ archived), org-wide lints, defaults.
**Overridden:** governance, knowledge, ownership policy, default owner.
**Added:** `bug` kind, `triage` status, `bug-needs-severity` lint, `appliesTo`.

---

## Example 11 — Multi-level chain (org → team → operator)

A three-level chain showing how merge precedence accumulates. Org workspace at
the top sets defaults; the engineering team narrows; the on-call operator
narrows further.

**Level 1 — `org/WORK.md`** (workspace root):

```yaml
---
schema: work.workspace/v1
name: acme-org
title: Acme org-wide tracker
description: Org-wide work tracker. Departments compose narrower views.
version: 2.0.0

itemKinds:
  - name: project
    enabled: true
  - name: task
    enabled: true

statuses:
  - id: backlog
    label: Backlog
    terminal: false
    transitionsTo: [in-progress, archived]
  - id: in-progress
    label: In progress
    terminal: false
    transitionsTo: [done, archived]
  - id: done
    label: Done
    terminal: true
    transitionsTo: [archived]
  - id: archived
    label: Archived
    terminal: true
    transitionsTo: []

lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: task
    severity: warn

defaults:
  approvalClass: auto
---
```

**Level 2 — `org/engineering/WORK.md`** (team view):

```yaml
---
schema: work.workspace/v1
name: acme-engineering-view
title: Engineering team view
description:
  Engineering team narrows org defaults — adds initiative kind, tightens
  approval.
version: 1.1.0

extends: ../WORK.md
appliesTo:
  - ws://companies/acme-engineering

itemKinds:
  - name: initiative
    enabled: true
    icon: 🎯

defaults:
  approvalClass: on-mutate

executor: ws://operators/eng-router
---
```

**Level 3 — `operators/oncall/WORK.md`** (operator view):

```yaml
---
schema: work.workspace/v1
name: oncall-view
title: On-call operator view
description: Pages on stale > 24h, focuses on tasks, ignores initiatives.
version: 1.0.0

extends: ../../org/engineering/WORK.md
appliesTo:
  - ws://operators/oncall

itemKinds:
  - name: project
    enabled: false
  - name: initiative
    enabled: false

lints:
  - id: stale-1d
    kind: stale
    appliesTo: task
    severity: error
    params:
      days: 1

scope:
  defaultOwner: ws://operators/oncall
---
```

**Effective config for the on-call view (after merge):**

| Field                                     | Source  | Value                                        |
| ----------------------------------------- | ------- | -------------------------------------------- |
| `name`, `title`, `description`, `version` | level 3 | on-call identity                             |
| `appliesTo`                               | level 3 | `[ws://operators/oncall]` (local-only)       |
| `extends`                                 | level 3 | `../../org/engineering/WORK.md` (local-only) |
| `executor`                                | level 2 | `ws://operators/eng-router` (inherited)      |
| `governance`                              | (none)  | unset across all levels                      |
| `itemKinds.project.enabled`               | level 3 | `false`                                      |
| `itemKinds.task.enabled`                  | level 1 | `true` (inherited through level 2)           |
| `itemKinds.initiative.enabled`            | level 3 | `false`                                      |
| `statuses`                                | level 1 | inherited through both levels                |
| `lints.missing-owner`                     | level 1 | `severity: warn` (inherited)                 |
| `lints.stale-1d`                          | level 3 | added by on-call                             |
| `defaults.approvalClass`                  | level 2 | `on-mutate` (inherited from team)            |
| `scope.defaultOwner`                      | level 3 | `ws://operators/oncall`                      |

**Resolution chain:** `org/WORK.md` → `org/engineering/WORK.md` →
`operators/oncall/WORK.md` (3 levels, no warnings).

**When to use.** Large orgs where multiple departments and operator roles need
lenses on a shared work substrate. The pattern composes without explosion: a new
operator adds one `WORK.md`, declares only what's specific, and the merge does
the rest. The chain stays under the eight-level cap (a depth-of-three is typical
and well-supported) and every level remains independently auditable — reviewers
walk the chain, not the merged config, when reasoning about _why_ a field ended
up where it did.

---

## Anti-patterns to avoid

- **Collapsing scope and ownership.** `scope.operator: alice` to mean "alice is
  doing this" is wrong — that's `assignee.ref: alice`. The first hides the task
  from everyone else; the second leaves it visible while assigning her.
- **Using `parent` for an attachment.** If removing the parent shouldn't remove
  this row, it's not a parent. Use `attachments.*` instead.
- **Cascading attachments on parent delete.** The spec FORBIDS this. Hosts that
  cascade are non-conformant — silent destruction of unrelated wiki pages and
  files is the bug AIP-13 mitigates.
- **Empty `scope: {}` on a top-level doctype.** A doctype with no parent MUST
  declare `scope.company`. The schema rejects.
- **Widening scope on a child.** A child whose `scope.role` is broader than its
  parent's effective scope is a scope-evasion bug — linters reject.
- **Tasks with `lead` or projects with `assignee`.** Per-kind constraints —
  schema rejects. Pick the right field for the doctype.
- **Status transitions skipping intermediate states.** A status transition
  outside the state machine table is rejected by the host. If you need
  `open → done` immediately, go through `claimed → in-progress → done` (or use
  `archived` for cancel-without-do).
- **Trusting `_index/work.json` for security checks.** The index is a UI cache.
  Always read the file tree for visibility, audit, or assignment authority.

## See also

- [AIP-13 — agentwork/v1 spec](/docs/aip-13)
- [AIP-6 — OBJECTIVE.md](/docs/aip-6)
- [AIP-8 — DELIVERABLE.md](/docs/aip-8)
- [AIP-9 — OPERATOR.md](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — `KNOWLEDGE.md` workspace, the
  structural sibling of `WORK.md`
- [AIP-11 — lessons/v1](/docs/aip-11)
- [AIP-15 — agentroutines/v1](/docs/aip-15)
- [`./skills/author-work-item/SKILL.md`](./skills/author-work-item/SKILL.md) —
  agent-side per-item authoring skill
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side workspace-manifest authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json) — manifest validator
  (work-item + workspace branches)
