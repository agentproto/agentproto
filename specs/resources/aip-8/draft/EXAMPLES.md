# EXAMPLES.md — agentagencies/v1 reference patterns

Reference doctype manifests exemplifying common agency-workspace patterns. Each
example is self-contained — a host could load the files as-is. Authors should
copy the closest pattern and edit fields rather than draft from scratch.

Every example assumes an AIP-6 substrate (a `COMPANY.md` plus the roles each
pattern references). When the example references a [`WORKFLOW.md`](/docs/aip-15)
or [`TOOL.md`](/docs/aip-14) by slug, those files are presumed to already be
registered in the host's catalog — agency authoring is layered on top of those
primitives.

## Patterns covered

1. [Simple service catalog](#1-simple-service-catalog)
2. [Engagement with one procedure](#2-engagement-with-one-procedure)
3. [Multi-step engagement with deliverables](#3-multi-step-engagement-with-deliverables)
4. [Fixed-price vs hourly invoice](#4-fixed-price-vs-hourly-invoice)
5. [Procedure with checkpoints](#5-procedure-with-checkpoints)
6. [Agency forked from another](#6-agency-forked-from-another)
7. [Audit-traceable engagement (composes with AIP-7)](#7-audit-traceable-engagement-composes-with-aip-7)

---

## 1. Simple service catalog

The smallest useful agency: an `AGENCY.md`, two services, one pricing model
each, one procedure per service. No engagements yet — just a publishable
catalog.

`AGENCY.md`:

```md
---
schema: agentagencies/v1
kind: agency
id: brandshop
version: 1.0.0
name: Brandshop
description: Naming and identity sprints for early-stage SaaS companies.
company: brandshop-co
billing_currency: USD
working_hours: Mon-Fri 09:00-18:00 Europe/Paris
default_policy: autonomous-up-to-2k
tags: [branding, fixed-price]
---

## Mission

Two-week sprints. No retainers, no surprises.
```

`services/brand-naming-sprint/SERVICE.md`:

```md
---
schema: agentagencies/v1
kind: service
id: brand-naming-sprint
version: 1.0.0
name: Brand Naming Sprint
description:
  Two-week sprint that delivers a shortlist of trademark-cleared names plus a
  final recommended pick.
pricing_model: naming-sprint-fixed
procedures: [run-naming-sprint]
default_role: brand-strategist
inclusions:
  - Discovery workshop (90 min)
  - Shortlist of 10 candidates
  - Trademark pre-screening on top 3
  - Final naming brief
exclusions:
  - Logo design
  - Domain acquisition
tags: [branding, fixed-price]
---
```

`services/visual-identity-sprint/SERVICE.md`:

```md
---
schema: agentagencies/v1
kind: service
id: visual-identity-sprint
version: 1.0.0
name: Visual Identity Sprint
description:
  Three-week sprint covering logo, colour palette, typography, and a usage
  guide.
pricing_model: identity-sprint-fixed
procedures: [run-identity-sprint]
default_role: visual-designer
tags: [branding, fixed-price]
---
```

`pricing-models/naming-sprint-fixed/PRICING-MODEL.md`:

```md
---
schema: agentagencies/v1
kind: pricing-model
id: naming-sprint-fixed
version: 1.0.0
name: Naming Sprint Fixed Price
model: fixed
fixed_price:
  amount: 6000
  currency: USD
tags: [fixed-price]
---
```

---

## 2. Engagement with one procedure

A counterparty buys the naming sprint. The engagement references the service +
counterparty; the agreement gates the start; the procedure runs once.

`counterparties/acme/COUNTERPARTY.md`:

```md
---
schema: agentagencies/v1
kind: counterparty
id: acme
version: 1.0.0
name: Acme Corp
legal_name: Acme Software, Inc.
contact_email: ops@acme.example
address: 123 Market St, San Francisco, CA 94103
tax_id: XX-XXXXXXX
tags: [saas, seed-stage]
---
```

`engagements/acme-naming-2026q2/ENGAGEMENT.md`:

```md
---
schema: agentagencies/v1
kind: engagement
id: acme-naming-2026q2
version: 1.0.0
service: brand-naming-sprint
counterparty: acme
state: draft
agreement: acme-naming-2026q2-msa
deliverables: []
invoices: []
tags: [naming, q2]
---

## Scope notes

Standard sprint. No special terms.
```

`agreements/acme-naming-2026q2-msa/AGREEMENT.md`:

```md
---
schema: agentagencies/v1
kind: agreement
id: acme-naming-2026q2-msa
version: 1.0.0
engagement: acme-naming-2026q2
signers:
  - role: founder
  - counterparty: acme
acceptance_policy: signed
acceptance_signers: [founder]
effective_date: 2026-04-01
termination_date: 2026-04-30
policy: autonomous-up-to-2k
tags: [msa]
---

## Terms

Fixed-price USD 6000. Two-week sprint. Acceptance on signed final brief.
```

`procedures/run-naming-sprint/PROCEDURE.md`:

```md
---
schema: agentagencies/v1
kind: procedure
id: run-naming-sprint
version: 1.0.0
name: Run Naming Sprint
description: Discovery, shortlist, screening, final pick.
service: brand-naming-sprint
entry: procedure.ts
workflow: naming-sprint-workflow
assigned_to: [strategist-01]
tags: [naming]
---
```

`procedures/run-naming-sprint/procedure.ts`:

```ts
import { defineProcedure } from "<host-runtime>"
import { z } from "zod"

export default defineProcedure({
  id: "run-naming-sprint",
  service: "brand-naming-sprint",
  inputSchema: z.object({ engagementId: z.string() }),
  outputSchema: z.object({ deliverableIds: z.array(z.string()) }),
  workflow: "naming-sprint-workflow",
})
```

---

## 3. Multi-step engagement with deliverables

A bigger sprint emits three deliverables — one per checkpoint. Each deliverable
validates against its own schema; the engagement records each as it lands.

`procedures/run-identity-sprint/PROCEDURE.md`:

```md
---
schema: agentagencies/v1
kind: procedure
id: run-identity-sprint
version: 1.0.0
name: Run Visual Identity Sprint
description: Three-week sprint, three checkpoints, three deliverables.
service: visual-identity-sprint
entry: procedure.ts
workflow: identity-sprint-workflow
checkpoints:
  - id: discovery-complete
    after_step: discovery
    description: Discovery workshop concluded; brief approved.
  - id: concepts-approved
    after_step: concept-review
    description: Three concept directions approved by founder.
  - id: final-package-ready
    after_step: package
    description: Final logo package, colour palette, typography ready.
deliverables:
  - slug: discovery-brief
    produced_by: discovery
    schema:
      type: object
      properties:
        problem: { type: string }
        audience: { type: string }
        keywords: { type: array, items: { type: string } }
      required: [problem, audience]
  - slug: concept-deck
    produced_by: concept-review
    schema:
      type: object
      properties:
        directions:
          type: array
          items:
            type: object
            properties:
              name: { type: string }
              moodboard: { type: string }
              rationale: { type: string }
            required: [name, moodboard]
      required: [directions]
  - slug: final-package
    produced_by: package
    schema:
      type: object
      properties:
        logoSvg: { type: string }
        paletteHexes: { type: array, items: { type: string } }
        typographyJson: { type: object }
      required: [logoSvg, paletteHexes]
tags: [identity, multi-step]
---
```

`deliverables/concept-deck-acme-2026q2/DELIVERABLE.md`:

```md
---
schema: agentagencies/v1
kind: deliverable
id: concept-deck-acme-2026q2
version: 1.0.0
engagement: acme-identity-2026q2
produced_by: run-identity-sprint:concept-review
produced_at: 2026-04-15T16:30:00Z
accepted_at: 2026-04-16T09:00:00Z
signatures:
  - ../../signatures/founder-2026-04-16.signature.json
artifacts:
  - path: ./directions.json
    content_type: application/json
    checksum: sha256:8a4f1b…
tags: [identity, mid-sprint]
---
```

---

## 4. Fixed-price vs hourly invoice

Two pricing models, two invoice shapes. Fixed-price invoices have a single line
item tied to the deliverable; hourly invoices have one line item per session.

`pricing-models/strategy-hourly/PRICING-MODEL.md`:

```md
---
schema: agentagencies/v1
kind: pricing-model
id: strategy-hourly
version: 1.0.0
name: Strategy Hourly
model: hourly
hourly_rate:
  amount: 250
  currency: USD
tags: [hourly]
---
```

Fixed-price invoice:

```md
---
schema: agentagencies/v1
kind: invoice
id: inv-acme-naming-001
version: 1.0.0
engagement: acme-naming-2026q2
issuer: founder
issued_at: 2026-04-30T18:00:00Z
due_at: 2026-05-30
currency: USD
state: issued
total:
  amount: 6000
  currency: USD
line_items:
  - description: Brand naming sprint — fixed fee
    amount:
      amount: 6000
      currency: USD
    deliverable: final-package-acme-naming-2026q2
signatures:
  - ../../signatures/founder-2026-04-30.signature.json
tags: [fixed-price]
---
```

Hourly invoice:

```md
---
schema: agentagencies/v1
kind: invoice
id: inv-acme-strategy-2026-04
version: 1.0.0
engagement: acme-strategy-2026q2
issuer: founder
issued_at: 2026-05-01T10:00:00Z
due_at: 2026-05-31
currency: USD
state: issued
total:
  amount: 3000
  currency: USD
line_items:
  - description: Strategy session — Apr 3
    quantity: 4
    unit: hour
    amount:
      amount: 1000
      currency: USD
  - description: Strategy session — Apr 17
    quantity: 4
    unit: hour
    amount:
      amount: 1000
      currency: USD
  - description: Strategy session — Apr 24
    quantity: 4
    unit: hour
    amount:
      amount: 1000
      currency: USD
signatures:
  - ../../signatures/founder-2026-05-01.signature.json
tags: [hourly]
---
```

---

## 5. Procedure with checkpoints

Checkpoints surface mid-procedure progress without exposing every underlying
workflow step. They map by id to AIP-15 step ids; the host emits a
`procedure.checkpoint` audit event on each completion.

`procedures/run-quarterly-audit/PROCEDURE.md`:

```md
---
schema: agentagencies/v1
kind: procedure
id: run-quarterly-audit
version: 1.0.0
name: Quarterly SOC2 Pre-Audit
description:
  Six-week sweep across access logs, change records, and incident reports.
service: soc2-pre-audit
entry: procedure.ts
workflow: soc2-pre-audit-workflow
checkpoints:
  - id: access-review-complete
    after_step: review-access
    description: Access-control matrix reconciled.
  - id: change-records-complete
    after_step: review-changes
    description: Change-management review concluded.
  - id: incident-review-complete
    after_step: review-incidents
    description: Incident-history audit concluded.
  - id: report-drafted
    after_step: draft-report
    description: Pre-audit report drafted, awaiting client review.
deliverables:
  - slug: pre-audit-report
    produced_by: draft-report
    schema:
      type: object
      properties:
        findings:
          type: array
          items:
            type: object
            properties:
              area: { type: string }
              severity: { enum: [low, medium, high, critical] }
              description: { type: string }
              remediation: { type: string }
            required: [area, severity, description]
      required: [findings]
tags: [compliance, audit, multi-checkpoint]
---
```

The runtime emits checkpoint events as it crosses each one — the engagement
watcher dashboards off those events without needing to introspect the underlying
workflow.

---

## 6. Agency forked from another

An open-source agency package can be forked the same way an AIP-6 company
package can. The fork updates branding, swaps a pricing model, but inherits
procedures unchanged.

`AGENCY.md` of the fork:

```md
---
schema: agentagencies/v1
kind: agency
id: nordic-brandshop
version: 1.0.0
name: Nordic Brandshop
description:
  Naming and identity sprints with Scandinavian sensibilities. Forked from
  brandshop@1.0.0.
company: nordic-brandshop-co
billing_currency: EUR
working_hours: Mon-Thu 09:00-17:00 Europe/Stockholm
default_policy: autonomous-up-to-1k-eur
tags: [branding, forked, eu]
metadata:
  fork:
    upstream: brandshop
    upstream_version: 1.0.0
    diverged_at: 2026-04-12
---
```

`pricing-models/naming-sprint-fixed/PRICING-MODEL.md` (overridden in the fork):

```md
---
schema: agentagencies/v1
kind: pricing-model
id: naming-sprint-fixed
version: 1.0.1
name: Naming Sprint Fixed Price (EUR)
model: fixed
fixed_price:
  amount: 5500
  currency: EUR
tags: [fixed-price, eur, forked]
---
```

The procedure files from the upstream stay untouched; the fork's package
manifest pins them at the upstream version.

---

## 7. Audit-traceable engagement (composes with AIP-7)

A full lifecycle viewed through the audit log. Each transition is a single
hash-chained event in `audit/audit-log.jsonl`; each contractual artifact carries
a `signatures/` folder with AIP-7 signature events.

`engagements/acme-naming-2026q2/ENGAGEMENT.md` after closing:

```md
---
schema: agentagencies/v1
kind: engagement
id: acme-naming-2026q2
version: 1.0.0
service: brand-naming-sprint
counterparty: acme
state: closed
agreement: acme-naming-2026q2-msa
deliverables:
  - shortlist-acme-2026q2
  - final-package-acme-2026q2
invoices:
  - inv-acme-naming-001
started_at: 2026-04-15T09:00:00Z
delivered_at: 2026-04-29T17:00:00Z
closed_at: 2026-05-15T11:00:00Z
tags: [naming, closed]
---
```

`audit/audit-log.jsonl` (excerpt — one event per line, hash-chained):

```jsonl
{"event":"engagement.created","subject":"acme-naming-2026q2","ts":"2026-04-01T10:00:00Z","actor":"founder","prev":"…","hash":"…"}
{"event":"engagement.proposed","subject":"acme-naming-2026q2","ts":"2026-04-02T09:30:00Z","actor":"founder","prev":"…","hash":"…"}
{"event":"signature.recorded","subject":"acme-naming-2026q2-msa","signer":"founder","ts":"2026-04-03T14:00:00Z","prev":"…","hash":"…"}
{"event":"signature.recorded","subject":"acme-naming-2026q2-msa","signer":"acme","ts":"2026-04-03T16:20:00Z","prev":"…","hash":"…"}
{"event":"engagement.agreed","subject":"acme-naming-2026q2","ts":"2026-04-03T16:21:00Z","prev":"…","hash":"…"}
{"event":"engagement.started","subject":"acme-naming-2026q2","ts":"2026-04-15T09:00:00Z","prev":"…","hash":"…"}
{"event":"procedure.checkpoint","subject":"acme-naming-2026q2","checkpoint":"discovery-complete","ts":"2026-04-17T11:00:00Z","prev":"…","hash":"…"}
{"event":"deliverable.produced","subject":"shortlist-acme-2026q2","ts":"2026-04-22T15:00:00Z","prev":"…","hash":"…"}
{"event":"deliverable.signed","subject":"shortlist-acme-2026q2","signer":"founder","ts":"2026-04-23T09:00:00Z","prev":"…","hash":"…"}
{"event":"deliverable.produced","subject":"final-package-acme-2026q2","ts":"2026-04-29T16:00:00Z","prev":"…","hash":"…"}
{"event":"deliverable.signed","subject":"final-package-acme-2026q2","signer":"founder","ts":"2026-04-29T17:00:00Z","prev":"…","hash":"…"}
{"event":"engagement.delivered","subject":"acme-naming-2026q2","ts":"2026-04-29T17:00:00Z","prev":"…","hash":"…"}
{"event":"invoice.issued","subject":"inv-acme-naming-001","signer":"founder","ts":"2026-04-30T18:00:00Z","prev":"…","hash":"…"}
{"event":"engagement.invoiced","subject":"acme-naming-2026q2","ts":"2026-04-30T18:00:01Z","prev":"…","hash":"…"}
{"event":"invoice.paid","subject":"inv-acme-naming-001","ts":"2026-05-15T10:50:00Z","prev":"…","hash":"…"}
{"event":"engagement.closed","subject":"acme-naming-2026q2","ts":"2026-05-15T11:00:00Z","prev":"…","hash":"…"}
```

Any third-party verifier in any language can replay this chain against the AIP-7
hash protocol and confirm the engagement was executed as recorded.

---

## Anti-patterns to avoid

- **Skipping the AIP-7 signature** on `AGREEMENT.md` / `DELIVERABLE.md` /
  `INVOICE.md` — implementations that auto-mark these as accepted without a
  signature event are non-conforming. The cost: third-party verification breaks.
- **Embedding pricing inside `SERVICE.md`** instead of referencing a
  `PRICING-MODEL.md` — duplicates the rule across services and loses the ability
  to vary pricing per region or counterparty.
- **Multiple procedures listed on one engagement run together** — one engagement
  runs ONE procedure at a time. Multi-step services use a single procedure with
  multiple steps + deliverables, not multiple parallel procedures.
- **Engagement `state` jumps over a transition** (e.g. `proposed → in-progress`)
  — every transition is its own atomic operation with its own audit row. Hosts
  MUST refuse the jump.
- **Auto-signing agreements without a `policy:` reference** — the agency's
  `default_policy` MAY allow it, but the agreement MUST cite which policy
  authorised the autonomous signature. Audit reviewers need that citation.
- **Counterparty PII inline without redaction** — `COUNTERPARTY.md` is a
  workspace file that may end up in version control. Sensitive fields (tax IDs,
  addresses) MAY be referenced by external secret store; encode the reference,
  not the value.
- **Forking an agency without bumping the package version** — fork consumers
  can't tell whether they're tracking upstream or the fork's edits.

## See also

- [AIP-8 — agentagencies/v1 spec](/docs/aip-8)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — agentgovernance/v1](/docs/aip-7)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./AGENCY.schema.json`](./AGENCY.schema.json) — manifest validator
