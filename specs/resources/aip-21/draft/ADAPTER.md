# ADAPTER.md — implementing AIP-21 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and maintain** [AIP-21](/docs/aip-21)
`agentagencies/v2` workspaces. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing
`defineAgencyWorkspace` to manifest authors and routing item-level calls down to
[AIP-18](/docs/aip-18)'s `defineCollection` / `defineItem`. Manifest authors
themselves should read
[`./skills/author-agency-workspace/SKILL.md`](./skills/author-agency-workspace/SKILL.md),
not this file.

## Contract overview

A conforming host implements **five responsibilities**:

1. **Load the workspace manifest** — read `AGENCY.md` at the agency root (or in
   a consumer folder for a view), validate against
   [`./AGENCY.schema.json`](./AGENCY.schema.json), resolve any `extends:` chain,
   expose both the merged effective config and the resolution chain.
2. **Validate workspace-level invariants** — the five one-way switches
   (`auditMutations`, `scope.containment.enabled`,
   `scope.applicability.valueClass`, `governance.signing.required`,
   `engagement.terms.contractRequired`) MUST be checked across the resolved
   chain; violations are HARD refusals.
3. **Resolve `extends:`** — walk the chain bottom-up, merge per the strategy
   table, expose warnings on malformed chains, refuse views with unresolvable
   `appliesTo` bindings.
4. **Register collections** — for each entry in `collections[]`, delegate to
   [AIP-18](/docs/aip-18). Inline → register directly via AIP-18's
   `defineCollection`. Ref (file or registry) → load via AIP-18, register under
   the alias if set. AIP-21 owns workspace-level conflicts (alias collisions);
   AIP-18 owns item-schema conflicts.
5. **Run lints + lifecycle rollups** — workspace-spanning lints
   (stale-engagement, unsigned-agreement, overdue-invoice, broken-procedure-ref)
   at maintenance-pass time; lifecycle rules evaluated at item-write time and at
   parent-item read time.

The signature `defineAgencyWorkspace` is the boundary between the host and the
manifest author.

## Loading `AGENCY.md`

The workspace manifest is the host's first read on every agency load and on
every consumer (operator/company/jurisdiction) activation.

### Resolution algorithm

When a host reads an `AGENCY.md`:

1. **Parse the frontmatter** as YAML. Validate against the schema in
   [`./AGENCY.schema.json`](./AGENCY.schema.json). On failure, surface
   `agency_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `agency_extends_missing` as a
     WARNING (not an error), use the local manifest only, mark the chain as
     broken, and proceed.
   - If the parent has already appeared in the visited set: emit
     `agency_extends_cycle` as a WARNING, break the chain at the cycle point,
     use the partial chain, and proceed.
   - If the chain depth would exceed eight: emit `agency_extends_depth_exceeded`
     as a WARNING, break the chain at the eighth ancestor, use the partial
     chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below.
5. **Check one-way switches across the resolved chain.** For each one-way switch
   (`defaults.auditMutations`, `scope.containment.enabled`,
   `scope.applicability.valueClass`, `governance.signing.required`,
   `engagement.terms.contractRequired`), walk the resolution chain and verify no
   descendant relaxes the ancestor's value. If the chain violates an invariant,
   refuse with the corresponding HARD code (`agency_audit_downgrade`,
   `agency_scope_disable`, `agency_scope_value_class_drift`,
   `agency_signing_downgrade`, `agency_contract_required_downgrade`).
6. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view with
   `agency_appliesto_unresolvable` if any binding fails to resolve.
7. **Register collections** by walking the merged `collections[]` array. See
   [Collection registration](#collection-registration).
8. **Validate cross-AIP refs** — `executor`, `governance`, `knowledge`, `work`,
   `playbook`, `companies`, `identity.legalEntity`, `defaults.workflow`. Each
   unresolvable ref surfaces `agency_xref_unresolvable` (HARD for the first six
   and for `identity.legalEntity`; warn for `work` and `defaults.workflow`).
9. **Validate lifecycle rules.** For each rule in `lifecycle.rules`, verify (a)
   `forCollection` is registered; (b) `bubbleStatus` exists on `forCollection`'s
   state machine; (c) `params.sourceCollection` (when used by the predicate) is
   registered; (d) the `(forCollection, sourceCollection)` edge set is acyclic.
   Surface `agency_lifecycle_rule_invalid` (warn) on (b) violations; refuse with
   `agency_lifecycle_cycle` (HARD) on (d).

The host MUST NOT execute any code in `AGENCY.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                                               | Strategy                | Notes                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`                                           | override                | Child's identity wins.                                                                                              |
| `extends`                                                                           | local-only              | Not inherited.                                                                                                      |
| `appliesTo`                                                                         | local-only              | Not inherited.                                                                                                      |
| `identity.legalEntity` / `legalName` / `taxId` / `jurisdiction` / `defaultCurrency` | leaf-field override     | Each identity field overrides independently.                                                                        |
| `executor`, `governance`, `knowledge`, `work`, `playbook`, `companies`              | override                | Child can rebind. Subject to one-way switches.                                                                      |
| `collections`                                                                       | merge-by-effective-name | Effective name = `alias` if set, otherwise the collection's `name`.                                                 |
| `lifecycle.enabled`                                                                 | override                |                                                                                                                     |
| `lifecycle.rules`                                                                   | merge-by-id             | Same `id` → child replaces parent's. New ids appended.                                                              |
| `scope.containment.enabled`                                                         | child wins (one-way)    | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `agency_scope_disable`.                        |
| `scope.containment.field` / `rules.*`                                               | leaf-field deep-merge   |                                                                                                                     |
| `scope.applicability.enabled` / `field`                                             | override                |                                                                                                                     |
| `scope.applicability.valueClass`                                                    | child wins (one-way)    | Once set at any ancestor, descendants MUST NOT change. HARD: `agency_scope_value_class_drift`.                      |
| `scope.ownership.*`                                                                 | leaf-field override     | `policy` may narrow (`open` → `inherit` → `strict`); widening is allowed mechanically but governance MAY forbid it. |
| `lints`                                                                             | merge-by-id             | Same `id` → child replaces parent's. New ids appended.                                                              |
| `lints[].severity`                                                                  | child wins              | Subject to governance: a parent's policy MAY forbid softening below `error`.                                        |
| `defaults.workflow` / `approvalClass`                                               | override                |                                                                                                                     |
| `defaults.auditMutations`                                                           | child wins (one-way)    | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `agency_audit_downgrade`.                      |
| `engagement.terms.contractRequired`                                                 | child wins (one-way)    | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `agency_contract_required_downgrade`.          |
| `engagement.terms.defaultPaymentTerms` / `defaultCurrency`                          | leaf-field override     |                                                                                                                     |
| `display.*`                                                                         | leaf-field override     |                                                                                                                     |
| `metadata`                                                                          | deep-merge              | Recursive merge; vendor namespaces accumulate.                                                                      |

## Collection registration

For each entry in the merged `collections[]`, the host MUST:

1. **Compute the effective name.** If `alias:` is set, the effective name is the
   alias. Otherwise the effective name is the collection's own `name` (read from
   the inline frontmatter or from the loaded `COLLECTION.md` for refs).
2. **Detect alias collisions.** If two entries resolve to the same effective
   name across the merged array, refuse with `agency_collection_alias_conflict`
   (HARD).
3. **Delegate to AIP-18.**
   - **Inline**: validate the inline frontmatter against
     [AIP-18's `COLLECTION.schema.json`](../aip-18/draft/COLLECTION.schema.json),
     then call AIP-18's `defineCollection`. The host registers the collection
     under the effective name (alias if set).
   - **File ref** (`./path/to/COLLECTION.md`): resolve the path relative to the
     manifest's directory, load the file, validate, then call
     `defineCollection`. Surface `agency_collection_unresolvable` on missing
     files.
   - **Registry ref** (`ws://collections/<slug>`): resolve through the host's
     collection registry. Surface `agency_collection_unresolvable` if the
     registry has no entry.
   - **Versioned ref** (`{ ref, version: "1.x" }`): pin the schema version
     range. The host MUST refuse a registered collection whose version falls
     outside the range with `collection_item_schema_pinned_drift` (HARD, AIP-18
     vocabulary) at item load time.
4. **Expose collection registration** through the merged effective config: a
   debug surface keyed by effective name returning the collection's resolved
   schema, the resolution chain (collection's own `extends:` chain — separate
   from the workspace's), and the registration source (inline / file /
   registry).

AIP-21 owns the workspace-level conflicts (alias collisions, ref
unresolvability, version range pinning). AIP-18 owns the item-schema conflicts
(field type drift, status removal, required-field narrowing). The two AIPs do
NOT share a refusal vocabulary; delegate cleanly.

## Engagement lifecycle enforcement

The lifecycle rules are AIP-21's distinctive contribution. Where
[AIP-20](/docs/aip-20)'s `statusRollup` aggregates child statuses **within one
collection tree**, AIP-21's `lifecycle.rules` propagate state **across
collections** — typically deliverable → engagement → invoice → agreement.

### Evaluation algorithm

The host MUST evaluate lifecycle rules at two times:

1. **Item write time** — after the per-collection [AIP-18](/docs/aip-18)
   validation succeeds, before the write commits. For each rule whose
   `forCollection` matches the written item's collection OR whose
   `params.sourceCollection` matches the written item's collection, re-evaluate
   the predicate against the current state.
2. **Parent-item read time** — when a consumer reads an item whose collection
   appears as `forCollection` in any rule, the host re-evaluates and may surface
   a stale-status warning.

For each rule:

1. **Identify the target item(s).** If the write was on `forCollection`, the
   target is the written item itself. If the write was on
   `params.sourceCollection`, the target is the item referenced by the
   `params.linkField` field of the written item.
2. **Resolve the source set.** Collect every item in `params.sourceCollection`
   whose `params.linkField` ref points at the target item.
3. **Evaluate the predicate.** Recognised predicates:

   | `when` clause                      | Meaning                                                                                                                      |
   | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
   | `all-items-in-collection-terminal` | Every item in the source set has a status with `terminal: true`. If `params.terminalStatuses` is set, narrow to that subset. |
   | `any-linked-item-status`           | At least one item in the source set has `status == params.statusEquals`.                                                     |
   | `linked-item-terminal`             | The (single) item in the source set is terminal. Used when `linkField` is one-to-one.                                        |
   | `no-linked-items`                  | The source set is empty.                                                                                                     |
   | `custom:<id>`                      | Host-defined predicate.                                                                                                      |

4. **Bubble the status** if the predicate holds.
   - The bubbled status MUST be a valid transition from the target's current
     status under [AIP-18](/docs/aip-18)'s `transitionsTo:` declaration. If not,
     surface `agency_lifecycle_rule_invalid` (warn) and skip the bubble.
   - If the target is already in `bubbleStatus`, the bubble is a no-op
     (idempotency).
   - The bubble write MUST be auditable as a separate event from the originating
     write (the audit log records "lifecycle rule <id> bubbled status <s> onto
     <item>").

### Cycle detection

A `lifecycle.rules` array forms a directed graph: each rule is an edge from
`params.sourceCollection` to `forCollection`. The host MUST refuse a workspace
whose graph has a cycle with `agency_lifecycle_cycle` (HARD). Trivial self-loops
(a rule with `forCollection == params.sourceCollection`) are also refused.

The check is run at workspace registration time and re-run on any hot-reload.

### Idempotency

Rule evaluation MUST be idempotent: running the rule N times in succession (with
no intervening writes) produces the same result as running it once. The host
SHOULD short-circuit when the predicate is unchanged from the last evaluation.

### Write-time vs query-time evaluation

- **Write-time** is the authoritative path: every write triggers re-evaluation,
  the bubble is audited, the new status is persisted.
- **Query-time** is the lazy path: a reader sees the live state even if a
  background write would have triggered the bubble. The host SHOULD evaluate at
  query time only when a recent `params.sourceCollection` write has not yet been
  processed by the bubble pipeline.

## Scope axis enforcement

The three scope axes (`containment`, `applicability`, `ownership`) are
workspace-level declarations whose enforcement happens at item write time. Same
posture as [AIP-20](/docs/aip-20):

1. **Containment.** When validating an item with a `parent` field (or whatever
   `scope.containment.field` declares), verify:
   - The parent ref resolves to an existing item.
   - If `scope.containment.rules.allowedKinds` is set, the parent's collection
     name is in the list.
   - If `scope.containment.rules.maxDepth` is set, the chain of ancestors is at
     most that deep.

   Failures surface as `agency_containment_violated` (HARD on item write).

2. **Applicability.** When validating an item with the applicability field set
   (default `appliesTo`), verify every value resolves under the declared
   `valueClass`:
   - `client` → ref to a counterparty item OR an AIP-6 company.
   - `market` → host-defined market segment ref.
   - `service` → ref to a `service` item in this agency.
   - `company` → ref to an AIP-6 company.
   - `role` / `role-and-company` → as in AIP-20.
   - `operator` → ref to an AIP-9 operator.
   - Custom class names → host-defined resolver.

   Failures surface as `agency_applicability_value_class_violation`.

3. **Ownership.** When validating an item, the host MUST consult the
   _per-collection_ ownership rules ([AIP-18](/docs/aip-18) `ownership.role`,
   `cardinality`, `required`) FIRST, then apply the workspace-level policy:
   - `policy: strict` — every collection's `ownership.required` MUST be true.
   - `policy: inherit` — delegate to the per-collection setting.
   - `policy: open` — even collections with `required: true` MAY have items
     without owners.

## Cross-AIP ref resolution

| Ref                                 | AIP                    | Resolver                                              |
| ----------------------------------- | ---------------------- | ----------------------------------------------------- |
| `ws://operators/<slug>`             | [AIP-9](/docs/aip-9)   | Look up the operator workspace.                       |
| `ws://companies/<slug>`             | [AIP-6](/docs/aip-6)   | Look up the company workspace.                        |
| `ws://companies` (root)             | [AIP-6](/docs/aip-6)   | Resolve the companies registry root.                  |
| `ws://skills/<slug>`                | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                           |
| `ws://wikis/<slug>(/KNOWLEDGE.md)?` | [AIP-10](/docs/aip-10) | Resolve the wiki workspace.                           |
| `ws://workspaces/<slug>(/WORK.md)?` | [AIP-20](/docs/aip-20) | Resolve the work workspace.                           |
| `ws://playbooks/<slug>`             | [AIP-12](/docs/aip-12) | Resolve the playbook.                                 |
| `ws://collections/<slug>`           | [AIP-18](/docs/aip-18) | Resolve through the collection registry.              |
| `governance: <path>`                | [AIP-7](/docs/aip-7)   | Resolve as a relative path to a policy/audit binding. |
| `defaults.workflow: <ref>`          | [AIP-15](/docs/aip-15) | Resolve as a path or ws:// to a `WORKFLOW.md`.        |
| `extends: <path>`                   | AIP-21                 | Resolve as a relative path to another `AGENCY.md`.    |
| `collections[].ref`                 | [AIP-18](/docs/aip-18) | Resolve as a path or ws:// to a `COLLECTION.md`.      |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer (HARD, `agency_appliesto_unresolvable`).

`executor` / `governance` / `knowledge` / `playbook` / `companies` /
`identity.legalEntity` enforcement: a host MUST refuse a workspace whose binding
does not resolve at load time (HARD, `agency_xref_unresolvable`).

`work` and `defaults.workflow` enforcement: surface as warning only — these MAY
be intentionally provisioned later (the agency may exist before its work
workspace is set up; nightly workflows may be disabled in dev).

## View activation

When an [AIP-9](/docs/aip-9) operator (or [AIP-6](/docs/aip-6) company, or
jurisdiction-scoped folder) loads, the host SHOULD:

1. Look for an `AGENCY.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above (including the one-way-switch
   check across the chain).
3. Pass the merged effective config to the consumer's runtime context: queries
   against the agency SHOULD use the view's merged `collections`, `scope.*`,
   `lifecycle.rules`, and `lints`; mutations SHOULD honour
   `defaults.approvalClass` and `defaults.auditMutations`; signing flows SHOULD
   honour the merged `governance.signing.required`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id so
   reviewers can audit which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`AGENCY.md` directly.

## Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedAgencyWorkspace = {
  effective: AgencyWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "agency.workspace/v2"
    name: string
    version: string
  }>
  collections: Array<{
    // resolved collection registrations
    effectiveName: string // alias if set, else collection.name
    source: "inline" | "file" | "registry"
    sourcePath?: string // for file refs
    sourceUri?: string // for ws:// refs
    versionPin?: string // semver range if set
    aip18Resolved: ResolvedCollection // delegated AIP-18 resolution
  }>
  lifecycleGraph: {
    // cycle-checked rule graph
    nodes: string[] // collection names involved
    edges: Array<{ from: string; to: string; ruleId: string }>
  }
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "agency_extends_missing"
      | "agency_extends_cycle"
      | "agency_extends_depth_exceeded"
      | "agency_lifecycle_rule_invalid"
      | "agency_collection_disabled_with_items"
      | "agency_xref_unresolvable_soft"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

The merged `effective` is what consumers use; the `chain` is what tooling uses
to explain _where_ a field came from; the `collections` array is the
workspace-to-AIP-18 bridge surface; the `lifecycleGraph` exposes the
cycle-checked rule topology for debugging; the `warnings` list is empty on a
healthy load.

## Conflict cases

The following examples illustrate the merge rules and HARD refusals with
concrete parent/child manifests. Each is a minimal pair, not a full manifest.

**1. Collection added by child.**

Parent (`<agency-root>/AGENCY.md`):

```yaml
collections:
  - ref: ./collections/engagement/COLLECTION.md
  - ref: ./collections/agreement/COLLECTION.md
```

Child (`operators/account-manager/AGENCY.md`):

```yaml
extends: ../../<agency-root>/AGENCY.md
collections:
  - ref: ./collections/engagement/COLLECTION.md
  - ref: ./collections/agreement/COLLECTION.md
  - ref: ./collections/proposal/COLLECTION.md
```

Effective: three collections — `engagement`, `agreement` (inherited) and
`proposal` (added by child). The host registers all three under their effective
names.

**2. Lifecycle rule override.**

Parent:

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
        linkField: engagement
```

Child:

```yaml
extends: ../parent/AGENCY.md
lifecycle:
  rules:
    - id: deliverables-complete # override
      when: all-items-in-collection-terminal
      forCollection: engagement
      bubbleStatus: ready-to-invoice # different status
      params:
        sourceCollection: deliverable
        terminalStatuses: [accepted]
        linkField: engagement
    - id: any-invoice-paid # add
      when: any-linked-item-status
      forCollection: engagement
      bubbleStatus: invoiced
      params:
        sourceCollection: invoice
        statusEquals: paid
        linkField: engagement
```

Effective:

```yaml
lifecycle:
  enabled: true
  rules:
    - id: deliverables-complete
      when: all-items-in-collection-terminal
      forCollection: engagement
      bubbleStatus: ready-to-invoice # child's override
      params:
        {
          sourceCollection: deliverable,
          terminalStatuses: [accepted],
          linkField: engagement,
        }
    - id: any-invoice-paid # added
      when: any-linked-item-status
      forCollection: engagement
      bubbleStatus: invoiced
      params:
        { sourceCollection: invoice, statusEquals: paid, linkField: engagement }
```

**3. Audit one-way switch HARD refusal.**

Parent:

```yaml
defaults:
  auditMutations: true
```

Child:

```yaml
extends: ../parent/AGENCY.md
defaults:
  auditMutations: false
```

Result: the host refuses the child view with `agency_audit_downgrade` (HARD).

**4. Scope value-class drift HARD refusal.**

Parent:

```yaml
scope:
  applicability:
    enabled: true
    field: appliesTo
    valueClass: client
```

Child:

```yaml
extends: ../parent/AGENCY.md
scope:
  applicability:
    valueClass: market
```

Result: refuse with `agency_scope_value_class_drift` (HARD).

**5. Cross-AIP ref binding.**

Parent:

```yaml
executor: ws://operators/managing-director
governance: ../policies/agency-default.yaml
knowledge: ws://wikis/agency-knowledge/KNOWLEDGE.md
work: ws://workspaces/agency-engagements
playbook: ws://playbooks/agency-quarterly
companies: ws://companies
identity:
  legalEntity: ws://companies/agentik-sas
  jurisdiction: FR
  defaultCurrency: EUR
```

Child:

```yaml
extends: ../parent/AGENCY.md
executor: ws://operators/account-manager # rebind
```

Effective: the child rebinds `executor` only; all other cross-AIP refs and
identity fields are inherited untouched. The host MUST verify
`ws://operators/account-manager` resolves before activating the view.

**6. View `appliesTo` enforcement.**

```yaml
extends: ../parent/AGENCY.md
appliesTo:
  - ws://operators/account-manager
  - ws://operators/this-operator-does-not-exist
```

Result: the host attempts to resolve every ref. The second ref fails. The host
refuses with `agency_appliesto_unresolvable` (HARD).

**7. Cross-collection lifecycle propagation (worked example).**

Parent agency declares two rules:

```yaml
lifecycle:
  enabled: true
  rules:
    - id: deliverables-complete
      when: all-items-in-collection-terminal
      forCollection: engagement
      bubbleStatus: delivered
      params:
        {
          sourceCollection: deliverable,
          terminalStatuses: [accepted],
          linkField: engagement,
        }
    - id: engagement-closed
      when: linked-item-terminal
      forCollection: agreement
      bubbleStatus: closed
      params: { sourceCollection: engagement, linkField: agreement }
```

A write occurs: an item in `deliverable` (id `DEL-onboarding-design` linking to
`ENG-acme-q2`) transitions to `accepted`.

Host evaluation:

1. After the AIP-18 write succeeds, the host walks `lifecycle.rules`. Rule
   `deliverables-complete` matches (`params.sourceCollection: deliverable`).
2. Target item: `ENG-acme-q2` (resolved via the deliverable's `engagement`
   field).
3. Source set: every `deliverable` item linking to `ENG-acme-q2` via
   `engagement: ENG-acme-q2`. The host counts: 4 items, all in `accepted`
   status.
4. Predicate `all-items-in-collection-terminal` (narrowed to `accepted`) holds.
5. `bubbleStatus: delivered` is a valid transition from `ENG-acme-q2`'s current
   `in-progress` status (per the engagement collection's `transitionsTo`).
6. Host writes `status: delivered` on `ENG-acme-q2`. Audit log records:
   "lifecycle rule deliverables-complete bubbled delivered onto ENG-acme-q2".
7. The bubble itself is a write on `engagement`; rule `engagement-closed`
   matches (`params.sourceCollection: engagement`). Target item: the agreement
   linked from `ENG-acme-q2.agreement` (say `AGR-acme-msa`).
8. Predicate `linked-item-terminal` requires `ENG-acme-q2` to be terminal.
   `delivered` is not terminal in the engagement state machine (terminal would
   be `closed` or `cancelled`). Predicate does not hold; no bubble.

The chain stops here. Subsequent invoice payments would re-trigger evaluation
and could move the engagement to `invoiced` then `closed`, at which point the
agreement bubble fires.

**8. Contract-required one-way switch HARD refusal.**

Parent (org-level `AGENCY.md`):

```yaml
engagement:
  terms:
    contractRequired: true
```

Child (sub-studio `studios/creative/AGENCY.md`):

```yaml
extends: ../../AGENCY.md
engagement:
  terms:
    contractRequired: false # ATTEMPTS DOWNGRADE
```

Result: refuse with `agency_contract_required_downgrade` (HARD). The sub-studio
cannot accept engagements without an agreement once the parent enabled the
requirement. Author MUST drop the override.

## Error envelope

All errors leave the host as:

```ts
type AgencyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; at?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-21 vocabulary:

| Code                                         | Severity                                                                                                                 | Meaning                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `agency_workspace_invalid`                   | HARD                                                                                                                     | `AGENCY.md` frontmatter fails schema validation.                                                                              |
| `agency_extends_cycle`                       | warn                                                                                                                     | `extends:` chain visits the same manifest twice.                                                                              |
| `agency_extends_missing`                     | warn                                                                                                                     | View's `extends:` points to a non-existent file.                                                                              |
| `agency_extends_depth_exceeded`              | warn                                                                                                                     | Chain depth exceeds eight.                                                                                                    |
| `agency_appliesto_unresolvable`              | HARD                                                                                                                     | View's `appliesTo` references a non-existent consumer.                                                                        |
| `agency_signing_downgrade`                   | HARD                                                                                                                     | Descendant relaxes `governance.signing.required` from true.                                                                   |
| `agency_audit_downgrade`                     | HARD                                                                                                                     | Descendant relaxes `defaults.auditMutations` from true.                                                                       |
| `agency_scope_disable`                       | HARD                                                                                                                     | Descendant disables `scope.containment.enabled` after an ancestor enabled it.                                                 |
| `agency_scope_value_class_drift`             | HARD                                                                                                                     | Descendant changes `scope.applicability.valueClass`.                                                                          |
| `agency_contract_required_downgrade`         | HARD                                                                                                                     | Descendant relaxes `engagement.terms.contractRequired` from true.                                                             |
| `agency_collection_alias_conflict`           | HARD                                                                                                                     | Two collection entries resolve to the same effective name.                                                                    |
| `agency_collection_unresolvable`             | HARD                                                                                                                     | Collection ref does not resolve. Delegates the underlying AIP-18 error code where useful.                                     |
| `agency_collection_disabled_with_items`      | warn                                                                                                                     | Child disables a parent's collection but live items still reference it.                                                       |
| `agency_lifecycle_rule_invalid`              | warn                                                                                                                     | Lifecycle rule bubbles a status the target collection's state machine does not declare as a valid transition. Bubble skipped. |
| `agency_lifecycle_cycle`                     | HARD                                                                                                                     | `lifecycle.rules` graph contains a cycle.                                                                                     |
| `agency_xref_unresolvable`                   | HARD (executor / governance / knowledge / playbook / companies / identity.legalEntity) / warn (work / defaults.workflow) | Cross-AIP ref does not resolve.                                                                                               |
| `agency_containment_violated`                | HARD                                                                                                                     | Item write violates `scope.containment.rules`.                                                                                |
| `agency_applicability_value_class_violation` | HARD                                                                                                                     | Item write carries an applicability ref that fails the declared value class.                                                  |
| `agency_ownership_policy_violated`           | warn                                                                                                                     | Workspace's ownership policy conflicts with a registered collection's ownership setting.                                      |

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signatures

The host exposes the following function signatures:

```ts
// Workspace manifest — root or view.
defineAgencyWorkspace({
  schema: "agency.workspace/v2"
  name: string
  title: string
  description: string
  version: string
  extends?: string                              // relative path to parent AGENCY.md
  appliesTo?: string[]                          // ws:// refs or relative paths
  identity?: {
    legalEntity?: string                        // ws://companies/<slug>
    legalName?: string
    taxId?: string
    jurisdiction?: string                       // ISO 3166-1 alpha-2
    defaultCurrency?: string                    // ISO 4217
  }
  executor?: string                             // ws://operators/<slug>
  governance?: string                           // path or ref
  knowledge?: string                            // ws://wikis/<slug>
  work?: string                                 // ws://workspaces/<slug>
  playbook?: string                             // ws://playbooks/<slug>
  companies?: string                            // ws://companies
  collections?: Array<
    | { inline: AIP18CollectionSchema }
    | { ref: string; alias?: string; version?: string }
  >
  lifecycle?: {
    enabled?: boolean
    rules?: Array<{
      id: string
      when: string                              // recognised predicate id
      forCollection: string
      bubbleStatus: string
      params?: Record<string, unknown>
    }>
  }
  scope?: {
    containment?: { enabled?: boolean; field?: string; rules?: { allowedKinds?: string[]; maxDepth?: number } }
    applicability?: { enabled?: boolean; field?: string; valueClass?: string }
    ownership?: { enabled?: boolean; field?: string; policy?: "strict" | "inherit" | "open" }
  }
  lints?: Array<{
    id: string
    kind:
      | "stale-engagement"
      | "unsigned-agreement"
      | "overdue-invoice"
      | "broken-procedure-ref"
      | "orphan-across-collections"
      | "stale-tree"
      | "broken-parent-ref"
      | "scope-mismatch"
      | "custom"
    severity: "error" | "warn" | "info"
    params?: Record<string, unknown>
  }>
  defaults?: { workflow?: string; approvalClass?: string; auditMutations?: boolean }
  engagement?: {
    terms?: {
      contractRequired?: boolean
      defaultPaymentTerms?: string
      defaultCurrency?: string
    }
  }
  display?: { homePage?: string; defaultGrouping?: "kind" | "status" | "counterparty" | "engagement"; defaultView?: "list" | "board" | "timeline" | "dashboard" }
  metadata?: Record<string, unknown>
}): ResolvedAgencyWorkspace
```

Hosts MAY alias `defineAgencyWorkspace` as `defineAgency`, `registerAgency`. The
canonical name MUST be present.

`defineCollection` and `defineItem` are NOT exposed by AIP-21 — those are
AIP-18's signatures. The boundary between the two AIPs is intentional:
workspace-level concerns flow through `defineAgencyWorkspace`, item-level
concerns flow through AIP-18.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name             | Schema dialect          |
| ----------------------- | ------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineAgencyWorkspace`   | JSON Schema or zod      |
| Python                  | `define_agency_workspace` | JSON Schema or pydantic |
| Go                      | `DefineAgencyWorkspace`   | struct tags             |
| Rust                    | `define_agency_workspace` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the manifest author's language.

## Registration test

A conforming host SHOULD provide a `validate(agencyRoot)` helper that:

1. Checks `AGENCY.md` is present at the agency root and validates against
   [`./AGENCY.schema.json`](./AGENCY.schema.json).
2. Resolves the `extends:` chain (if any), walking warnings.
3. Checks the five one-way switches across the chain (HARD refusals).
4. Validates `appliesTo` resolvability (HARD on misses).
5. For each entry in the merged `collections[]`, resolves and registers via
   [AIP-18](/docs/aip-18); checks for alias collisions (HARD).
6. Validates every cross-AIP ref (`executor`, `governance`, `knowledge`, `work`,
   `playbook`, `companies`, `identity.legalEntity`, `defaults.workflow`).
7. Validates `lifecycle.rules` — `forCollection` registered; `bubbleStatus`
   exists on the target's state machine; cycle-free graph (HARD).
8. Round-trips parse → resolve → register → re-serialise to verify the loader is
   deterministic.
9. Runs the workspace-spanning lints; reports findings as a structured list.
10. Reports the first failure with file + field path.

This is the standard "is this agency conforming?" handshake.

## What this guide does NOT cover

- **Per-doctype validation** — that's [AIP-18](/docs/aip-18)'s ADAPTER. AIP-21
  delegates field-type validation, status state machine enforcement, and
  ownership cardinality checks downstream.
- **Item write semantics** — also AIP-18's. AIP-21 only enforces workspace-level
  invariants (containment rules, applicability value class, ownership policy,
  lifecycle rule evaluation) on the item's surface.
- **Signature semantics on agreements** — that's [AIP-7](/docs/aip-7). AIP-21
  binds governance and enforces the one-way `signing.required` switch; the
  actual signature event format and verification live on AIP-7.
- **Currency arithmetic and tax computation** — runtime concerns. AIP-21
  declares the default currency; the runtime owns the multi-currency math.
- **The host's UI for browsing, editing, or approving items.**
- **Multi-tenant isolation, quotas, billing.**

These stay out of the spec on purpose.

## See also

- [AIP-21 — agentagencies/v2 spec](/docs/aip-21)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this AIP composes
  on
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-8 — agentagencies/v1](/docs/aip-8) — the predecessor (deprecated)
- [AIP-7 — governance, approval, audit](/docs/aip-7) — signing one-way-switch
  convention
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP
- [`./AGENCY.schema.json`](./AGENCY.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests
- [`./skills/author-agency-workspace/SKILL.md`](./skills/author-agency-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/agentagencies-v1-compat/`](./starters/agentagencies-v1-compat) —
  AIP-8 compatibility starter library
