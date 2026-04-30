---
schema: skills/v1
name: author-agency-workspace
title: Author an AGENCY.md (workspace root or view) for AIP-21
description:
  Walk through writing an agency.workspace/v2 manifest — either the canonical
  root for a new commercial agency or a per-context view that extends a parent —
  using the defineAgencyWorkspace canonical signature, with explicit
  one-way-switch checks across signing, audit, scope, and contract before
  validation.
version: 1.0.0
tags:
  [
    aip-21,
    agency,
    workspace,
    manifest,
    agentproto,
    composition,
    collections,
    commercial,
  ]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a new consulting agency", "an account-manager view on the existing
      agency", "an EU-jurisdiction lens on the org agency"). The skill picks
      workspace-root vs view based on this and on whether a parent AGENCY.md is
      in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new AGENCY.md will be written.
      For a workspace root, this is the agency tree root. For a view, this is
      the consumer's folder.
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent AGENCY.md, when authoring a view.
      If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, skills).
      Required when authoring a view that wants `appliesTo` populated.
examples:
  - input:
      intent:
        A new consulting agency with services, engagements, agreements,
        deliverables, and invoices; signing required; audit on; lifecycle rules
        ON.
      workspaceDir: /repo/agency
    output:
      - /repo/agency/AGENCY.md (created, workspace root)
  - input:
      intent:
        An account-manager view on the existing agency, narrowed to engagements
        + deliverables + invoices, with a stale-engagement lint.
      workspaceDir: /repo/operators/account-manager
      parentManifest: /repo/agency/AGENCY.md
      appliesTo: [ws://operators/account-manager]
    output:
      - /repo/operators/account-manager/AGENCY.md (created, view)
---

# Author an `AGENCY.md` (workspace root or view) for AIP-21

Use this skill when the user asks to **draft, extend, or revise** an
`agency.workspace/v2` manifest under [AIP-21](/docs/aip-21). The skill produces
a valid manifest (workspace-root or view), with the right identity block,
collection declarations, scope axes, lifecycle rules, lint rules, and cross-AIP
refs, ready for `defineAgencyWorkspace` to load.

An `AGENCY.md` manifest is the machine-readable contract for an
[AIP-21](/docs/aip-21) commercial agency — what the agency _sells_ (service
catalog), what it _commits to_ (engagement / agreement), what it _delivers_
(deliverable), what it _bills_ (invoice), and how those collections propagate
state across each other (lifecycle rules). The same doctype is used in two
modes: a **workspace root** at the agency tree root (no `extends:`), and a
**view** in any operator/company/jurisdiction folder (with `extends:` pointing
at a parent). Authoring either is the same flow, with one branch on step 1.

**Critical:** AIP-21 delegates ALL per-doctype concerns (fields, status state
machines, ownership cardinality, deadline kinds, signature semantics on
agreements, financial fields on invoices) to [AIP-18](/docs/aip-18). Do NOT
re-specify any of those in `AGENCY.md` — declare collections, then let AIP-18
own the schemas.

## When to use

- "Set up a new commercial agency — write its `AGENCY.md` from scratch."
- "Add a per-operator lens on the existing agency — write a view that extends
  the workspace."
- "Add an EU-jurisdiction view that narrows currency and payment terms."
- "Bind an [AIP-7](/docs/aip-7) governance policy and an [AIP-10](/docs/aip-10)
  wiki to this agency."
- "Add a lifecycle rule so deliverable acceptance auto-marks the engagement as
  delivered."

## When NOT to use

- The user wants to **author per-doctype schemas** (fields, statuses, ownership
  rules on `engagement` or `invoice`) — that's [AIP-18](/docs/aip-18)'s
  `author-collection` skill.
- The user wants to **write individual items** (a specific engagement record, a
  specific invoice) — also AIP-18.
- The user wants to **change the AIP-21 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **edit an existing `AGENCY.md` in place without considering
  the chain** — read the parent first, run the merge in your head, then edit.

## Process

Follow these steps in order. Composition and one-way switches are the central
mechanics; steps 1-2 set up the right mode, steps 3-11 fill in the body, step 12
validates.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `AGENCY.md` upstream that this manifest should adapt?**
  If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / jurisdiction)? If yes → view (set `appliesTo`); if no → workspace
  root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, set `extends:`, understand one-way switches

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `AGENCY.md`. The host resolves it bottom-up; recursion
is allowed.

```yaml
# Operator view at /repo/operators/account-manager/AGENCY.md
extends: ../../AGENCY.md
```

Rules:

- Use POSIX path separators in `extends:` even on Windows.
- Maximum chain depth is eight. Two-to-three levels is the common case.

**One-way switches — read the parent FIRST.** Five fields, once set at any
ancestor, MUST NOT be relaxed by descendants. Trying to relax triggers a HARD
refusal — the view fails to load. Before authoring a view, read the parent (and
its parent, if any) and identify which one-way switches are already on:

| Field                                                      | One-way condition                                                                                 | HARD refusal code                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `defaults.auditMutations`                                  | If any ancestor is `true`, descendants cannot set `false`.                                        | `agency_audit_downgrade`             |
| `scope.containment.enabled`                                | If any ancestor is `true`, descendants cannot set `false`.                                        | `agency_scope_disable`               |
| `scope.applicability.valueClass`                           | If any ancestor sets a value, descendants cannot change it.                                       | `agency_scope_value_class_drift`     |
| `governance.signing.required` (via the bound AIP-7 policy) | If any ancestor's policy requires signing, descendants cannot rebind to a policy that relaxes it. | `agency_signing_downgrade`           |
| `engagement.terms.contractRequired`                        | If any ancestor is `true`, descendants cannot set `false`.                                        | `agency_contract_required_downgrade` |

If the parent has any of these set, do NOT redeclare them on the view — inherit
silently. If you absolutely need a different value, the conversation belongs at
the parent's level (or in [AIP-7](/docs/aip-7) governance), not in this view.

### 3. Identity (legal entity, taxId, jurisdiction, defaultCurrency)

The `identity:` block is AIP-21's distinctive contribution. Set it on the
workspace root; views typically inherit unchanged unless they're
per-jurisdiction.

```yaml
identity:
  legalEntity: ws://companies/agentik-sas # AIP-6 ref to the agency's legal entity
  legalName: Agentik SAS # display string fallback
  taxId: FR12345678901 # VAT / EIN / GST — opaque to spec
  jurisdiction: FR # ISO 3166-1 alpha-2
  defaultCurrency: EUR # ISO 4217
```

Rules:

- All five fields are OPTIONAL. A solo operator with no billing may omit the
  block entirely.
- `legalEntity` is the AIP-6 ref — when set, hosts SHOULD resolve it and
  populate `legalName`/`taxId` automatically. Use the ref form when you've
  registered an AIP-6 company; use the string form (`legalName` only) when the
  agency is unincorporated.
- `jurisdiction` is uppercase ISO 3166-1 alpha-2 (`FR`, `US`, `GB`). The schema
  rejects lowercase or three-letter codes.
- `defaultCurrency` is uppercase ISO 4217 (`EUR`, `USD`, `GBP`).
- Per-jurisdiction views typically narrow `jurisdiction` and `defaultCurrency`;
  per-operator views typically inherit.

### 4. Cross-AIP bindings

```yaml
executor: ws://operators/managing-director
governance: ../policies/agency-default.yaml
knowledge: ws://wikis/agency-knowledge/KNOWLEDGE.md
work: ws://workspaces/agency-engagements
playbook: ws://playbooks/agency-quarterly
companies: ws://companies
```

| Field        | Required    | When to set                                                                                                                 |
| ------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `executor`   | optional    | Default executor for items without an explicit assignee.                                                                    |
| `governance` | optional    | Set when [AIP-7](/docs/aip-7) approval gates apply. **Required for any agency that signs agreements.**                      |
| `knowledge`  | optional    | Set when items reference an [AIP-10](/docs/aip-10) wiki by default (case studies, methodology).                             |
| `work`       | optional    | Set when engagement deliverables are tracked as work items in an [AIP-20](/docs/aip-20) work workspace.                     |
| `playbook`   | optional    | Set when an [AIP-12](/docs/aip-12) playbook governs routine plays.                                                          |
| `companies`  | optional    | Resolution root for counterparty refs. Set when counterparties resolve to AIP-6 companies.                                  |
| `appliesTo`  | conditional | REQUIRED in view mode (whenever `extends` is set AND the view binds to a consumer). MUST NOT be set in workspace-root mode. |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`agency_appliesto_unresolvable`) — verify the consumer's workspace exists.

The host also refuses workspaces with unresolvable `executor`, `governance`,
`knowledge`, `playbook`, `companies`, or `identity.legalEntity` refs
(`agency_xref_unresolvable`, HARD). `work` and `defaults.workflow` are warn-only
(may be provisioned later).

### 5. Collections — inline vs ref vs aliased

`collections:` is the bridge to [AIP-18](/docs/aip-18). Three forms:

- **Inline.** Full AIP-18 collection.schema/v1 frontmatter embedded in
  `AGENCY.md`. Useful for small, single-tenant agencies.
- **File ref** (`./collections/<name>/COLLECTION.md`). Useful when the
  collection is shared with peer agencies.
- **Registry import** (`ws://collections/<slug>`). Useful for third-party or
  org-shared collections.

Aliasing (any ref form):

```yaml
collections:
  - ref: ws://collections/contract
    alias: agreement # workspace-local rename
    version: "1.x" # pin schema range
```

Resolution order (highest priority wins):

1. Inline (declared on this `AGENCY.md`).
2. File ref (resolved relative to this manifest's directory).
3. Registry import (`ws://collections/<slug>`).

Two collection entries resolving to the same effective name (alias or upstream
`name`) is a HARD failure (`agency_collection_alias_conflict`).

When extending an [AIP-18](/docs/aip-18) starter collection (e.g.
`agentagencies-v1-compat/counterparty`) with jurisdiction-specific fields, write
the extended collection inline OR as a sibling file with its own `extends:` —
and then ref the extended file from `AGENCY.md`. Do NOT mutate the starter file
in place.

### 6. Scope axes (containment / applicability / ownership)

The three orthogonal axes:

```yaml
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
```

Guidance:

- **Containment** controls parent/child. Use `allowedKinds` to prevent miscoded
  relationships.
- **Applicability** controls visibility / scope. The natural `valueClass` for
  agencies is `client` (counterparty refs); alternatives include `market`,
  `service`, or domain-specific classes. **Once set, descendants CANNOT change
  it.**
- **Ownership** is mostly delegated to per-collection [AIP-18](/docs/aip-18)
  ownership rules.

Recall the one-way switches — `scope.containment.enabled: true` and
`scope.applicability.valueClass` cannot be relaxed by descendants.

### 7. Engagement lifecycle rules — the AIP-21 distinctive step

Cross-collection state propagation. This is the AIP-21 flagship feature: rules
that bubble status from one collection's items onto another's.

```yaml
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
```

Rules:

- Each rule MUST have `id`, `when`, `forCollection`, `bubbleStatus`.
- `bubbleStatus:` MUST be a status id that exists on the `forCollection`'s state
  machine (declared in the collection's `COLLECTION.md`). The host warns and
  skips bubbles for invalid statuses (`agency_lifecycle_rule_invalid`).
- The `(forCollection, params.sourceCollection)` graph MUST be acyclic. Cycles
  are HARD-refused (`agency_lifecycle_cycle`).
- Self-loops (same collection in both fields) are forbidden.

Common patterns:

| Pattern                                                 | Rule shape                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| All deliverables accepted ⇒ engagement delivered        | `all-items-in-collection-terminal` on `engagement` from `deliverable` |
| Any invoice paid ⇒ engagement invoiced                  | `any-linked-item-status` on `engagement` from `invoice`               |
| Engagement terminal ⇒ agreement closed                  | `linked-item-terminal` on `agreement` from `engagement`               |
| Counterparty has no engagements ⇒ counterparty inactive | `no-linked-items` on `counterparty` from `engagement`                 |

### 8. Workspace-spanning lints

AIP-18 lints are per-collection (`missing-owner`, `overdue`). AIP-21 lints span
collections:

```yaml
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
```

Workspace-spanning lint kinds:

| Kind                        | Purpose                                                                                   | `params`                                 |
| --------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| `stale-engagement`          | Engagement items that have not moved within `days`.                                       | `days: <n>`, `collections: [engagement]` |
| `unsigned-agreement`        | Agreement items past `requireSignatureWithin` days without a valid AIP-7 signature event. | `requireSignatureWithin: <n>`            |
| `overdue-invoice`           | Invoice items past their `dueAt` plus `gracePeriodDays` without a `paid` status.          | `gracePeriodDays: <n>`                   |
| `broken-procedure-ref`      | Procedure items pointing to AIP-15 workflows that do not resolve.                         | none                                     |
| `orphan-across-collections` | Items in `collections` with no inbound parent ref.                                        | `collections: [...]`                     |
| `stale-tree`                | Items in a containment tree where no descendant has been updated within `days`.           | `days: <n>`, `collections: [...]`        |
| `broken-parent-ref`         | Item's `parent` ref doesn't resolve.                                                      | none                                     |
| `scope-mismatch`            | Item's applicability conflicts with parent's.                                             | `axis: applicability`                    |
| `custom`                    | Host-defined, identified by `id`.                                                         | host-defined                             |

Severity:

- `error` — block writes that fail the lint.
- `warn` — surface in the audit log, do not block.
- `info` — surface in tooling only.

### 9. Routine workflow defaults

```yaml
defaults:
  workflow: ./workflows/nightly-sweep/WORKFLOW.md
  approvalClass: on-mutate
  auditMutations: true
```

| Field            | Values                                                       |
| ---------------- | ------------------------------------------------------------ |
| `workflow`       | path or ws:// ref to an [AIP-15](/docs/aip-15) `WORKFLOW.md` |
| `approvalClass`  | `auto` / `always` / `on-mutate` / `policy:<ref>`             |
| `auditMutations` | boolean — ONE-WAY SWITCH                                     |

`auditMutations: true` is one of the five one-way switches. Enable it
deliberately.

### 10. Engagement terms (contractRequired, paymentTerms, currency)

```yaml
engagement:
  terms:
    contractRequired: true
    defaultPaymentTerms: net-30
    defaultCurrency: EUR
```

| Field                 | Values                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `contractRequired`    | boolean — **ONE-WAY SWITCH**                                                 |
| `defaultPaymentTerms` | `net-15` / `net-30` / `net-60` / `due-on-receipt` / `prepaid` / custom kebab |
| `defaultCurrency`     | ISO 4217 (falls back to `identity.defaultCurrency`)                          |

`contractRequired: true` is the AIP-21 commercial protection switch. Once
enabled at any ancestor, descendants cannot disable it — engagements without an
agreement become refused writes across the whole tree.

### 11. Display / UX hints

```yaml
display:
  homePage: ENG-acme-q2
  defaultGrouping: counterparty # kind | status | counterparty | engagement
  defaultView: dashboard # list | board | timeline | dashboard
```

Pure UI hints; no validation impact.

### 12. Validate against `AGENCY.schema.json`; if view, dry-run merge

Validate the new manifest's frontmatter against
[AIP-21's schema](../../AGENCY.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-21/draft/AGENCY.schema.json \
  -d "<workspaceDir>/AGENCY.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends`.
- `collections[].alias` produces a name collision → rename or drop the alias.
- `lifecycle.rules[].bubbleStatus` references a status id not declared on the
  target collection's state machine → either add the status to the collection or
  change the bubble target.
- `lifecycle.rules` graph has a cycle → restructure the rules.
- `identity.jurisdiction` not ISO 3166-1 alpha-2 → use uppercase two-letter
  (`FR`, not `france` or `fra`).
- `identity.defaultCurrency` not ISO 4217 → uppercase three-letter (`EUR`, not
  `€` or `eur`).
- `version` not semver → `1.0.0`, not `1` or `v1`.

If view, run the host's resolution algorithm in dry-run mode and **explicitly
check that no one-way switch is relaxed**:

```md
## Merge diff: account-manager-view (vs parent agentik-agency)

Inherited (no change):

- identity: legalEntity=ws://companies/agentik-sas, jurisdiction=FR,
  defaultCurrency=EUR
- collections: service, engagement, agreement, deliverable, invoice,
  counterparty
- scope.containment: enabled=true, allowedKinds=[engagement, deliverable],
  maxDepth=3
- scope.applicability: enabled=true, field=appliesTo, valueClass=client
- defaults.auditMutations: true (one-way; cannot disable)
- engagement.terms.contractRequired: true (one-way; cannot disable)
- governance: ../policies/agency-default.yaml (signing.required: true; one-way)
- lifecycle.rules: deliverables-complete, any-invoice-paid, engagement-terminal

Overridden:

- executor: ws://operators/managing-director → ws://operators/account-manager
- display.homePage: ENG-acme-q2 → DASH-am-pipeline
- display.defaultView: dashboard → board

Added:

- lints.stale-engagement-14d (kind=stale-engagement, severity=warn, days=14)
- appliesTo: [ws://operators/account-manager]

One-way switch check: PASS

- defaults.auditMutations: parent=true, view=undefined → inherits true OK
- scope.containment.enabled: parent=true, view=undefined → inherits true OK
- scope.applicability.valueClass: parent=client, view=undefined → inherits OK
- governance.signing.required: parent=true (via policy), view=undefined →
  inherits OK
- engagement.terms.contractRequired: parent=true, view=undefined → inherits OK

Resolution chain: 2 levels (agentik-agency → account-manager-view) Warnings:
none
```

If the merge diff shows the view RELAXING any one-way switch, the view will be
HARD-refused at load — fix it before declaring success.

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to the parent's value via the merge).

## Final checklist

Before declaring done:

- [ ] `schema: agency.workspace/v2` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing `AGENCY.md`;
      `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] `identity.jurisdiction` is uppercase ISO 3166-1 alpha-2 (or absent).
- [ ] `identity.defaultCurrency` is uppercase ISO 4217 (or absent).
- [ ] `collections[]` entries have unique effective names; refs resolve; inline
      frontmatters validate against AIP-18's `COLLECTION.schema.json`.
- [ ] Per-doctype concerns (fields, statuses, ownership rules) are NOT in
      `AGENCY.md` — they live on `COLLECTION.md` files.
- [ ] `scope.containment.rules.allowedKinds` references real collection names.
- [ ] `scope.applicability.valueClass` is set deliberately; it cannot change in
      descendants.
- [ ] `lifecycle.rules` — every `forCollection` is registered; every
      `bubbleStatus` exists on the target collection; the graph is acyclic.
- [ ] `lints[]` have unique `id`s.
- [ ] `defaults.auditMutations` is set deliberately (one-way).
- [ ] `engagement.terms.contractRequired` is set deliberately (one-way).
- [ ] Cross-AIP refs (`executor`, `governance`, `knowledge`, `work`, `playbook`,
      `companies`, `identity.legalEntity`) all resolve.
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `AGENCY.schema.json`.
- [ ] Body is short and prose-only.
- [ ] If view: dry-run merge diff was reviewed; **no one-way switch is relaxed
      (audit, scope.containment, scope.valueClass, signing, contractRequired)**.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf.
4. **Effective config summary** — the merged shape: identity, active
   collections, scope axes, lifecycle rules, lints, and one-way switches in
   effect.
5. **Bindings** — `executor`, `governance`, `knowledge`, `work`, `playbook`,
   `companies`, `identity.legalEntity`, `appliesTo` (if set), each with a
   one-line note.
6. **One-way switch report** — for a view, an explicit per-switch line:
   `auditMutations: parent=<x>, view=<y>, status=PASS|FAIL`, covering all five
   switches.
7. **Lifecycle rule report** — count of rules, target collections, any rule with
   an invalid `bubbleStatus`.
8. **Validation result** — schema clean, dry-run merge clean, warnings (if any).
9. **Open assumptions** — fields you guessed (lifecycle predicates,
   stale-engagement thresholds, payment terms, lint severities) that the user
   might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation.

## See also

- [AIP-21 — agentagencies/v2 spec](/docs/aip-21)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this skill
  composes on
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10)
- [AIP-12 — agentplaybooks/v1](/docs/aip-12)
- [AIP-15 — WORKFLOW.md](/docs/aip-15)
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests
- [`../../AGENCY.schema.json`](../../AGENCY.schema.json) — frontmatter validator
- [`../../starters/agentagencies-v1-compat/`](../../starters/agentagencies-v1-compat)
  — starter collection library
