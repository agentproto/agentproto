# EXAMPLES.md — company/v1 reference workspaces

Reference workspaces exemplifying common shapes. Each example shows the relevant
files of a company package: `COMPANY.md` and `OBJECTIVE.md` (the doctypes AIP-6
owns), the `ROLE.md` files ([AIP-47](/docs/aip-47) `role/v1` documents, not
company/v1), and, where the org chart matters, the [AIP-22](/docs/aip-22) office
that holds the positions and seats. Authors should copy the closest pattern and
edit fields rather than draft from scratch.

Only blocks that declare `schema: company/v1` are validated by
[`./COMPANY.schema.json`](./COMPANY.schema.json). A role block declares
`schema: role/v1` and is validated by AIP-47's `ROLE.schema.json`; a seat block
is an AIP-22 collection item.

## Patterns covered

1. [Solo founder company](#1-solo-founder-company)
2. [Two-role company — founder + ops](#2-two-role-company--founder--ops)
3. [Full org tree](#3-full-org-tree)
4. [Objective decomposition](#4-objective-decomposition)
5. [Role with a narrow, declared intent](#5-role-with-a-narrow-declared-intent)
6. [Importing roles from a registry](#6-importing-roles-from-a-registry)
7. [Branching / forking a company](#7-branching--forking-a-company)
8. [Legacy spellings: `kind`, `slug` and the agent slot](#8-legacy-spellings-kind-slug-and-the-agent-slot)

---

## 1. Solo founder company

The minimum viable workspace. One role wears every hat, one objective drives the
quarter. A package this small can omit the office.

```
pricewatch/
  COMPANY.md
  roles/founder/ROLE.md
  objectives/q3-pipeline/OBJECTIVE.md
```

**`pricewatch/COMPANY.md`:**

```md
---
schema: company/v1
doctype: company
id: pricewatch
name: Pricewatch
version: 1.0.0
description: Track public SaaS pricing for our customers.
mission: >
  Help indie SaaS buyers compare pricing across vendors before they commit to a
  contract.
values:
  - "Public data, public tools."
  - "Show our work."
  - "No vendor lock-in."
structure:
  objectives: [q3-pipeline]
tags: [solo, pricing, saas]
---
```

**`roles/founder/ROLE.md`** (an AIP-47 document):

```yaml
---
schema: role/v1
name: founder
title: Founder
description: Sets product direction and owns customer relationships.
version: 1.0.0
seniority: executive
mission: >
  Set product direction, own customer relationships, run support, manage the AI
  operator that handles routine work.
responsibilities:
  - Decide what the product does next
  - Answer customers
capabilities:
  - product direction
  - customer support
tools:
  - ws://tools/pricing-snapshot
  - ws://tools/send-email-brevo
---
```

**`objectives/q3-pipeline/OBJECTIVE.md`:**

```yaml
---
schema: company/v1
doctype: objective
id: q3-pipeline
name: Q3 Pipeline
statement: >
  Reach 50 paying customers by end of Q3 with monthly churn under 4%.
owner: founder
horizon: quarter
status: active
key_results:
  - id: kr-paid
    statement: Paying customers
    target: "50"
  - id: kr-churn
    statement: Monthly churn
    target: "<4%"
---
```

---

## 2. Two-role company — founder + ops

The most common early-stage shape. Founder sets direction; ops handles process.
The reporting edge is a seat property in the office, not a COMPANY.md field.

```
acme-agency/
  COMPANY.md
  OFFICE.md
  items/role/{founder,ops}.md       # the seats (AIP-22 items)
  roles/{founder,ops}/ROLE.md       # the roles they follow (AIP-47)
  objectives/{q3-pipeline,retention-90}/OBJECTIVE.md
```

**`COMPANY.md` (excerpt):**

```yaml
---
schema: company/v1
doctype: company
id: acme-agency
name: Acme Agency
mission: >
  Run a 2-person AI agency that ships custom GTM motions for early-stage SaaS
  founders.
structure:
  objectives: [q3-pipeline, retention-90]
---
```

**`items/role/ops.md`** (an AIP-22 seat; `reportsTo` is the reporting line):

```yaml
---
schema: collection.item/v1
collection: role
id: ROLE-ops
title: Operations Lead
reportsTo: ROLE-founder
holder: operator:ops
---
```

**`roles/ops/ROLE.md`:**

```yaml
---
schema: role/v1
name: ops
title: Operations Lead
description: Runs delivery, support and monthly reviews.
version: 1.0.0
seniority: senior
reports_to: ws://roles/founder
mission: >
  Run delivery: onboarding, support, monthly reviews. Escalate any request that
  affects pricing, scope, or contract terms.
responsibilities:
  - Onboard new customers after payment
  - Run the monthly review
antiPatterns:
  - Changing pricing, scope or contract terms without the founder
tools:
  - ws://tools/append-to-notes
  - ws://tools/send-email-brevo
---
```

**`objectives/retention-90/OBJECTIVE.md`:**

```yaml
---
schema: company/v1
doctype: objective
id: retention-90
name: Retention 90
statement: >
  Hold 90% logo retention quarter-over-quarter for the next 3 quarters.
owner: ops
horizon: ongoing
key_results:
  - id: kr-retention
    statement: Logo retention
    target: ">=90%"
---
```

`founder` mirrors the solo founder example with
`responsibilities` about new business and strategy.

---

## 3. Full org tree

A four-seat tree with explicit reporting edges. The office is the authority on
hierarchy: a seat's `reportsTo` MUST resolve to a seat of the same office, and
the role's own `reports_to` links roles, not seats.

```
fieldworks/
  COMPANY.md
  OFFICE.md
  items/role/{founder,head-of-product,head-of-gtm,sdr}.md
  roles/{founder,head-of-product,head-of-gtm,sdr}/ROLE.md
  objectives/annual-revenue/OBJECTIVE.md
```

**`items/role/sdr.md`:**

```yaml
---
schema: collection.item/v1
collection: role
id: ROLE-sdr
title: SDR
reportsTo: ROLE-head-of-gtm
holder: operator:sdr
---
```

The other seats set `reportsTo` the same way: `ROLE-head-of-product` and
`ROLE-head-of-gtm` report to `ROLE-founder`; `ROLE-founder` omits it (top-level).

The org tree this expresses:

```
founder
├── head-of-product
└── head-of-gtm
    └── sdr
```

**`roles/sdr/ROLE.md`:**

```yaml
---
schema: role/v1
name: sdr
title: SDR
description: Sources and qualifies outbound leads.
version: 1.0.0
seniority: junior
mission: >
  Source and qualify outbound leads. Hand off SQLs to head-of-gtm; never close a
  deal.
responsibilities:
  - Source outbound leads
  - Qualify leads against the ideal customer profile
antiPatterns:
  - Closing a deal
tools:
  - ws://tools/clearbit-enrich
  - ws://tools/send-email-brevo
---
```

A package that has no office yet MAY still carry the older
`structure.reports_to` map in `COMPANY.md`. It is deprecated, read as a seed, and
the office wins as soon as one exists (see AIP-6 "Where the company's
organization lives").

---

## 4. Objective decomposition

Top-level objective decomposes into child objectives. Both edges — `parent` and
`children` — must agree.

**`objectives/annual-revenue/OBJECTIVE.md`:**

```yaml
---
schema: company/v1
doctype: objective
id: annual-revenue
name: Annual Revenue
statement: Hit $4M ARR by end of fiscal year, balanced quarter-over-quarter.
owner: founder
horizon: year
status: active
children: [q1-pipeline, q2-pipeline, q3-pipeline, q4-pipeline]
key_results:
  - id: kr-arr
    statement: ARR
    target: "$4M"
---
```

**`objectives/q3-pipeline/OBJECTIVE.md`:**

```yaml
---
schema: company/v1
doctype: objective
id: q3-pipeline
name: Q3 Pipeline
statement: Close $1M of new ARR in Q3 with at least 5 enterprise logos.
owner: head-of-gtm
parent: annual-revenue
horizon: quarter
depends_on: [q2-pipeline]
key_results:
  - id: kr-arr-q3
    statement: ARR closed in Q3
    target: "$1M"
  - id: kr-logos
    statement: Enterprise logos closed
    target: "5"
---
```

The adapter validates: `annual-revenue.children` lists `q3-pipeline`, AND
`q3-pipeline.parent == annual-revenue`. Same for the other quarters.
`depends_on` builds a DAG — `q3` waits on `q2`'s pipeline to land before its
starting baseline is meaningful.

The work that serves an objective is not described here. A project that pursues
`q3-pipeline` is an AIP-34 node whose `work:` field points at an AIP-20
`WORK.md`; its items link back to the objective by slug.

---

## 5. Role with a narrow, declared intent

A role intentionally restricted to a narrow domain. The mission and the
`antiPatterns` state the intent; a role is intent, never permission. What the
holder may actually do is decided by an AIP-38 policy bound to the operator or
to the node it works in, not by the role file.

**`roles/billing-bot/ROLE.md`:**

```yaml
---
schema: role/v1
name: billing-bot
title: Billing Bot
description: Produces monthly invoice drafts for founder approval.
version: 1.0.0
seniority: junior
reports_to: ws://roles/ops
mission: >
  Read-only role that produces monthly invoice drafts and posts them to the
  founder for approval. Never charges a card; never modifies subscription
  state. Escalates any anomaly above $5K to the founder.
responsibilities:
  - Draft the monthly invoices
  - Post the drafts to the founder for approval
antiPatterns:
  - Charging a card
  - Modifying subscription state
tools:
  - ws://tools/stripe-customer-lookup
  - ws://tools/append-to-notes
metadata:
  acme:
    escalation_threshold_usd: 5000
    review_cadence: "monthly"
---
```

Rationale:

- `mission` and `antiPatterns` read like a contract. The role's `defaultPolicy`
  MAY point at a recommended policy, advisory only.
- `tools` includes only the lookups needed; `stripe-charge` is conspicuously
  absent. Declaring a tool is intent: the policy decides the effect.
- `metadata.acme.*` carries vendor extensions without polluting the canonical
  fields.

---

## 6. Importing roles from a registry

Pull a stock role from an external registry and bind it locally. The adapter
materialises the file during workspace registration (a role as an AIP-47
`role/v1` document, an objective as a company/v1 objective); once materialised,
it's identical to a hand-authored file.

**`COMPANY.md`:**

```yaml
---
schema: company/v1
doctype: company
id: helio
name: Helio
mission: >
  Sell solar consultations to homeowners with AI-driven lead qualification.
structure:
  objectives: [annual-revenue]
imports:
  - from: "open-companies/marketing@^1.0.0"
    as: role
    id: marketer
  - from: "open-companies/sdr-vertical-services@^2.1.0"
    as: role
    id: sdr
  - from: "open-companies/standard-okrs@^1.0.0"
    as: objective
    id: annual-revenue
tags: [solar, gtm, imports]
---
```

After resolution:

```
helio/
  COMPANY.md
  roles/
    founder/ROLE.md
    marketer/ROLE.md          # materialised from registry
    sdr/ROLE.md               # materialised from registry
  objectives/
    annual-revenue/OBJECTIVE.md   # materialised from registry
```

Each materialised file carries provenance:

```yaml
metadata:
  import:
    from: "open-companies/marketing@^1.0.0"
    version: "1.4.2"
    resolved_at: "2026-04-28T09:14:00Z"
```

The author MAY edit a materialised file after resolution — that turns it into a
local fork; subsequent registry updates surface as diffs the author chooses to
merge or skip.

---

## 7. Branching / forking a company

Forking is a filesystem operation, not a spec construct: a fork is **any git
clone** of the workspace. Two patterns are common.

### 7a. Light fork — adjust mission, keep structure

A subsidiary or campaign-specific variant. Copy the workspace, edit `COMPANY.md`
mission and objectives, leave roles and the office untouched.

```
helio-commercial/                   # forked from helio/
  COMPANY.md                        # mission + objectives edited
  roles/{founder,marketer,sdr}/ROLE.md   # unchanged
  objectives/commercial-revenue/OBJECTIVE.md   # new — replaces annual-revenue
```

`COMPANY.md` for the fork:

```yaml
---
schema: company/v1
doctype: company
id: helio-commercial
name: Helio Commercial
mission: Sell solar to commercial property owners and asset managers.
structure:
  objectives: [commercial-revenue]
metadata:
  fork:
    from: "helio@1.4.0"
    rationale: "Commercial vertical separation."
---
```

The adapter's `diff(helio, helio-commercial)` surfaces:

- `doctype-modified`: `COMPANY.md` mission, structure.objectives.
- `doctype-added`: `objectives/commercial-revenue`.
- `doctype-removed`: `objectives/annual-revenue`.
- All `ROLE.md` files: unchanged.

### 7b. Branch — diverge then merge back

Two contributors author parallel branches in git, each edits roles or
objectives, the merge resolves slug-level conflicts. Because references are
slugs (not opaque IDs), a three-way merge in git behaves predictably: text
conflicts surface in the offending markdown file; the adapter re-validates after
merge.

```bash
git checkout -b add-customer-success
# … author roles/customer-success/ROLE.md and add its seat to the office …
git commit -am "Add customer-success role"
agentcompanies validate .

git checkout main
git merge add-customer-success
agentcompanies validate .   # post-merge cross-reference check
```

The post-merge `validate` catches:

- Slug collisions (two branches added a role with the same id).
- Asymmetric `parent`/`children` edges across branches.
- Dangling references (one branch removed an objective the other branch's role
  still listed).

---

## 8. Legacy spellings: `kind`, `slug` and the agent slot

Files written before `doctype`/`id` were canonical, and files from the AIP-6
agent slot, stay valid. AIP-6 sets no removal date for these spellings.

**`objectives/q3-pipeline/OBJECTIVE.md`**, with the aliases:

```yaml
---
schema: company/v1
kind: objective
slug: q3-pipeline
name: Q3 Pipeline
statement: Reach 50 paying customers by end of Q3.
owner: founder
---
```

**`agents/researcher/AGENT.md`**, the legacy agent slot ([AIP-42](/docs/aip-42)
reads it as an agent, `slug` is its `id`):

```yaml
---
schema: company/v1
kind: agent
slug: researcher
name: Researcher
description: Looks things up for the founder.
---
```

A file that carries an alias next to its canonical field with a different value
(`doctype: company` with `kind: objective`) is refused with `alias_conflict`.
New agents use `schema: agent/v1`.

---

## Anti-patterns to avoid

- **Folder name ≠ `id`**: `objectives/Q3Pipeline/OBJECTIVE.md` with
  `id: q3-pipeline`. Adapter rejects with `folder_id_mismatch`.
- **Database IDs in references** — slugs only. UUIDs in `reports_to` or `owner`
  defeat git-native portability.
- **Vendor names in mission** — bakes the package to one runtime. Use
  `metadata.<vendor>.*` for vendor-specific hints.
- **Asymmetric `parent` / `children`** — set both edges or neither.
- **`reports_to` cycles** — A reports to B reports to A. Always a spec bug.
- **A role that carries permissions**: a role is intent. Put the grant in an
  AIP-38 policy, never in `ROLE.md`.
- **Seats and reporting in `COMPANY.md` once an office exists**: the office is
  authoritative; keep the org chart in one place.
- **A project described in `COMPANY.md`**: a project is an AIP-34 node with an
  AIP-20 `WORK.md`, not a company/v1 field.
- **Free-form fields at the top level** — keep top-level fields to those the
  schema knows; namespace everything else under `metadata.<vendor>.*`.

## See also

- [AIP-6 — company/v1 spec](/docs/aip-6)
- [AIP-7 — governance, capabilities, approval](/docs/aip-7)
- [AIP-8 — agencies engine, operators](/docs/aip-8)
- [AIP-20: WORK.md spec](/docs/aip-20): projects and work
- [AIP-22: OFFICE.md spec](/docs/aip-22): positions, seats, reporting
- [AIP-42: AGENT.md spec](/docs/aip-42): the agent slot
- [AIP-47: ROLE.md spec](/docs/aip-47): roles
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
