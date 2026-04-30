# EXAMPLES.md — agentoffice/v1 reference patterns

Reference manifests exemplifying common authoring patterns for
[AIP-22](/docs/aip-22). Each example is a self-contained `OFFICE.md` a host
could load as-is. Manifest authors should copy the closest pattern and edit
fields rather than draft from scratch.

## Patterns covered

1. [Solo founder company — minimal manifest](#example-1--solo-founder-company)
2. [Per-operator view — eng-lead lens](#example-2--per-operator-view)
3. [Multi-collection org — full department / team / role tree](#example-3--multi-collection-org)
4. [Multi-jurisdiction view — German subsidiary](#example-4--multi-jurisdiction-view)
5. [Three-level chain — group → company → division (one-way switches)](#example-5--three-level-chain-with-one-way-switches)

---

## Example 1 — Solo founder company

The smallest legal `OFFICE.md`: required frontmatter, one inline `role`
collection, no org tree (a solo founder has no hierarchy yet). Useful for a
one-person company that lives next to the code, with no governance, no reporting
graph, no playbook.

````yaml
---
schema: office.workspace/v1
name: solo-founder
title: Solo founder company
description: |
  One-person company shell. One inline 'role' collection (the
  founder), no org tree, no reporting graph. Lives at the repo
  root next to the operator manifests.
version: 1.0.0

identity:
  legalName: Solo Inc.
  jurisdiction: US
  foundedAt: 2026-01-15
  mission: |
    Build the most useful AI products on the planet, one founder-led
    iteration at a time.
  defaultCurrency: USD

collections:
  - inline:
      schema: collection.schema/v1
      name: role
      title: Role
      description: A role within the company.
      version: 1.0.0
      fields:
        - name: holder
          type: ref
          refKind: operator
          description: Operator currently holding this role.
        - name: appointedAt
          type: date
      statuses:
        - { id: proposed, label: Proposed, transitionsTo: [active] }
        - { id: active, label: Active, transitionsTo: [archived] }
        - { id: archived, label: Archived, terminal: true }
      initialStatus: active
      ownership:
        cardinality: single
        role: holder
        required: false

orgTree:
  containment:
    enabled: false
  reporting:
    enabled: false

display:
  defaultGrouping: kind
  defaultView: list
---

# Solo founder company

## Purpose

One-person company shell. The founder fills the only role; there
is no hierarchy yet, no reporting graph, no policies. As the
company grows, the manifest will gain `department` and `team`
collections, enable `orgTree.containment`, and bind a governance
policy.

## What this workspace does NOT model

- Multi-person hierarchies — there is only one role today.
- Reporting graph — irrelevant for a single role.
- Policies — informal until the company hires.

## Examples

A typical role item:

```yaml
---
schema: collection.item/v1
collection: role
id: ROLE-founder
title: Founder
status: active
holder: ws://operators/jeremy
appointedAt: 2026-01-15
---
````

````

**When to use.** Solo founder companies, scratch organisations,
prototype companies. The manifest deliberately skips org-tree
containment; nothing to nest.

---

## Example 2 — Per-operator view

A view that extends a shared org workspace, narrows the visible
collections to `role` and `objective` (hides `department`, `team`,
`policy`), adds an orphan-role lint, and rebinds the executor.

```yaml
---
schema: office.workspace/v1
name: eng-lead-view
title: Engineering lead view
description: |
  Engineering lead's lens on the shared organisation. Surfaces
  roles and objectives only; departments and teams are visible
  through the parent containment view but not first-class in this
  lens. Stricter orphan-role lint to catch stale role records.
version: 1.0.0

extends: ../../OFFICE.md
appliesTo:
  - ws://operators/eng-lead

executor: ws://operators/eng-lead

# Inherit collections from parent, but the view re-declares only
# the two collections relevant to the eng-lead's daily lens. The
# parent's department / team / policy collections are still loaded
# via the merge — the view's collections list MAY be a SUBSET as
# the host merges by effective name (entries here override; ones
# not listed remain).
collections:
  - ref: ./collections/role/COLLECTION.md
  - ref: ./collections/objective/COLLECTION.md

lints:
  - id: orphan-role-warn
    kind: orphan-role
    severity: warn
    params:
      collections: [role]

display:
  defaultGrouping: department
  defaultView: tree
---

# Engineering lead view

## Purpose

The eng lead's daily landing on the org. Role-and-objective tree,
with an orphan-role lint catching role records whose
holders are no longer active.

## When to extend vs replace

Sub-team leads extending this view should narrow `display.homePage`
to their division root, not redeclare the lints.
````

**When to use.** Whenever an operator (AIP-9) needs a lens on a shared
organisation. The view inherits the company's identity, org tree rules,
reporting rules, and one-way switches; it adds only what's specific to the
lead's role.

---

## Example 3 — Multi-collection org

The full organisation: five collections (`role`, `objective`, `department`,
`team`, `policy`) — three via file ref, one inline, one registry import;
org-tree containment ON; reporting graph ON; cross-AIP `governance`,
`knowledge`, `work` bindings. This is the kind of organisation Example 2's view
extends.

```yaml
---
schema: office.workspace/v1
name: acme-corp
title: Acme Corporation
description: |
  Acme Corp's organisational manifest. Tracks roles, objectives,
  departments, teams, and internal policies; bound to the engineering
  work tracker, the company handbook wiki, the company values
  playbook, and the org-default governance policy.
version: 2.1.0

identity:
  legalName: Acme Corporation
  legalEntity: ws://companies/acme-corp
  jurisdiction: US
  foundedAt: 2024-03-01
  mission: |
    Build the most useful AI products on the planet by giving
    builders the highest leverage on every task.
  defaultCurrency: USD
  taxId: 99-9999999

executor: ws://operators/founder
governance: ../policies/org-default.yaml
work: ws://workspaces/main-tracker
knowledge: ws://wikis/handbook/KNOWLEDGE.md
playbook: ws://playbooks/values

collections:
  # Three starter collections from the office-starters library:
  - ref: ./collections/role/COLLECTION.md
  - ref: ./collections/objective/COLLECTION.md
  - ref: ./collections/department/COLLECTION.md
  # One inline collection extending the starter team with an
  # acme-specific 'function' field:
  - inline:
      schema: collection.schema/v1
      name: team
      title: Acme team
      description: |
        Smaller groups within departments. Adds 'function' on top of
        the starter team collection so HR can group teams by
        engineering function.
      version: 1.0.0
      extends: ../../starters/office-starters/team/COLLECTION.md
      fields:
        - name: function
          type: enum
          enum: [eng, design, ops, growth, finance, people]
          required: true
      ownership:
        cardinality: single
        role: lead
        required: true
  # A registry import for cross-org policy reuse:
  - ref: ws://collections/policy
    alias: policy
    version: "1.x"

orgTree:
  containment:
    enabled: true                          # ONE-WAY SWITCH
    field: parent
    rules:
      allowedKinds: [department, team, role]
      allowedParentKinds:
        team: [department]
        role: [team, department]
        department: [department]
      maxDepth: 6                          # ONE-WAY SWITCH on widening
  reporting:
    enabled: true
    field: reportsTo
    cardinality: single
    rules:
      mustResolveTo: role
      circularBan: true

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

defaults:
  workflow: ./workflows/monthly-report-graph-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true                     # ONE-WAY SWITCH

display:
  homePage: DEPT-engineering
  defaultGrouping: department
  defaultView: tree
---

# Acme Corporation

## Purpose

Organisation manifest for Acme Corp. Tracks the full org
structure (departments → teams → roles), quarterly objectives,
internal policies. Bound to the work tracker for execution, the
wiki for institutional context, and the values playbook for
operating norms.

## Org structure

Acme is organised as: departments contain teams, teams contain
roles. The reporting graph is single-line (every role reports to
exactly one other role); cycles are banned.

## Conventions

- A `department` is a top-level org sub-unit (Engineering, Design,
  Ops, Growth, Finance, People).
- A `team` is a smaller group within a department (frontend team,
  growth team, talent team).
- A `role` is a position held by an operator (or human). Roles
  parent under teams or directly under departments (for senior
  roles).
- Every role has at most ONE manager (`reportsTo`); matrixed
  reporting requires switching `cardinality` to `multiple`.

## What this workspace does NOT model

- Customer relationships — that lives in the agency workspace
  (AIP-21).
- Per-customer engagements — also agency.
- HR / payroll specifics — runtime concerns outside the spec.

## When to extend vs replace

Divisional, jurisdictional, and per-operator views SHOULD extend
this workspace and narrow visibility via `appliesTo`. Forking is
rarely the right move; the registry-of-views pattern keeps everyone
on one tree.
```

**When to use.** A multi-team organisation with explicit hierarchy. Mixes ref
forms (file + registry + inline-extends-starter), declares the full containment
matrix, enables reporting with cycle-ban, binds governance + work + knowledge +
playbook. The canonical organisation manifest — every divisional or operator
view extends from here.

---

## Example 4 — Multi-jurisdiction view

A view that extends the parent org for a German subsidiary: narrows
`identity.jurisdiction`, narrows `defaultCurrency`, rebinds `governance` to a
Germany-specific data-protection policy, narrows the visible collections.

```yaml
---
schema: office.workspace/v1
name: acme-de
title: Acme Deutschland GmbH
description: |
  Acme's German subsidiary. Inherits the parent's mission, role
  schemas, and org-tree rules; narrows jurisdiction, currency, and
  governance for German data-protection compliance.
version: 1.0.0

extends: ../../OFFICE.md
appliesTo:
  - ws://operators/de-country-lead

# Identity: narrow the jurisdiction-specific fields. Mission inherits
# from the parent; legalName and taxId are German-specific.
identity:
  legalName: Acme Deutschland GmbH
  legalEntity: ws://companies/acme-de
  jurisdiction: DE
  defaultCurrency: EUR
  taxId: DE999999999

# Governance rebound for the subsidiary. Parent's governance is
# the org-default; this view binds the German DPA-aligned policy.
governance: ../policies/de-data-protection.yaml

# The view inherits all collections from the parent (role,
# objective, department, team, policy). No local collections
# overrides — this view does not need a different role schema.
# The merge keeps the parent's collections list intact.

# Inherit org-tree rules from the parent. Containment + reporting
# both enabled; one-way switches honoured.

display:
  homePage: DEPT-de-engineering
  defaultGrouping: department
  defaultView: tree
---

# Acme Deutschland GmbH

## Purpose

Acme's German subsidiary. Operates under EU jurisdiction with a
narrower governance policy reflecting GDPR / DPA constraints. All
organisational structure inherits from the parent — only identity
and governance are localised.

## Conventions

- Items filed under this view carry German-specific applicability
  via the work tracker; the company manifest itself does not need
  per-item applicability since org-tree containment is the central
  axis.
- Personnel data flows through the bound DPA-aligned governance
  policy; mutations to role records are audit-logged
  (inherited `auditMutations: true` from parent).

## What this workspace does NOT model

- Tax-residency-specific role variants — handled at the work-tracker
  level.
- Cross-border reporting lines — modelled at the parent's reporting
  graph; this view is a lens, not a structural override.

## When to extend vs replace

Per-team-DE views may extend this view and narrow further (e.g.
`display.homePage` to a specific German department). The parent
chain is `acme-corp → acme-de → ...`; descendants honour the
one-way switches set anywhere in the chain.
```

**When to use.** Multi-jurisdiction organisations. Each subsidiary gets its own
view; the manifest tree groups subsidiaries under a parent legal entity. The
view inherits the org-wide collection schemas and tree rules; it only narrows
what's jurisdiction-specific (`identity.*`, `governance`).

---

## Example 5 — Three-level chain with one-way switches

A three-level composition demonstrating the one-way switches on
`defaults.auditMutations`, `orgTree.containment.enabled`, and
`orgTree.containment.rules.maxDepth`. The group sets the switches; the company
passes them through unchanged; the division CANNOT relax them. We include
counter-examples showing the HARD refusals.

### Level 1 — Group workspace

`group/OFFICE.md`:

```yaml
---
schema: office.workspace/v1
name: acme-group
title: Acme Group
description: |
  Acme Group's holding-level manifest. Sets the audit, containment,
  and depth one-way switches — descendants cannot relax them.
  Concrete collections are added by sub-company views.
version: 1.0.0

identity:
  legalName: Acme Holdings PLC
  jurisdiction: GB
  foundedAt: 2020-01-01
  defaultCurrency: GBP

governance: ../policies/group-default.yaml

collections:
  - ref: ./collections/role/COLLECTION.md
  - ref: ./collections/objective/COLLECTION.md
  - ref: ./collections/department/COLLECTION.md

orgTree:
  containment:
    enabled: true                          # ONE-WAY: descendants cannot disable
    field: parent
    rules:
      allowedKinds: [department, role]
      allowedParentKinds:
        role: [department]
        department: [department]
      maxDepth: 4                          # ONE-WAY on widening
  reporting:
    enabled: true
    field: reportsTo
    cardinality: single
    rules:
      mustResolveTo: role
      circularBan: true

defaults:
  approvalClass: on-mutate
  auditMutations: true                     # ONE-WAY: descendants cannot disable
---

# Acme Group

## Purpose

The group's holding-level manifest. Every subsidiary and
operator extends this workspace; the audit + containment + depth
switches are set here so no descendant can relax them.

## When to extend vs replace

Always extend. Forking the group root would lose the audit and
depth invariants that compliance tooling relies on.
```

### Level 2 — Subsidiary workspace

`companies/acme-uk/OFFICE.md`:

```yaml
---
schema: office.workspace/v1
name: acme-uk
title: Acme UK
description: |
  Acme's UK subsidiary. Inherits the group's audit, containment,
  and depth switches unchanged; adds a 'team' collection and the
  UK engineering wiki binding.
version: 1.2.0
extends: ../../group/OFFICE.md

identity:
  legalName: Acme UK Limited
  legalEntity: ws://companies/acme-uk
  jurisdiction: GB
  defaultCurrency: GBP
  taxId: GB999999999

knowledge: ws://wikis/handbook-uk/KNOWLEDGE.md

collections:
  - ref: ws://collections/team
    alias: team


# Containment + audit + depth inherited unchanged.
# orgTree.containment.enabled remains true (one-way).
# orgTree.containment.rules.maxDepth remains 4 (one-way on widen).
# defaults.auditMutations remains true (one-way).
---
# Acme UK

## Purpose

Acme's UK subsidiary. Adds a 'team' collection so the UK org can model teams
within departments; everything else inherits from the group.
```

### Level 3 — Division view (CORRECT)

`divisions/uk-research/OFFICE.md`:

```yaml
---
schema: office.workspace/v1
name: uk-research
title: Acme UK Research division
description: |
  Research division within Acme UK. Narrows the home page and adds
  a research-specific stale-objective lint. Does NOT touch the
  audit, containment, or depth one-way switches.
version: 1.0.0
extends: ../../companies/acme-uk/OFFICE.md
appliesTo:
  - ws://operators/research-lead

orgTree:
  containment:
    rules:
      maxDepth: 3 # NARROWING — allowed (3 < 4)

lints:
  - id: research-stale-objective
    kind: stale-objective
    severity: warn
    params:
      collections: [objective]
      days: 60

display:
  homePage: DEPT-research
  defaultView: tree
---
# UK Research division

## Purpose

Research division's lens on the UK subsidiary. Narrower depth cap (3 levels —
research has shallower hierarchy than ops); stricter stale-objective lint.
```

The chain validates cleanly. The host computes the merged effective config,
exposes the resolution chain
(`group/OFFICE.md → companies/acme-uk/OFFICE.md → divisions/uk-research/OFFICE.md`),
and registers all four collections (`role`, `objective`, `department`, `team`)
under their effective names. The division's `maxDepth: 3` is honoured (narrower
than the group's `4`).

### Level 3 — Division view (COUNTER-EXAMPLE 1: depth widening HARD refusal)

A view that tries to widen the depth:

```yaml
---
schema: office.workspace/v1
name: uk-research-broken-depth
title: UK Research (broken — widens depth)
description: Tries to widen the org-tree depth past the group's cap.
version: 1.0.0

extends: ../../companies/acme-uk/OFFICE.md
appliesTo:
  - ws://operators/research-lead

orgTree:
  containment:
    rules:
      maxDepth: 8 # ATTEMPTS TO WIDEN past 4
---
```

**Result.** The host walks the resolution chain:

1. `group/OFFICE.md` sets `orgTree.containment.rules.maxDepth: 4`.
2. `companies/acme-uk/OFFICE.md` inherits it (no override).
3. `divisions/uk-research-broken-depth/OFFICE.md` (this view) tries `8`.

The host MUST refuse the view with `office_orgtree_depth_widen` (HARD). The view
does NOT degrade to local-only; it fails to load entirely. The author MUST
either narrow (e.g. `maxDepth: 3`) or omit the override.

### Level 3 — Division view (COUNTER-EXAMPLE 2: org-tree disable HARD refusal)

A view that tries to disable containment:

```yaml
---
schema: office.workspace/v1
name: uk-research-broken-disable
title: UK Research (broken — disables containment)
description: Tries to turn off org-tree containment for this lens.
version: 1.0.0

extends: ../../companies/acme-uk/OFFICE.md
appliesTo:
  - ws://operators/research-lead

orgTree:
  containment:
    enabled: false # ATTEMPTS TO DISABLE
---
```

**Result.** The host refuses the view with `office_orgtree_disable` (HARD).
Existing items in `department`, `team`, and `role` were filed under the group's
containment rules; disabling would orphan them. The author MUST drop the
`enabled: false` override.

The same posture applies if the view tries `defaults.auditMutations: false`
(refused with `office_audit_downgrade`) or `governance.signing.required: false`
when the bound governance policy declares `signing.required: true` (refused with
`office_signing_downgrade`).

**When to use.** Three-level (or deeper) compositions where compliance, audit,
or org-structure invariants must hold across every descendant. The one-way
switches make the resolution chain trustworthy without re-validating every leaf.

---

## See also

- [AIP-22 — agentoffice/v1 spec](/docs/aip-22)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-21 — agentagencies/v2](/docs/aip-21) — sibling Workspace AIP
- [`./OFFICE.schema.json`](./OFFICE.schema.json) — frontmatter validator
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./skills/author-office-workspace/SKILL.md`](./skills/author-office-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/office-starters/`](./starters/office-starters) — starter
  collection library
