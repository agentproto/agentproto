# EXAMPLES.md — agentcompanies/v1 reference workspaces

Reference workspaces exemplifying common shapes. Each example shows the relevant
doctypes — `COMPANY.md`, one or more `ROLE.md`, and one or more `OBJECTIVE.md` —
as a self-contained package an AIP-6-conforming adapter could load. Authors
should copy the closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Solo founder company](#1-solo-founder-company)
2. [Two-role company — founder + ops](#2-two-role-company--founder--ops)
3. [Full org tree](#3-full-org-tree)
4. [Objective decomposition](#4-objective-decomposition)
5. [Role with narrow, scoped capabilities](#5-role-with-narrow-scoped-capabilities)
6. [Importing roles from a registry](#6-importing-roles-from-a-registry)
7. [Branching / forking a company](#7-branching--forking-a-company)

---

## 1. Solo founder company

The minimum viable workspace. One role wears every hat, one objective drives the
quarter.

```
pricewatch/
  COMPANY.md
  roles/founder/ROLE.md
  objectives/q3-pipeline/OBJECTIVE.md
```

**`pricewatch/COMPANY.md`:**

```md
---
schema: agentcompanies/v1
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
  roles: [founder]
  objectives: [q3-pipeline]
tags: [solo, pricing, saas]
---
```

**`roles/founder/ROLE.md`:**

```yaml
---
schema: agentcompanies/v1
doctype: role
id: founder
name: Founder
mandate: >
  Set product direction, own customer relationships, run support, manage the AI
  operator that handles routine work.
scope:
  owns: ["product", "customers", "support"]
  capabilities: ["product.write", "customers.write", "support.respond"]
objectives: [q3-pipeline]
tools: [pricing-snapshot, send-email-brevo, append-to-notes]
workflows: [onboarding-after-payment]
---
```

**`objectives/q3-pipeline/OBJECTIVE.md`:**

```yaml
---
schema: agentcompanies/v1
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
`reports_to` records the edge.

```
acme-agency/
  COMPANY.md
  roles/{founder,ops}/ROLE.md
  objectives/{q3-pipeline,retention-90}/OBJECTIVE.md
```

**`COMPANY.md` (excerpt):**

```yaml
---
schema: agentcompanies/v1
doctype: company
id: acme-agency
name: Acme Agency
mission: >
  Run a 2-person AI agency that ships custom GTM motions for early-stage SaaS
  founders.
structure:
  roles: [founder, ops]
  objectives: [q3-pipeline, retention-90]
  reports_to:
    ops: founder
---
```

**`roles/ops/ROLE.md`:**

```yaml
---
schema: agentcompanies/v1
doctype: role
id: ops
name: Operations Lead
mandate: >
  Run delivery: onboarding, support, monthly reviews. Escalate any request that
  affects pricing, scope, or contract terms.
reports_to: founder
scope:
  owns: ["delivery", "support", "monthly-reviews"]
  capabilities: ["delivery.write", "support.respond"]
objectives: [retention-90]
tools: [append-to-notes, send-email-brevo]
workflows: [onboarding-after-payment]
---
```

**`objectives/retention-90/OBJECTIVE.md`:**

```yaml
---
schema: agentcompanies/v1
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

`founder/ROLE.md` mirrors the solo founder example with
`scope.owns: ["new-business", "strategy"]` and `objectives: [q3-pipeline]`.

---

## 3. Full org tree

A four-role tree with explicit reports-to edges. The `structure.reports_to` map
is the authority on hierarchy; per-role `reports_to` MUST agree.

```
fieldworks/
  COMPANY.md
  roles/{founder,head-of-product,head-of-gtm,sdr}/ROLE.md
  objectives/annual-revenue/OBJECTIVE.md
```

**`COMPANY.md` (excerpt):**

```yaml
structure:
  roles: [founder, head-of-product, head-of-gtm, sdr]
  objectives: [annual-revenue]
  reports_to:
    head-of-product: founder
    head-of-gtm: founder
    sdr: head-of-gtm
```

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
schema: agentcompanies/v1
doctype: role
id: sdr
name: SDR
mandate: >
  Source and qualify outbound leads. Hand off SQLs to head-of-gtm; never close a
  deal.
reports_to: head-of-gtm
scope:
  owns: ["outbound-pipeline"]
  capabilities: ["leads.write", "outbound.send"]
objectives: [annual-revenue]
tools: [clearbit-enrich, send-email-brevo]
workflows: [lead-triage]
---
```

`founder` omits `reports_to` (top-level). `head-of-product` and `head-of-gtm`
set `reports_to: founder`.

---

## 4. Objective decomposition

Top-level objective decomposes into child objectives. Both edges — `parent` and
`children` — must agree.

**`objectives/annual-revenue/OBJECTIVE.md`:**

```yaml
---
schema: agentcompanies/v1
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
schema: agentcompanies/v1
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

---

## 5. Role with narrow, scoped capabilities

A role intentionally restricted to a narrow domain. The mandate describes the
bounded autonomy; `scope.capabilities` enforces it through AIP-7 governance.

**`roles/billing-bot/ROLE.md`:**

```yaml
---
schema: agentcompanies/v1
doctype: role
id: billing-bot
name: Billing Bot
mandate: >
  Read-only operator that produces monthly invoice drafts and posts them to the
  founder for approval. NEVER charges a card; NEVER modifies subscription state.
  Escalates any anomaly above $5K to the founder.
reports_to: ops
scope:
  owns: ["invoice-drafts"]
  capabilities:
    - "invoices.read"
    - "invoices.draft"
    - "subscriptions.read"
objectives: [retention-90]
tools:
  - stripe-customer-lookup
  - append-to-notes
workflows: []
metadata:
  acme:
    escalation_threshold_usd: 5000
    review_cadence: "monthly"
---
```

Rationale:

- `mandate` reads like a contract. Anything outside it is a policy violation.
- `scope.capabilities` lists only `*.read` and `invoices.draft`. No write
  capabilities for subscriptions.
- `tools` includes only the lookups needed; `stripe-charge` is conspicuously
  absent.
- `metadata.acme.*` carries vendor extensions without polluting the canonical
  fields.

---

## 6. Importing roles from a registry

Pull a stock role from an external registry and bind it locally. The adapter
materialises the doctype during workspace registration; once materialised, it's
identical to a hand-authored doctype.

**`COMPANY.md`:**

```yaml
---
schema: agentcompanies/v1
doctype: company
id: helio
name: Helio
mission: >
  Sell solar consultations to homeowners with AI-driven lead qualification.
structure:
  roles: [founder, marketer, sdr]
  objectives: [annual-revenue]
  reports_to:
    marketer: founder
    sdr: founder
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
mission and objectives, leave roles untouched.

```
helio-commercial/                   # forked from helio/
  COMPANY.md                        # mission + objectives edited
  roles/{founder,marketer,sdr}/ROLE.md   # unchanged
  objectives/commercial-revenue/OBJECTIVE.md   # new — replaces annual-revenue
```

`COMPANY.md` for the fork:

```yaml
---
schema: agentcompanies/v1
doctype: company
id: helio-commercial
name: Helio Commercial
mission: Sell solar to commercial property owners and asset managers.
structure:
  roles: [founder, marketer, sdr]
  objectives: [commercial-revenue]
  reports_to:
    marketer: founder
    sdr: founder
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
# … author roles/customer-success/ROLE.md and update COMPANY.md.structure …
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

## Anti-patterns to avoid

- **Folder name ≠ `id`** — `roles/CustomerSuccess/ROLE.md` with
  `id: customer-success`. Adapter rejects with `folder_id_mismatch`.
- **Database IDs in references** — slugs only. UUIDs in `reports_to` or `owner`
  defeat git-native portability.
- **Vendor names in mission** — bakes the package to one runtime. Use
  `metadata.<vendor>.*` for vendor-specific hints.
- **Asymmetric `parent` / `children`** — set both edges or neither.
- **`reports_to` cycles** — A reports to B reports to A. Always a spec bug.
- **Empty `mandate`** — the mandate is the role's bounded-autonomy contract; an
  empty one removes the safety substrate AIP-7 builds on.
- **`structure.roles` listing a slug with no `ROLE.md`** — doctype-loader
  catches it but ship-time effort wasted. Always scaffold the file when adding
  to the structure list.
- **Free-form fields at the top level** — keep top-level fields to those the
  schema knows; namespace everything else under `metadata.<vendor>.*`.

## See also

- [AIP-6 — agentcompanies/v1 spec](/docs/aip-6)
- [AIP-7 — governance, capabilities, approval](/docs/aip-7)
- [AIP-8 — agencies engine, operators](/docs/aip-8)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
