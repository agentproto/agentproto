---
schema: skills/v1
name: author-agency
title: Author an agency workspace (AIP-8)
description:
  Walk through authoring a portable agentagencies/v1 workspace — services,
  procedures, engagements, agreements, deliverables, invoices — that any
  conforming runtime can ingest and execute.
version: 1.0.0
tags: [aip-8, agencies, authoring, manifest, agentproto]
inputs:
  - name: missionStatement
    type: string
    required: true
    description:
      One-paragraph description of what the agency sells and to whom. The skill
      turns this into AGENCY.md, a service catalog, and at least one end-to-end
      engagement template.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to an existing AIP-6 company folder to extend. If omitted,
      the skill scaffolds a fresh package containing both the AIP-6 root files
      and the AIP-8 operations layer.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for procedure entry files. Default "ts". Accepts "ts",
      "py", "go", "rs", "js".
examples:
  - input:
      missionStatement:
        We run a fixed-price brand-naming sprint for early-stage SaaS founders —
        workshop, shortlist, trademark check, final delivery in two weeks.
    output:
      - agency/AGENCY.md
      - agency/services/brand-naming-sprint/SERVICE.md
      - agency/procedures/run-naming-sprint/PROCEDURE.md
      - agency/procedures/run-naming-sprint/procedure.ts
---

# Author an agency workspace (AIP-8)

Use this skill when the user asks to **stand up, draft, or define an autonomous
agency** — not just an agent or a workflow, but the whole operations envelope
around them. The skill produces a valid [AIP-8 agentagencies/v1](/docs/aip-8)
workspace on top of the AIP-6 company primitives, with services in the catalog,
procedures wired to runtime entries, and the engagement → agreement →
deliverable → invoice lifecycle ready to instantiate.

## When to use

- "Set up an agency that sells X to Y."
- "I want to publish a service catalog and start taking engagements."
- "Turn this consultancy playbook into something an autonomous operator can
  run."
- "Add an invoiceable deliverable to my company package."

## When NOT to use

- The user wants a **single tool** → use the
  [AIP-14 tool-authoring skill](../../../aip-14/skills/author-tool/SKILL.md).
- The user wants a **single workflow** → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/skills/author-workflow/SKILL.md).
  Note: AIP-8 procedures are workflow-shaped — author the workflow first if it's
  reusable across services, then reference it from `PROCEDURE.md`.
- The user only needs the **company structure** (roles, objectives, operators)
  without commercial operations → stop at AIP-6.
- The user only needs **audit + approval** without doctype-level operations →
  stop at AIP-7.

## Lifecycle in one diagram

```
SERVICE.md  (catalog item)
    │
    ▼ a counterparty buys
ENGAGEMENT.md  (commercial instance, references service + counterparty)
    │
    ▼ both parties sign
AGREEMENT.md  (signed contract — gated by AIP-7 signature)
    │
    ▼ procedure runs (workflow-shaped, AIP-15)
PROCEDURE.md  (vendor-neutral playbook, may emit checkpoints)
    │
    ▼ produces work product
DELIVERABLE.md  (artifact — gated by AIP-7 signature on accept)
    │
    ▼ priced via PRICING-MODEL
INVOICE.md  (bill — gated by AIP-7 signature on issue)
```

Each arrow is a state transition; each transition is an audit event. The skill
walks the user through every doctype in the order above.

## Process

Eight steps. The contractual artifacts (`AGREEMENT.md`, `DELIVERABLE.md`,
`INVOICE.md`) carry real commitments — get [AIP-7](/docs/aip-7) approval gating
right or the agency commits the operator to obligations it can't reverse.

### 1. Confirm the AIP-6 substrate exists

AIP-8 extends AIP-6, never replaces it. Before authoring any operations doctype,
verify the company package has:

- `COMPANY.md` (identity, mission, structure)
- `roles/<slug>/ROLE.md` for every role the procedures will reference (delivery
  lead, account manager, billing, …)
- At least one `operators/<slug>/OPERATOR.md` if the procedures will run
  autonomously

If any of those are missing, **stop and route the user to AIP-6 first**. AIP-8
doctypes that reference roles or operators by slug will fail validation against
an empty company.

Author `AGENCY.md` alongside `COMPANY.md` — same package, additional operational
profile (working hours, billing currency, default governance policy slug).

### 2. Write the service catalog

For each commercial offering, author a `services/<slug>/SERVICE.md` with at
minimum:

- `id` — kebab-case slug, the catalog primary key.
- `name`, `description` — public-facing.
- `pricing_model` — slug of a `pricing-models/<slug>/PRICING-MODEL.md` (fixed,
  hourly, retainer, milestone). One pricing model per service is the canonical
  shape; offer variants via separate services.
- `procedures` — list of procedure slugs the service triggers.
- `default_role` — which role(s) own delivery (referenced from AIP-6).

Decline these anti-patterns:

- A service with no `procedures` (catalog item that does nothing).
- A service that references procedures by name instead of slug.
- A "mega-service" that covers unrelated offerings — split into multiple
  `SERVICE.md` files; the engagement always picks one.

### 3. Author procedures as workflow-shaped playbooks

A `PROCEDURE.md` is a vendor-neutral playbook. The doctype describes WHAT the
procedure does and HOW it composes; the runtime body is a
[WORKFLOW.md](/docs/aip-15) under the hood.

Two authoring shapes:

- **Inline** — the procedure folder contains `PROCEDURE.md` plus a
  `procedure.ts` (or `.py` / etc.) that exposes `defineProcedure(...)`. The body
  either inlines steps or delegates to a referenced workflow.
- **Reference** — `PROCEDURE.md` references an existing `WORKFLOW.md` by slug
  under `workflow:`. Useful when the same workflow backs multiple services.

For every procedure, decide:

- **Checkpoints** — points at which the runtime emits a structured status event
  the engagement records. Map to step ids in the underlying workflow.
- **Deliverable specs** — which steps emit a `DELIVERABLE.md`. Each spec has a
  slug and a JSON Schema for the artifact's frontmatter.
- **Approval policy** — which steps require an AIP-7 signature before
  continuation. Default to `on-mutate` unless the user declares otherwise.

### 4. Decide the engagement model

An `ENGAGEMENT.md` is the commercial instance that connects a counterparty to a
service. Per engagement:

- `service` — slug of the catalog service.
- `counterparty` — slug of `counterparties/<slug>/COUNTERPARTY.md`.
- `state` — current lifecycle state (`draft` | `proposed` | `agreed` |
  `in-progress` | `delivered` | `invoiced` | `closed` | `cancelled`).
- `agreement` — slug of the bound `AGREEMENT.md` (set when state reaches
  `agreed`).
- `deliverables[]` — list of slugs as they're produced.
- `invoices[]` — list of slugs as they're issued.

Engagements are the **scheduling unit** — routines and capacity attach here, not
on services.

### 5. Set the safety contract on every contractual artifact

This step is the one the user can't skip. AIP-7 signatures gate three doctypes:

| Doctype          | Approval rule                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AGREEMENT.md`   | MUST be signed by both parties before state can advance to `agreed`. Implementations that skip the signature are non-conforming. |
| `DELIVERABLE.md` | MUST be signed when accepted. The signing role is named in the agreement.                                                        |
| `INVOICE.md`     | MUST be signed by the issuing role. Optionally counter-signed on payment receipt.                                                |

For autonomous flows, gate which agreements an operator MAY sign without human
approval via a `policies/<slug>/POLICY.md` (AIP-7) referenced from `AGENCY.md`
under `default_policy`.

If the user skips this — pause and ask. Auto-signing an agreement without an
autonomy policy is the highest-risk default in the spec.

### 6. Compose the procedure entry

The entry file exposes `defineProcedure`. The signature mirrors
[AIP-15](/docs/aip-15)'s `defineWorkflow` plus AIP-8-specific deliverable /
checkpoint declarations:

```ts
import {
  defineProcedure,
  defineService,
  defineEngagement,
  defineAgreement,
  defineDeliverable,
  defineInvoice,
} from "<host-runtime>"
import { z } from "zod"

export const runNamingSprint = defineProcedure({
  id: "run-naming-sprint",
  service: "brand-naming-sprint",
  description:
    "Run the two-week naming sprint: discovery, shortlist, screening, final delivery.",
  inputSchema: z.object({ engagementId: z.string() }),
  outputSchema: z.object({ deliverableIds: z.array(z.string()) }),
  checkpoints: [
    { id: "discovery-complete", afterStep: "discovery" },
    { id: "shortlist-approved", afterStep: "shortlist-approval" },
    { id: "trademark-cleared", afterStep: "screening" },
  ],
  deliverables: [
    { slug: "shortlist", producedBy: "shortlist", schema: shortlistSchema },
    { slug: "final-package", producedBy: "package", schema: packageSchema },
  ],
  workflow: "naming-sprint-workflow", // references a WORKFLOW.md
})
```

### 7. Compose the doctype manifests

Author the corresponding markdown files:

```md
---
schema: agentagencies/v1
kind: service
id: brand-naming-sprint
name: Brand Naming Sprint
description:
  Two-week sprint that delivers a shortlist of trademark-cleared names.
version: 1.0.0
pricing_model: fixed-price-naming
procedures: [run-naming-sprint]
default_role: brand-strategist
tags: [branding, fixed-price]
---

## Overview

<long-form>

## Inclusions / Exclusions

## Pricing summary
```

Mirror the same field surface in `PROCEDURE.md`, `ENGAGEMENT.md`,
`AGREEMENT.md`, `DELIVERABLE.md`, `INVOICE.md`. Drift between the entry's
`defineX(...)` value and the manifest frontmatter is a spec bug.

### 8. Validate

Validate every doctype against [`./AGENCY.schema.json`](./AGENCY.schema.json):

```bash
npx ajv validate -s ./AGENCY.schema.json -d 'agency/**/*.md'
```

Beyond schema validation, statically check:

- Every `service.procedures[]` slug resolves to a real `PROCEDURE.md`.
- Every `procedure.workflow` slug resolves to a real
  [`WORKFLOW.md`](/docs/aip-15).
- Every `engagement.service` resolves; `engagement.counterparty` resolves; the
  lifecycle `state` transitions are legal.
- Every `agreement.signatures[]`, `deliverable.signatures[]`,
  `invoice.signatures[]` reference a valid AIP-7 `signature` event whose
  `subject` matches the file's slug.

## Output

Produce a workspace tree like:

```
agency/
  AGENCY.md
  COMPANY.md                # AIP-6
  roles/<slug>/ROLE.md      # AIP-6
  policies/<slug>/POLICY.md # AIP-7 (autonomy rule)
  services/<slug>/SERVICE.md
  pricing-models/<slug>/PRICING-MODEL.md
  procedures/<slug>/PROCEDURE.md
  procedures/<slug>/procedure.ts
  counterparties/<slug>/COUNTERPARTY.md
  engagements/<slug>/ENGAGEMENT.md
  agreements/<slug>/AGREEMENT.md
  agreements/<slug>/signatures/<signer>-<iso>.signature.json
  deliverables/<slug>/DELIVERABLE.md
  invoices/<slug>/INVOICE.md
  audit/audit-log.jsonl     # AIP-7 chain
```

Reply to the user with:

1. The folder you wrote to.
2. A summary of the **lifecycle wiring** — which procedure feeds which
   deliverables, and which doctypes are gated by AIP-7 signatures.
3. A list of the **autonomy policy decisions** baked in: which agreements an
   operator MAY auto-sign, which require a human, what the default fallback is.
4. **Open assumptions** — pricing-model defaults, currency, working-hours
   timezone, default approver role for invoices — that the user might want to
   override before going live.

Do NOT instantiate engagements, sign agreements, or issue invoices yourself.
Authoring ends with the files written.

## See also

- [AIP-8 — agentagencies/v1 spec](/docs/aip-8)
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — company / role substrate
- [AIP-7 — agentgovernance/v1](/docs/aip-7) — signatures, audit log, policies
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15) — procedures are workflow-shaped
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspace patterns
- [`./AGENCY.schema.json`](./AGENCY.schema.json) — manifest validator
