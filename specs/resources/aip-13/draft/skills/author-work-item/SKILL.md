---
schema: skills/v1
name: author-work-item
title: Author a PROJECT / INITIATIVE / TASK doctype (AIP-13)
description:
  Walk through authoring a portable agentwork/v1 doctype — project, initiative,
  or task — with a unified scope vocabulary that keeps containment,
  applicability, and ownership as three orthogonal axes.
version: 1.0.0
tags: [aip-13, work, projects, initiatives, tasks, scope, agentproto]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One-paragraph statement of the work to capture. The skill picks the right
      doctype (project / initiative / task) and fills the scope axes.
  - name: companySlug
    type: string
    required: true
    description:
      AIP-6 company slug this work belongs to. Sets the scope.company root.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a company root. If omitted, the skill writes under
      `./projects/`, `./initiatives/`, or `./tasks/` relative to the current
      company.
examples:
  - input:
      intent: A new task for alice to draft the Q2 onboarding email sequence.
      companySlug: acme
    output:
      - tasks/draft-q2-onboarding-emails/TASK.md
---

# Author a work-item doctype (AIP-13)

Use this skill when the user asks to **capture, plan, or assign work** that
another operator (human or agent) will pick up. The skill produces a valid
[AIP-13 agentwork/v1](/docs/aip-13) doctype — `PROJECT.md`, `INITIATIVE.md`, or
`TASK.md` — using the canonical `defineProject` / `defineInitiative` /
`defineTask` signatures.

## When to use

- "Create a project for the Q3 launch."
- "Draft a task for alice to write the onboarding email."
- "Capture this initiative across marketing and sales."
- "Plan the work for objective <slug>."

## When NOT to use

- The user wants to **describe a multi-step automation** with explicit control
  flow → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/skills/author-workflow/SKILL.md).
- The user wants to **define an objective / goal** (the _why_, not the _what_) →
  use [AIP-6 OBJECTIVE.md](/docs/aip-6) — work items _reference_ objectives,
  they don't replace them.
- The user wants to **call** an existing work item — no authoring needed.

## The three axes — keep them orthogonal

The single most important thing this skill teaches: every work-item field maps
to exactly **one** of three orthogonal axes. Conflating them is the bug AIP-13
fixes.

| Axis              | Field                                               | Question it answers           | Lifecycle                          |
| ----------------- | --------------------------------------------------- | ----------------------------- | ---------------------------------- |
| **Containment**   | `parent`                                            | What is this part of?         | Stable — set once at creation.     |
| **Applicability** | `scope.*`                                           | Who is this relevant to?      | Mostly stable — narrows over time. |
| **Ownership**     | `assignee` (tasks) / `lead` (projects, initiatives) | Who is responsible RIGHT NOW? | Mutable — changes as work moves.   |

Three null states that look similar but mean different things:

- `assignee: null` — unclaimed, free to pick up.
- `scope.operator: null` — not narrowed to a single operator (anyone in scope
  can see it).
- `scope.role: null` — not narrowed to a role.

Never collapse them. If a doctype's body says "this is for alice", that's
`assignee.ref: alice` — NOT `scope.operator: alice`. The first means _alice
should do it_; the second means _only alice can see it_.

## Process

Eight steps. The first three are picking the doctype and filling the three axes
— that's where the spec earns its keep.

### 1. Pick the doctype

```
Is the unit of work a single discrete deliverable?  → TASK
Is it a coordinated bundle of tasks toward an outcome?  → INITIATIVE
Is it a long-lived workstream containing multiple initiatives?  → PROJECT
```

Rule of thumb on cardinality:

- **Tasks** are leaves. They have an `assignee`. They get done.
- **Initiatives** are mid-tier. They have a `lead`. They contain tasks (and
  sometimes sub-initiatives).
- **Projects** are roots. They have a `lead` and `members[]`. They contain
  initiatives and ad-hoc tasks.

Do not nest more than one project deep. If you need "project of projects", you
probably want an [AIP-6 OBJECTIVE.md](/docs/aip-6) at the top instead.

### 2. Fix containment (`parent`)

`parent` answers _what is this a part of_, with cascade-delete semantics. If the
parent is removed, the child SHOULD be removed too.

- `parent: null` for top-level work (most projects, occasional free-floating
  tasks).
- `parent: { kind: project, ref: <slug> }` for an initiative inside a project,
  or a task hanging directly off a project.
- `parent: { kind: initiative, ref: <slug> }` for a task or sub-initiative
  inside an initiative.

If removing the parent SHOULDN'T remove this row — it's an _attachment_, not a
parent. Use `attachments.*` instead (step 4).

### 3. Fill scope (applicability) — most-restrictive wins

Scope is a **visibility / applicability** axis, not an ownership axis. Ask: "who
is this work even _relevant_ to?"

```yaml
scope:
  company: acme # REQUIRED at the chain root.
  role: design # OPTIONAL — narrows to AIP-6 ROLE.md members.
  operator: alice # OPTIONAL — narrows to a single operator.
  project: onboarding-v2 # OPTIONAL — narrows to project members.
```

Rules:

- `scope.company` MUST be set at the root of an inheritance chain. Children MAY
  omit and inherit.
- Cross-axis combination is **AND**. `{ role: design, project: onboarding }`
  means "members of role:design who are ALSO members of project:onboarding".
- The most-restrictive non-empty field wins. `scope.operator: alice` is
  invisible to everyone except alice and auditors, regardless of `scope.role`.
- Children inherit empty fields from `parent`. Children CANNOT widen scope they
  didn't declare — linters reject this.

If you find yourself wanting to write _"only alice can do this"_ in scope, stop.
That's ownership (step 5). Scope says _who can see it_.

### 4. Add attachments (informational refs)

`attachments.*` is the second half of the containment-vs-reference distinction.
Removing an attachment target MUST NOT cascade.

```yaml
attachments:
  artifacts: [<fileId-or-path>] # AIP-? files
  wiki: [pricing-strategy] # AIP-10
  lessons: [post-mortem-q1-launch] # AIP-11
  conversations: [<conv-id>]
  deliverables: [renewal-deck-v2] # AIP-8
```

Cross-AIP refs use the family's standard ref form:
`{ kind: <doctype>, ref: <slug> }` for cascading containment, or a plain slug/id
list for attachments. Never use a filesystem path — slugs survive directory
restructures.

### 5. Set ownership (`assignee` or `lead`)

Tasks use `assignee`; projects and initiatives use `lead`. Same shape.

```yaml
# Task
assignee:
  kind: operator | user
  ref: alice

# Project / Initiative
lead:
  kind: operator | user
  ref: founder
```

Cross-AIP: when `kind: operator`, the `ref` MUST resolve against the
[AIP-9 OPERATOR.md](/docs/aip-9) catalog. The runtime SHOULD validate this at
write-time and warn if the operator is unknown — silent mis-references rot.

`null` = unclaimed. Use `null` deliberately for tasks anyone in scope can pick
up.

### 6. Pick the status

Status is the ownership-axis state machine, not the applicability one. Six
states, with this transition graph:

```
open ──▶ claimed ──▶ in-progress ──▶ done
  │         │             │
  │         ▼             ▼
  └─▶ blocked ◀───────────┘
              │
              ▼
          archived
```

- `open` — created, no `assignee`. Anyone in scope can claim.
- `claimed` — `assignee` set, work hasn't started.
- `in-progress` — actively being worked.
- `blocked` — paused on an external dependency. Body SHOULD note why and what
  unblocks it.
- `done` — terminal success.
- `archived` — terminal non-success (cancelled, obsolete, dedup'd).

Authoring usually starts at `open` (or `claimed` if `assignee` is known).

### 7. Compose the file

Write the doctype at `<company-root>/<kind-plural>/<slug>/<KIND>.md`:

```md
---
schema: work/v1
slug: draft-q2-onboarding-emails
kind: task
title: Draft Q2 onboarding email sequence
status: claimed
parent:
  kind: initiative
  ref: q2-onboarding-revamp
scope:
  company: acme
  role: marketing
assignee:
  kind: operator
  ref: alice
attachments:
  wiki: [onboarding-email-style]
  lessons: [q1-onboarding-postmortem]
governance:
  approval_required: false
  signers: []
deadline: 2026-06-15T17:00:00Z
priority: high
labels: [marketing, copywriting]
---

# Draft Q2 onboarding email sequence

## Description

<what this is>

## Acceptance criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Scratchpad

<author / assignee notes during work>
```

If you author entry-style code instead of YAML by hand, the canonical TS shape
is:

```ts
import { defineTask } from "<host-runtime>"

export default defineTask({
  slug: "draft-q2-onboarding-emails",
  title: "Draft Q2 onboarding email sequence",
  status: "claimed",
  parent: { kind: "initiative", ref: "q2-onboarding-revamp" },
  scope: { company: "acme", role: "marketing" },
  assignee: { kind: "operator", ref: "alice" },
  attachments: {
    wiki: ["onboarding-email-style"],
    lessons: ["q1-onboarding-postmortem"],
  },
  deadline: "2026-06-15T17:00:00Z",
  priority: "high",
  labels: ["marketing", "copywriting"],
  body: "# Draft Q2 onboarding email sequence\n…",
})
```

Mirrors are `defineProject`, `defineInitiative`. Each accepts the fields that
doctype's per-kind constraints permit. Drift between the manifest YAML and the
entry call is a spec bug.

### 8. Validate

Validate against [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json):

```bash
npx ajv validate -s ./WORK_ITEM.schema.json -d ./TASK.md
```

Fix every error before declaring success. Specifically check:

- The doctype's `kind` matches the file name (`PROJECT.md` → `kind: project`,
  etc.).
- Tasks have `assignee` (not `lead`); projects/initiatives have `lead` (not
  `assignee`).
- `scope.company` is set on the root of the parent chain.
- Cross-AIP refs (`assignee.kind: operator`, `attachments.wiki[]`, …) resolve to
  existing slugs in their respective doctype trees.
- Status is one of the six valid values.

## Output

Produce one file in the chosen folder:

```
<company-root>/
  <kind-plural>/
    <slug>/
      <KIND>.md     # the doctype
```

Reply to the user with:

1. The path you wrote to.
2. **The three axes** at a glance: containment (`parent`), applicability
   (`scope`), ownership (`assignee` / `lead`) — so the user can verify each is
   set deliberately.
3. **Open assumptions**: defaults you guessed (status, priority, scope
   narrowing) the user might want to override.

Do NOT regenerate `_index/work.json` yourself — the host's adapter handles that
on write. Authoring ends with the doctype file.

## See also

- [AIP-13 — agentwork/v1 spec](/docs/aip-13)
- [AIP-6 — agentcompanies/v1: COMPANY.md, ROLE.md, OBJECTIVE.md](/docs/aip-6)
- [AIP-9 — OPERATOR.md](/docs/aip-9) — assignee/lead refs
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference doctypes for common patterns
  (minimal task, nested initiative, cross-product applicability,
  objective-linked task, dependency chain)
