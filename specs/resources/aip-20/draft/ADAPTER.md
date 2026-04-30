# ADAPTER.md — implementing AIP-20 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and maintain** [AIP-20](/docs/aip-20)
`agentwork/v2` workspaces. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing
`defineWorkWorkspace` to manifest authors and routing item-level calls down to
[AIP-18](/docs/aip-18)'s `defineCollection` / `defineItem`. Manifest authors
themselves should read
[`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md),
not this file.

## Contract overview

A conforming host implements **five responsibilities**:

1. **Load the workspace manifest** — read `WORK.md` at the work-tree root (or in
   a consumer folder for a view), validate against
   [`./WORK.schema.json`](./WORK.schema.json), resolve any `extends:` chain,
   expose both the merged effective config and the resolution chain.
2. **Validate workspace-level invariants** — the one-way switches
   (`auditMutations`, `scope.containment.enabled`,
   `scope.applicability.valueClass`) MUST be checked across the resolved chain;
   violations are HARD refusals.
3. **Resolve `extends:`** — walk the chain bottom-up, merge per the strategy
   table, expose warnings on malformed chains, refuse views with unresolvable
   `appliesTo` bindings.
4. **Register collections** — for each entry in `collections[]`, delegate to
   [AIP-18](/docs/aip-18). Inline → register directly via AIP-18's
   `defineCollection`. Ref (file or registry) → load via AIP-18, register under
   the alias if set. AIP-20 owns workspace-level conflicts (alias collisions);
   AIP-18 owns item-schema conflicts (type drift, status removal).
5. **Run lints + rollups** — workspace-spanning lints (orphan across
   collections, stale-tree, broken parent ref, scope mismatch) at
   maintenance-pass time; status rollups at parent-item read time (or background
   materialization, when `statusRollup.exposeViaField` is set).

The signature `defineWorkWorkspace` is the boundary between the host and the
manifest author.

## Loading `WORK.md`

The workspace manifest is the host's first read on every workspace load and on
every consumer (operator/company/skill) activation.

### Resolution algorithm

When a host reads a `WORK.md`:

1. **Parse the frontmatter** as YAML. Validate against the schema in
   [`./WORK.schema.json`](./WORK.schema.json). On failure, surface
   `work_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `work_extends_missing` as a WARNING
     (not an error), use the local manifest only, mark the chain as broken, and
     proceed.
   - If the parent has already appeared in the visited set: emit
     `work_extends_cycle` as a WARNING, break the chain at the cycle point, use
     the partial chain, and proceed.
   - If the chain depth would exceed eight: emit `work_extends_depth_exceeded`
     as a WARNING, break the chain at the eighth ancestor, use the partial
     chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below.
5. **Check one-way switches across the resolved chain.** For each one-way switch
   (`defaults.auditMutations`, `scope.containment.enabled`,
   `scope.applicability.valueClass`), walk the resolution chain and verify no
   descendant relaxes the ancestor's value. If the chain violates an invariant,
   refuse with the corresponding HARD code (`work_audit_downgrade`,
   `work_scope_disable`, `work_scope_value_class_drift`). Unlike chain warnings,
   these are HARD failures: the view is rejected.
6. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `work_appliesto_unresolvable` if any binding fails to resolve.
7. **Register collections** by walking the merged `collections[]` array. See
   [Collection registration](#collection-registration).
8. **Validate cross-AIP refs** — `executor`, `governance`, `knowledge`,
   `agency`, `playbook`, `defaults.workflow`. Each unresolvable ref surfaces
   `work_xref_unresolvable` (HARD for
   `executor`/`governance`/`knowledge`/`agency`/`playbook`; warn for
   `defaults.workflow` since the workflow may be intentionally provisioned
   later).

The host MUST NOT execute any code in `WORK.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                       | Strategy                | Notes                                                                                                                                                             |
| ----------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`                   | override                | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                                     |
| `extends`                                                   | local-only              | Not inherited.                                                                                                                                                    |
| `appliesTo`                                                 | local-only              | Not inherited. Each view declares its own scope.                                                                                                                  |
| `executor`, `governance`, `knowledge`, `agency`, `playbook` | override                | Child can rebind. Subject to one-way switches and governance gating.                                                                                              |
| `collections`                                               | merge-by-effective-name | Effective name = `alias` if set, otherwise the collection's `name`. Child entry with same effective name → child replaces parent's; new effective names appended. |
| `scope.containment.enabled`                                 | child wins (one-way)    | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `work_scope_disable`.                                                                        |
| `scope.containment.field` / `rules.*`                       | leaf-field deep-merge   | `allowedKinds`, `maxDepth` each override independently.                                                                                                           |
| `scope.applicability.enabled`                               | override                |                                                                                                                                                                   |
| `scope.applicability.field`                                 | override                |                                                                                                                                                                   |
| `scope.applicability.valueClass`                            | child wins (one-way)    | Once set at any ancestor, descendants MUST NOT change. HARD: `work_scope_value_class_drift`.                                                                      |
| `scope.ownership.*`                                         | leaf-field override     | `policy` may narrow (`open` → `inherit` → `strict`); widening is allowed mechanically but governance MAY forbid it.                                               |
| `statusRollup.enabled`                                      | override                |                                                                                                                                                                   |
| `statusRollup.policy`                                       | merge-by-`when`         | Same `when:` clause → child replaces parent's. New clauses appended.                                                                                              |
| `statusRollup.exposeViaField`                               | override                |                                                                                                                                                                   |
| `lints`                                                     | merge-by-id             | Same `id` → child replaces parent's. New ids appended.                                                                                                            |
| `lints[].severity`                                          | child wins              | Subject to governance: a parent's policy MAY forbid softening below `error`.                                                                                      |
| `defaults.workflow`                                         | override                |                                                                                                                                                                   |
| `defaults.approvalClass`                                    | override                |                                                                                                                                                                   |
| `defaults.auditMutations`                                   | child wins (one-way)    | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `work_audit_downgrade`.                                                                      |
| `display.*`                                                 | leaf-field override     | `homePage`, `defaultGrouping`, `defaultView` each override independently.                                                                                         |
| `metadata`                                                  | deep-merge              | Recursive merge; vendor namespaces accumulate.                                                                                                                    |

## Collection registration

For each entry in the merged `collections[]`, the host MUST:

1. **Compute the effective name.** If `alias:` is set, the effective name is the
   alias. Otherwise the effective name is the collection's own `name` (read from
   the inline frontmatter or from the loaded `COLLECTION.md` for refs).
2. **Detect alias collisions.** If two entries resolve to the same effective
   name across the merged array, refuse with `work_collection_alias_conflict`
   (HARD). The collision check runs AFTER the merge — same-name overrides
   between parent and child are merge-by-effective-name (the child replaces);
   same-name collisions WITHIN one workspace's merged array are conflicts.
3. **Delegate to AIP-18.**
   - **Inline**: validate the inline frontmatter against
     [AIP-18's `COLLECTION.schema.json`](../aip-18/draft/COLLECTION.schema.json),
     then call AIP-18's `defineCollection` with the parsed frontmatter. The host
     registers the collection under the effective name (alias if set).
   - **File ref** (`./path/to/COLLECTION.md`): resolve the path relative to the
     manifest's directory, load the file, validate, then call
     `defineCollection`. Surface `work_collection_unresolvable` (delegating to
     AIP-18's `collection_unresolvable` semantics) on missing files.
   - **Registry ref** (`ws://collections/<slug>`): resolve through the host's
     collection registry. Surface `work_collection_unresolvable` if the registry
     has no entry.
   - **Versioned ref** (`{ ref, version: "1.x" }`): pin the schema version
     range. The host MUST refuse a registered collection whose version falls
     outside the range with `collection_item_schema_pinned_drift` (HARD, AIP-18
     vocabulary) at item load time.
4. **Expose collection registration** through the merged effective config: a
   debug surface keyed by effective name returning the collection's resolved
   schema, the resolution chain (collection's own `extends:` chain — separate
   from the workspace's), and the registration source (inline / file /
   registry).

AIP-20 owns the workspace-level conflicts (alias collisions, ref
unresolvability, version range pinning). AIP-18 owns the item-schema conflicts
(field type drift, status removal, required-field narrowing). The two AIPs do
NOT share a refusal vocabulary; delegate cleanly.

## Scope axis enforcement

The three scope axes (`containment`, `applicability`, `ownership`) are
workspace-level declarations whose enforcement happens at item write time. The
host MUST:

1. **Containment.** When validating an item with a `parent` field (or whatever
   `scope.containment.field` declares), verify:
   - The parent ref resolves to an existing item.
   - If `scope.containment.rules.allowedKinds` is set, the parent's collection
     name is in the list.
   - If `scope.containment.rules.maxDepth` is set, the chain of ancestors is at
     most that deep.

   Failures surface as `work_containment_violated` (HARD on item write).

2. **Applicability.** When validating an item with the applicability field set
   (default `appliesTo`), verify every value resolves under the declared
   `valueClass`:
   - `company` → ref to an AIP-6 company workspace.
   - `role` → ref to an AIP-6 role.
   - `role-and-company` → compound ref `company/<slug>:role/<slug>`.
   - `operator` → ref to an AIP-9 operator.
   - Custom class names → host-defined resolver.

   Failures surface as `work_applicability_value_class_violation`.

3. **Ownership.** When validating an item, the host MUST consult the
   _per-collection_ ownership rules ([AIP-18](/docs/aip-18) `ownership.role`,
   `cardinality`, `required`) FIRST, then apply the workspace-level policy:
   - `policy: strict` — every collection's ownership.required MUST be true. The
     host SHOULD refuse a workspace registration where this invariant fails
     (`work_ownership_policy_violated`).
   - `policy: inherit` — delegate to the per-collection setting.
   - `policy: open` — even collections with `required: true` MAY have items
     without owners (the host downgrades the AIP-18 check to a warning).

**Per-collection field-name override.** A collection MAY declare its own field
name for an axis (e.g. AIP-18 `ownership.role: assignee` instead of `owner`).
The host MUST read the collection's field name in preference to the workspace
default when validating an item of that collection. The workspace's `valueClass`
and `policy` still apply.

## Status rollup

Per-collection statuses live on [AIP-18](/docs/aip-18); the workspace's
`statusRollup.policy` is the _aggregation layer_. The host MUST evaluate the
rollup at parent-item read time (or at background materialization time, when
`exposeViaField` is set).

### Evaluation algorithm

For each parent item read or written:

1. **Collect direct children.** Walk the items registry; collect every item
   whose `parent` ref points to this item. Ignore transitive descendants (rollup
   is one level).
2. **Evaluate each rollup clause** in declaration order:
   - `all-children-terminal` → true if every collected child has a status whose
     collection-level `terminal: true`.
   - `any-child-blocked` → true if at least one child has `status: blocked`
     (literal id, not a categorisation).
   - `any-child-overdue` → true if at least one child has `dueAt` in the past
     and a non-terminal status.
   - `no-children` → true if the collected set is empty.
   - `custom:<id>` → host-defined predicate.
3. **First match wins.** The first clause whose predicate evaluates to true
   contributes its `bubbleParentStatus`. Subsequent clauses are not evaluated
   for this parent.
4. **Validate eligibility.** If the bubbled status id is not declared on the
   parent's collection, surface `work_status_rollup_invalid` as a warning (not
   error) and skip the rollup for this parent. This is intentionally soft —
   non-conforming parents simply keep their stored status.

### Materialization

When `statusRollup.exposeViaField: <fieldName>` is set, the host MAY write the
rolled status to the named field on parent items during a background pass. When
unset, the rolled status is query-time only and never written to disk.

Materialization MUST round-trip cleanly: a re-evaluation at write time produces
the same value the field carries. If the rolled status diverges from the stored
field, surface `work_status_rollup_drift` and prefer the freshly evaluated
value.

## Cross-AIP ref resolution

| Ref                                 | AIP                    | Resolver                                                                       |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `ws://operators/<slug>`             | [AIP-9](/docs/aip-9)   | Look up the operator workspace; verify it exists and the host can activate it. |
| `ws://companies/<slug>`             | [AIP-6](/docs/aip-6)   | Look up the company workspace.                                                 |
| `ws://skills/<slug>`                | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                                                    |
| `ws://wikis/<slug>(/KNOWLEDGE.md)?` | [AIP-10](/docs/aip-10) | Resolve the wiki workspace.                                                    |
| `ws://agencies/<slug>`              | [AIP-8](/docs/aip-8)   | Resolve the agency workspace.                                                  |
| `ws://playbooks/<slug>`             | [AIP-12](/docs/aip-12) | Resolve the playbook.                                                          |
| `ws://collections/<slug>`           | [AIP-18](/docs/aip-18) | Resolve through the collection registry.                                       |
| `governance: <path>`                | [AIP-7](/docs/aip-7)   | Resolve as a relative path to a policy/audit binding.                          |
| `defaults.workflow: <ref>`          | [AIP-15](/docs/aip-15) | Resolve as a path or ws:// to a `WORKFLOW.md`.                                 |
| `extends: <path>`                   | AIP-20                 | Resolve as a relative path to another `WORK.md`.                               |
| `collections[].ref`                 | [AIP-18](/docs/aip-18) | Resolve as a path or ws:// to a `COLLECTION.md`.                               |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer (HARD, `work_appliesto_unresolvable`).

`executor`/`governance`/`knowledge`/`agency`/`playbook` enforcement: a host MUST
refuse a workspace whose binding does not resolve at load time (HARD,
`work_xref_unresolvable`). This is stricter than [AIP-10](/docs/aip-10), which
allows lazy activation for `curator`/`governance`; AIP-20 takes a strict-load
posture because work-tracking is the substrate other AIPs build on, and a
tracker with broken cross-AIP refs cannot meaningfully coordinate.

## View activation

When an [AIP-9](/docs/aip-9) operator (or [AIP-6](/docs/aip-6) company, or
[AIP-3](/docs/aip-3) skill) loads, the host SHOULD:

1. Look for a `WORK.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above (including the one-way switch
   check across the chain).
3. Pass the merged effective config to the consumer's runtime context: queries
   against the tracker SHOULD use the view's merged `collections`, `scope.*`,
   and `lints`; mutations SHOULD honour `defaults.approvalClass` and
   `defaults.auditMutations`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id so
   reviewers can audit which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`WORK.md` directly. Consumers without their own view inherit the tracker's
default lens.

## Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedWorkWorkspace = {
  effective: WorkWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "work.workspace/v2"
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
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "work_extends_missing"
      | "work_extends_cycle"
      | "work_extends_depth_exceeded"
      | "work_status_rollup_invalid"
      | "work_status_rollup_drift"
      | "work_collection_disabled_with_items"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

The merged `effective` is what consumers use; the `chain` is what tooling uses
to explain _where_ a field came from; the `collections` array is the
workspace-to-AIP-18 bridge surface; the `warnings` list is empty on a healthy
load.

## Conflict cases

The following examples illustrate the merge rules and HARD refusals with
concrete parent/child manifests. Each is a minimal pair, not a full manifest.

**1. Collection added by child.**

Parent (`<work-root>/WORK.md`):

```yaml
collections:
  - ref: ./collections/task/COLLECTION.md
```

Child (`operators/eng-lead/WORK.md`):

```yaml
extends: ../../<work-root>/WORK.md
collections:
  - ref: ./collections/task/COLLECTION.md
  - ref: ws://collections/eng-bug
    alias: bug
```

Effective: two collections — `task` (inherited) and `bug` (added by child,
aliased from `eng-bug`). The host registers both under their effective names.

**2. Status rollup override.**

Parent:

```yaml
statusRollup:
  enabled: true
  policy:
    - when: all-children-terminal
      bubbleParentStatus: closed
```

Child:

```yaml
extends: ../parent/WORK.md
statusRollup:
  policy:
    - when: all-children-terminal
      bubbleParentStatus: done # override
    - when: any-child-blocked
      bubbleParentStatus: blocked # add
```

Effective:

```yaml
statusRollup:
  enabled: true
  policy:
    - when: all-children-terminal
      bubbleParentStatus: done # child's override
    - when: any-child-blocked
      bubbleParentStatus: blocked # added
```

**3. Audit one-way switch HARD refusal.**

Parent:

```yaml
defaults:
  auditMutations: true
```

Child:

```yaml
extends: ../parent/WORK.md
defaults:
  auditMutations: false
```

Result: the host refuses the child view with `work_audit_downgrade` (HARD). The
chain is rejected — the view does NOT degrade to local-only. The author MUST
remove `auditMutations: false` from the child to load the view.

**4. Scope value-class drift HARD refusal.**

Parent:

```yaml
scope:
  applicability:
    enabled: true
    field: appliesTo
    valueClass: company
```

Child:

```yaml
extends: ../parent/WORK.md
scope:
  applicability:
    valueClass: role
```

Result: the host refuses with `work_scope_value_class_drift` (HARD). Existing
items wrote `appliesTo` against `company` refs; switching the value class would
invalidate them. The child MUST drop the `valueClass:` override.

**5. Cross-AIP ref binding.**

Parent:

```yaml
executor: ws://operators/eng-lead
governance: ../policies/eng-tracker.yaml
knowledge: ws://wikis/eng/KNOWLEDGE.md
agency: ws://agencies/internal-eng
playbook: ws://playbooks/eng-quarterly
```

Child:

```yaml
extends: ../parent/WORK.md
executor: ws://operators/research-lead # rebind
```

Effective: the child rebinds `executor` only; the four other cross-AIP refs are
inherited untouched. The host MUST verify `ws://operators/research-lead`
resolves before activating the view.

**6. View `appliesTo` enforcement.**

```yaml
extends: ../parent/WORK.md
appliesTo:
  - ws://operators/research-lead
  - ws://operators/this-operator-does-not-exist
```

Result: the host attempts to resolve every ref in `appliesTo`. The second ref
fails to resolve. The host refuses with `work_appliesto_unresolvable` (HARD).
The view does NOT degrade — authors MUST remove the dangling ref before the view
loads.

## Error envelope

All errors leave the host as:

```ts
type WorkResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; at?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-20 vocabulary:

| Code                                       | Severity                                                                                | Meaning                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `work_workspace_invalid`                   | HARD                                                                                    | `WORK.md` frontmatter fails schema validation. Returns the failing field path.                                                          |
| `work_extends_cycle`                       | warn                                                                                    | `extends:` chain visits the same manifest twice. Runtime breaks the chain at the cycle point.                                           |
| `work_extends_missing`                     | warn                                                                                    | View's `extends:` points to a non-existent file. Runtime degrades to local-only.                                                        |
| `work_extends_depth_exceeded`              | warn                                                                                    | Chain depth exceeds eight. Runtime breaks at the eighth ancestor.                                                                       |
| `work_appliesto_unresolvable`              | HARD                                                                                    | View's `appliesTo` references a consumer (operator/company/skill) that does not exist. View is refused.                                 |
| `work_audit_downgrade`                     | HARD                                                                                    | Descendant relaxes `defaults.auditMutations` from true to false. View is refused.                                                       |
| `work_scope_disable`                       | HARD                                                                                    | Descendant disables `scope.containment.enabled` after an ancestor enabled it. View is refused.                                          |
| `work_scope_value_class_drift`             | HARD                                                                                    | Descendant changes `scope.applicability.valueClass` from an ancestor's value. View is refused.                                          |
| `work_collection_alias_conflict`           | HARD                                                                                    | Two collection entries resolve to the same effective name. Workspace is refused.                                                        |
| `work_collection_unresolvable`             | HARD                                                                                    | Collection ref does not resolve (file missing, registry has no entry). Delegates the underlying AIP-18 error code where useful.         |
| `work_collection_disabled_with_items`      | warn                                                                                    | Child disables a parent's collection but live items still reference it. Registration proceeds; lint surfaces the orphaned items.        |
| `work_status_rollup_invalid`               | warn                                                                                    | Rollup policy bubbles a status id not declared on some eligible parent collection. Rollup degrades to no-op for non-conforming parents. |
| `work_status_rollup_drift`                 | warn                                                                                    | Materialized rollup field disagrees with re-evaluation. Host prefers the fresh value.                                                   |
| `work_xref_unresolvable`                   | HARD (executor / governance / knowledge / agency / playbook) / warn (defaults.workflow) | Cross-AIP ref does not resolve.                                                                                                         |
| `work_containment_violated`                | HARD                                                                                    | Item write violates `scope.containment.rules` (allowedKinds, maxDepth).                                                                 |
| `work_applicability_value_class_violation` | HARD                                                                                    | Item write carries an applicability ref that fails the declared value class.                                                            |
| `work_ownership_policy_violated`           | warn                                                                                    | Workspace's ownership policy conflicts with a registered collection's ownership setting.                                                |

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signatures

The host exposes the following function signatures:

```ts
// Workspace manifest — root or view.
defineWorkWorkspace({
  schema: "work.workspace/v2"
  name: string
  title: string
  description: string
  version: string
  extends?: string                      // relative path to parent WORK.md
  appliesTo?: string[]                  // ws:// refs or relative paths
  executor?: string                     // ws://operators/<slug>
  governance?: string                   // path or ref
  knowledge?: string                    // ws://wikis/<slug>
  agency?: string                       // ws://agencies/<slug>
  playbook?: string                     // ws://playbooks/<slug>
  collections?: Array<
    | { inline: AIP18CollectionSchema }
    | { ref: string; alias?: string; version?: string }
  >
  scope?: {
    containment?: { enabled?: boolean; field?: string; rules?: { allowedKinds?: string[]; maxDepth?: number } }
    applicability?: { enabled?: boolean; field?: string; valueClass?: string }
    ownership?: { enabled?: boolean; field?: string; policy?: "strict" | "inherit" | "open" }
  }
  statusRollup?: {
    enabled?: boolean
    policy?: Array<{ when: string; bubbleParentStatus: string }>
    exposeViaField?: string
  }
  lints?: Array<{ id: string; kind: "orphan-across-collections" | "stale-tree" | "broken-parent-ref" | "scope-mismatch" | "custom"; severity: "error" | "warn" | "info"; params?: Record<string, unknown> }>
  defaults?: { workflow?: string; approvalClass?: string; auditMutations?: boolean }
  display?: { homePage?: string; defaultGrouping?: "kind" | "status" | "owner" | "parent"; defaultView?: "list" | "board" | "tree" | "timeline" }
  metadata?: Record<string, unknown>
}): ResolvedWorkWorkspace
```

Hosts MAY alias `defineWorkWorkspace` as `defineWorkspace`, `registerWorkspace`,
`defineWork`. The canonical name MUST be present.

`defineCollection` and `defineItem` are NOT exposed by AIP-20 — those are
AIP-18's signatures. The boundary between the two AIPs is intentional:
workspace-level concerns flow through `defineWorkWorkspace`, item-level concerns
flow through AIP-18.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name           | Schema dialect          |
| ----------------------- | ----------------------- | ----------------------- |
| TypeScript / JavaScript | `defineWorkWorkspace`   | JSON Schema or zod      |
| Python                  | `define_work_workspace` | JSON Schema or pydantic |
| Go                      | `DefineWorkWorkspace`   | struct tags             |
| Rust                    | `define_work_workspace` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the manifest author's language.

## Registration test

A conforming host SHOULD provide a `validate(workRoot)` helper that:

1. Checks `WORK.md` is present at the work root and validates against
   [`./WORK.schema.json`](./WORK.schema.json).
2. Resolves the `extends:` chain (if any), walking warnings.
3. Checks the one-way switches across the chain (HARD refusals).
4. Validates `appliesTo` resolvability (HARD on misses).
5. For each entry in the merged `collections[]`, resolves and registers via
   [AIP-18](/docs/aip-18); checks for alias collisions (HARD).
6. Validates every cross-AIP ref (`executor`, `governance`, `knowledge`,
   `agency`, `playbook`, `defaults.workflow`).
7. Round-trips parse → resolve → register collections → re-serialise to verify
   the loader is deterministic.
8. Runs the workspace-spanning lints; reports findings as a structured list.
9. Reports the first failure with file + field path.

This is the standard "is this workspace conforming?" handshake. The same helper
MAY be re-used to validate a per-context view by passing the consumer's folder
instead of the work root.

## What this guide does NOT cover

- **Per-item-kind validation** — that's [AIP-18](/docs/aip-18)'s ADAPTER. AIP-20
  delegates field-type validation, status state machine enforcement, and
  ownership cardinality checks downstream.
- **Item write semantics** — also AIP-18's. AIP-20 only enforces workspace-level
  invariants (containment rules, applicability value class, ownership policy) on
  the item's surface.
- **The host's retrieval strategy** (BM25, embeddings, graph). AIP-20 explicitly
  leaves this to runtime policy.
- **The host's UI for browsing, editing, or approving items.**
- **Multi-tenant isolation, quotas, billing** — runtime concerns.

These stay out of the spec on purpose.

## See also

- [AIP-20 — agentwork/v2 spec](/docs/aip-20)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this AIP composes
  on
- [AIP-13 — agentwork/v1](/docs/aip-13) — the predecessor (deprecated)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-7 — governance, approval, audit](/docs/aip-7) — one-way-switch convention
- [`./WORK.schema.json`](./WORK.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/agentwork-v1-compat/`](./starters/agentwork-v1-compat) — AIP-13
  compatibility starter library
