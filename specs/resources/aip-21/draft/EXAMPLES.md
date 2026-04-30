# EXAMPLES.md — agentagencies/v2 reference patterns

Reference manifests exemplifying common authoring patterns for
[AIP-21](/docs/aip-21). Each example is a self-contained `AGENCY.md` a host
could load as-is. Manifest authors should copy the closest pattern and edit
fields rather than draft from scratch.

## Patterns covered

1. [Minimal solo agency — single freelancer](#example-1--minimal-solo-agency--single-freelancer)
2. [Per-operator view — account manager lens](#example-2--per-operator-view--account-manager-lens)
3. [Multi-collection commercial agency — full pack](#example-3--multi-collection-commercial-agency--full-pack)
4. [Per-jurisdiction view — EU lens](#example-4--per-jurisdiction-view--eu-lens)
5. [Three-level chain — org → studio → operator (one-way switch)](#example-5--three-level-chain--org--studio--operator-one-way-switch)

---

## Example 1 — Minimal solo agency — single freelancer

The smallest legal `AGENCY.md`: required frontmatter, one inline `service`
collection, no lifecycle rules, no governance binding. Useful for an
unincorporated freelance practice that wants a catalog of services without the
full commercial machinery.

```yaml
---
schema: agency.workspace/v2
name: solo-freelance
title: Solo freelance practice
description: |
  Personal freelance practice. One inline 'service' collection
  to track what I sell. No engagements yet, no agreements, no
  lifecycle rules. Lives at my work tree root.
version: 1.0.0

identity:
  legalName: Jane Doe (sole proprietor)
  jurisdiction: US
  defaultCurrency: USD

collections:
  - inline:
      schema: collection.schema/v1
      name: service
      title: Service
      description: A catalog item — something I offer to clients.
      version: 1.0.0
      fields:
        - name: pricing
          type: enum
          enum: [fixed, hourly, project]
        - name: rate
          type: number
          description: Hourly or fixed rate in identity.defaultCurrency.
        - name: tags
          type: array
          items:
            type: string
      statuses:
        - { id: draft, label: Draft, transitionsTo: [live, retired] }
        - { id: live, label: Live, transitionsTo: [retired] }
        - { id: retired, label: Retired, terminal: true }
      initialStatus: draft
      ownership:
        cardinality: single
        role: owner
        required: false

scope:
  containment:
    enabled: false
  applicability:
    enabled: false
  ownership:
    enabled: true
    field: owner
    policy: open

lifecycle:
  enabled: false

display:
  defaultGrouping: status
  defaultView: list
---

# Solo freelance practice

## Purpose

Personal service catalog. Just one collection, no engagements
tracked yet, no governance machinery.

## What this agency does NOT cover

- Contractual engagements — handled outside this manifest, for now.
- Invoicing — done in the existing accounting tool.

## When to extend

When the practice incorporates and starts running engagements,
add the `engagement`, `agreement`, `deliverable`, and `invoice`
starter collections, set `engagement.terms.contractRequired:
true`, and bind `governance:` to the new policy.
```

**When to use.** The smallest viable agency. The manifest deliberately avoids
declaring lifecycle rules, scope axes (other than ownership), or cross-AIP
bindings; there is nothing to compose with yet.

---

## Example 2 — Per-operator view — account manager lens

A view that extends a shared agency workspace, narrows visibility to
engagement + deliverable + invoice collections, adds a workspace-level lint
catching stale engagements, and rebinds the default executor.

```yaml
---
schema: agency.workspace/v2
name: account-manager-view
title: Account manager view
description: |
  Account manager's lens on the shared agency workspace. Surfaces
  active engagements + their deliverables + invoices; hides the
  service catalog and counterparty registry (those are stable, the
  AM doesn't edit them daily). Adds a stricter stale-engagement
  lint at 14 days (vs the org default of 30).
version: 1.0.0

extends: ../../<agency-root>/AGENCY.md
appliesTo:
  - ws://operators/account-manager

executor: ws://operators/account-manager

# Inherit identity, governance, work, and other cross-AIP refs
# untouched. Narrow the visible collections.
collections:
  - ref: ./collections/engagement/COLLECTION.md
  - ref: ./collections/deliverable/COLLECTION.md
  - ref: ./collections/invoice/COLLECTION.md

lints:
  - id: stale-engagement-14d
    kind: stale-engagement
    severity: warn
    params:
      days: 14
      collections: [engagement]

display:
  defaultGrouping: counterparty
  defaultView: board
  homePage: ENG-acme-q2
---

# Account manager view

## Purpose

The account manager's daily landing page. Engagements grouped by
counterparty, with stale-engagement lint catching deals that
haven't moved in two weeks.

## When to extend vs replace

Sub-team account leads MAY further narrow this view by binding to
a per-region operator. Forking is rarely the right move — keep
the chain.
```

**When to use.** Whenever an operator (AIP-9) needs a lens on a shared agency.
The view inherits the parent's identity, scope axes, lifecycle rules, and
one-way switches; it adds only what's specific to the role.

---

## Example 3 — Multi-collection commercial agency — full pack

The full commercial agency: five core collections (`service`, `engagement`,
`agreement`, `deliverable`, `invoice`); lifecycle rules ON; governance + signing
required; one cross-AIP-6 counterparty binding via `companies:`.

```yaml
---
schema: agency.workspace/v2
name: agentik-agency
title: Agentik consulting agency
description: |
  Shared agency workspace for the Agentik consulting practice.
  Tracks services, engagements, agreements, deliverables, and
  invoices. Bound to the agency knowledge wiki, the engagement
  work tracker, and the org governance policy. Engagements
  require signed agreements; mutations are audited.
version: 2.1.0

identity:
  legalEntity: ws://companies/agentik-sas
  legalName: Agentik SAS
  taxId: FR12345678901
  jurisdiction: FR
  defaultCurrency: EUR

executor: ws://operators/managing-director
governance: ../policies/agency-default.yaml
knowledge: ws://wikis/agency-knowledge/KNOWLEDGE.md
work: ws://workspaces/agency-engagements
playbook: ws://playbooks/agency-quarterly
companies: ws://companies

collections:
  # Five starter collections from agentagencies-v1-compat:
  - ref: ./collections/service/COLLECTION.md
  - ref: ./collections/engagement/COLLECTION.md
  - ref: ./collections/agreement/COLLECTION.md
  - ref: ./collections/deliverable/COLLECTION.md
  - ref: ./collections/invoice/COLLECTION.md
  # The counterparty collection extended inline with French legal fields:
  - inline:
      schema: collection.schema/v1
      name: counterparty
      title: Counterparty (FR)
      description: |
        Counterparty record for FR-jurisdiction engagements. Adds
        SIREN and SIRET fields on top of the starter counterparty.
      version: 1.0.0
      extends: ../../starters/agentagencies-v1-compat/counterparty/COLLECTION.md
      fields:
        - name: siren
          type: string
          description: 9-digit FR SIREN identifier.
        - name: siret
          type: string
          description: 14-digit FR SIRET identifier (per establishment).
      ownership:
        cardinality: single
        role: owner
        required: true

lifecycle:
  enabled: true
  rules:
    - id: deliverables-complete
      when: all-items-in-collection-terminal
      forCollection: engagement
      bubbleStatus: delivered
      params:
        sourceCollection: deliverable
        terminalStatuses: [accepted]
        linkField: engagement
    - id: any-invoice-paid
      when: any-linked-item-status
      forCollection: engagement
      bubbleStatus: invoiced
      params:
        sourceCollection: invoice
        statusEquals: paid
        linkField: engagement
    - id: engagement-terminal
      when: linked-item-terminal
      forCollection: agreement
      bubbleStatus: closed
      params:
        sourceCollection: engagement
        linkField: agreement

scope:
  containment:
    enabled: true
    field: parent
    rules:
      allowedKinds: [engagement, deliverable]
      maxDepth: 3
  applicability:
    enabled: true
    field: appliesTo
    valueClass: client
  ownership:
    enabled: true
    field: owner
    policy: inherit

lints:
  - id: stale-engagement-30d
    kind: stale-engagement
    severity: warn
    params:
      days: 30
      collections: [engagement]
  - id: unsigned-agreement
    kind: unsigned-agreement
    severity: error
    params:
      requireSignatureWithin: 14
  - id: overdue-invoice
    kind: overdue-invoice
    severity: error
    params:
      gracePeriodDays: 7
  - id: broken-procedure
    kind: broken-procedure-ref
    severity: error

defaults:
  workflow: ./workflows/nightly-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true                          # one-way switch ON

engagement:
  terms:
    contractRequired: true                      # one-way switch ON
    defaultPaymentTerms: net-30
    defaultCurrency: EUR

display:
  homePage: ENG-acme-q2
  defaultGrouping: counterparty
  defaultView: dashboard
---

# Agentik consulting agency

## Purpose

Coordination workspace for the Agentik consulting practice.
Engagements contain deliverables; deliverables roll up to mark
engagements `delivered`; invoices roll up to mark engagements
`invoiced`; engagements terminating roll up to close their gating
agreements.

## Conventions

- A `service` is a catalog item — what we sell. Listing a service
  doesn't bind anyone to anything.
- An `engagement` is a single client deal. Every engagement MUST
  have a corresponding `agreement` (contractRequired: true).
- A `deliverable` is an asset we owe under one engagement. It
  rolls up to its engagement when accepted.
- An `invoice` is a bill issued under one engagement. Multiple
  invoices per engagement (milestones) are normal.
- A `counterparty` is the client legal entity; the `companyRef`
  field resolves under the bound `companies:` root.
- `appliesTo` carries client refs; the value class is locked at
  `client`.

## What this agency does NOT cover

- Internal operator work tracking — that lives in the bound work
  workspace (`work: ws://workspaces/agency-engagements`).
- Invoicing tooling internals — handled in the bound accounting
  tool. AIP-21 tracks the invoice records, not the rendering or
  payment processing.

## When to extend vs replace

Per-jurisdiction views (EU, US, UK) SHOULD extend this workspace
and narrow `identity.jurisdiction`, `identity.defaultCurrency`,
and `engagement.terms.defaultPaymentTerms`. Per-operator views
SHOULD extend and add per-role lints / homepages. Forking the org
agency would lose the audit + contract + signing one-way switches
that compliance relies on.
```

**When to use.** The full commercial agency. Mixes ref forms (file

- inline-extending-starter), declares all three scope axes, enables three
  lifecycle rules, binds governance + work + knowledge
- companies + playbook. The Agentik engagement workspace — every
  per-jurisdiction or per-operator view extends from here.

---

## Example 4 — Per-jurisdiction view — EU lens

A view that extends the parent agency, sets jurisdiction-specific identity (FR,
EUR), narrows payment terms to net-30 (the EU/B2B norm), and adds a
VAT-validation lint.

```yaml
---
schema: agency.workspace/v2
name: agency-eu
title: Agentik EU operations
description: |
  EU-jurisdiction lens on the parent agency workspace. Sets
  jurisdiction=FR, defaultCurrency=EUR, payment terms net-30, and
  adds a VAT-id-presence lint catching counterparties without a
  declared SIREN/VAT for B2B engagements.
version: 1.0.0

extends: ../../AGENCY.md
appliesTo:
  - ws://companies/agentik-sas

identity:
  legalEntity: ws://companies/agentik-sas
  jurisdiction: FR
  defaultCurrency: EUR

# Inherit governance, work, knowledge, companies untouched.
# Inherit lifecycle.rules untouched (org-level rules apply EU-wide).

engagement:
  terms:
    defaultPaymentTerms: net-30
    defaultCurrency: EUR
    # contractRequired inherited from parent (true; one-way) — do NOT redeclare.

lints:
  - id: missing-vat-id
    kind: custom
    severity: warn
    params:
      check: counterparty-has-tax-id
      collections: [counterparty]
      jurisdiction: FR

display:
  defaultGrouping: engagement
---

# Agentik EU operations

## Purpose

EU-jurisdiction lens on the agency workspace. All engagements
booked under this view inherit FR jurisdiction and EUR currency
defaults; the VAT-id-presence lint catches B2B counterparties
missing legally-required identifiers.

## Conventions

- New engagements default to net-30 payment terms (EU B2B norm).
- Counterparties MUST carry a VAT/SIREN id; the lint surfaces
  warnings when the field is empty.
- Currency conversions across jurisdiction boundaries are NOT
  declared here; per-engagement override the currency when
  serving non-EUR clients.
```

**When to use.** Per-jurisdiction composition where the jurisdiction-specific
defaults (currency, payment terms, identifier requirements) and lints are added
on top of a shared parent. The view inherits all the parent's lifecycle rules
and one-way switches; it only adds the jurisdiction-specific layer.

---

## Example 5 — Three-level chain — org → studio → operator (one-way switch)

A three-level composition demonstrating the one-way switches on
`governance.signing.required`, `defaults.auditMutations`, and
`engagement.terms.contractRequired`. The org sets all three; the studio passes
them through unchanged; the operator's view CANNOT relax them. Includes a
counter-example showing the HARD refusal.

### Level 1 — Org agency

`org/AGENCY.md`:

```yaml
---
schema: agency.workspace/v2
name: agentik-org
title: Agentik organisation (root)
description: |
  Organisation-wide root agency. Sets the audit, signing, and
  contract-required switches — all one-way; descendants cannot
  relax them. Concrete collections are added by sub-studio views.
version: 1.0.0

identity:
  legalEntity: ws://companies/agentik-sas
  jurisdiction: FR
  defaultCurrency: EUR

governance: ../policies/org-default.yaml      # AIP-7 policy with signing.required: true
companies: ws://companies

collections:
  - ref: ./collections/service/COLLECTION.md
  - ref: ./collections/engagement/COLLECTION.md
  - ref: ./collections/agreement/COLLECTION.md
  - ref: ./collections/deliverable/COLLECTION.md
  - ref: ./collections/invoice/COLLECTION.md
  - ref: ./collections/counterparty/COLLECTION.md

scope:
  containment:
    enabled: true                              # ONE-WAY: descendants cannot disable
    field: parent
    rules:
      allowedKinds: [engagement, deliverable]
      maxDepth: 3
  applicability:
    enabled: true
    field: appliesTo
    valueClass: client                         # ONE-WAY: descendants cannot change
  ownership:
    enabled: true
    field: owner
    policy: inherit

defaults:
  approvalClass: on-mutate
  auditMutations: true                         # ONE-WAY: descendants cannot disable

engagement:
  terms:
    contractRequired: true                     # ONE-WAY: descendants cannot disable
    defaultPaymentTerms: net-30
---

# Agentik org root

## Purpose

The organisation's root agency. Every studio and operator view
extends this workspace; the audit + signing + contract switches
are set here so no descendant can relax them.

## When to extend vs replace

Always extend. Forking the org root would lose the contractual
invariants that compliance relies on.
```

### Level 2 — Studio agency

`studios/creative/AGENCY.md`:

```yaml
---
schema: agency.workspace/v2
name: creative-studio
title: Creative studio
description: |
  Creative studio operating under the agency umbrella. Inherits
  the org's audit, signing, contract switches unchanged; adds a
  proposal collection (creative-specific) and a moodboard
  collection. Binds the design knowledge wiki.
version: 1.2.0

extends: ../../AGENCY.md

knowledge: ws://wikis/design-system/KNOWLEDGE.md

collections:
  - ref: ws://collections/proposal
  - ref: ws://collections/moodboard

# Containment + applicability + audit + signing + contractRequired
# inherited unchanged. Do NOT redeclare them — silent inheritance
# is the contract.
---

# Creative studio

## Purpose

Creative studio's lens on the org agency. Adds proposal +
moodboard collections; inherits everything else from the org.

## Conventions

- A `proposal` is a pre-engagement document. Once accepted, it
  spawns an `engagement` + `agreement` pair (the parent's
  contractRequired invariant kicks in).
- Moodboards live alongside deliverables but don't trigger
  invoice generation.
```

### Level 3 — Operator view (CORRECT)

`operators/creative-director/AGENCY.md`:

```yaml
---
schema: agency.workspace/v2
name: creative-director-view
title: Creative director lens
description: |
  Creative director's lens on the studio agency. Narrows the
  homepage to a creative roadmap dashboard; surfaces a per-lead
  lint. Does NOT touch the audit, signing, or contract switches.
version: 1.0.0
extends: ../../studios/creative/AGENCY.md
appliesTo:
  - ws://operators/creative-director

lints:
  - id: lead-stale-proposals
    kind: stale-tree
    severity: warn
    params:
      collections: [proposal]
      days: 7
      ownerEquals: ws://operators/creative-director

display:
  homePage: DASH-creative-roadmap
  defaultView: dashboard
---
# Creative director lens

## Purpose

Daily landing for the creative director. Stricter stale-tree lint on the
director's own proposals, narrower homepage.
```

The chain validates cleanly. The host computes the merged effective config,
exposes the resolution chain
(`org/AGENCY.md → studios/creative/AGENCY.md → operators/creative-director/AGENCY.md`),
and registers all eight collections (six from org + two from studio) under their
effective names.

### Level 3 — Operator view (COUNTER-EXAMPLE: HARD refusal)

A view that tries to relax the signing switch:

```yaml
---
schema: agency.workspace/v2
name: creative-director-view-broken
title: Creative director lens (broken)
description: Tries to disable the signing requirement for this lens.
version: 1.0.0

extends: ../../studios/creative/AGENCY.md
appliesTo:
  - ws://operators/creative-director

# Imagine a custom policy file that sets signing.required: false:
governance: ../policies/no-signing.yaml # ATTEMPTS TO DOWNGRADE
---
```

**Result.** The host walks the resolution chain:

1. `org/AGENCY.md` binds `governance: ../policies/org-default.yaml`, whose
   `signing.required: true`.
2. `studios/creative/AGENCY.md` inherits the binding (no override).
3. `operators/creative-director/AGENCY.md` (this view) rebinds `governance:` to
   a policy whose `signing.required: false`.

The host MUST refuse the view with `agency_signing_downgrade` (HARD). The view
does NOT degrade; it fails to load. The author MUST either drop the override or
rebind to a policy that keeps `signing.required: true`.

The same posture applies if the view tries:

- `defaults.auditMutations: false` → refused with `agency_audit_downgrade`
  (HARD).
- `engagement.terms.contractRequired: false` → refused with
  `agency_contract_required_downgrade` (HARD).
- `scope.containment.enabled: false` → refused with `agency_scope_disable`
  (HARD).
- `scope.applicability.valueClass: market` (changing from `client`) → refused
  with `agency_scope_value_class_drift` (HARD).

**When to use.** Three-level (or deeper) compositions where compliance, audit,
signing, or contract invariants must hold across every descendant. The five
one-way switches make the resolution chain trustworthy without re-validating
every leaf.

---

## See also

- [AIP-21 — agentagencies/v2 spec](/docs/aip-21)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- [AIP-20 — agentwork/v2](/docs/aip-20)
- [`./AGENCY.schema.json`](./AGENCY.schema.json) — frontmatter validator
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./skills/author-agency-workspace/SKILL.md`](./skills/author-agency-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/agentagencies-v1-compat/`](./starters/agentagencies-v1-compat) —
  starter collection library
