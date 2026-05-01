# ADAPTER.md — implementing AIP-22 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and maintain** [AIP-22](/docs/aip-22)
`agentoffice/v1` workspaces. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing
`defineOfficeWorkspace` to manifest authors and routing item-level calls down to
[AIP-18](/docs/aip-18)'s `defineCollection` / `defineItem`. Manifest authors
themselves should read
[`./skills/author-office-workspace/SKILL.md`](./skills/author-office-workspace/SKILL.md),
not this file.

## Contract overview

A conforming host implements **five responsibilities**:

1. **Load the workspace manifest** — read `OFFICE.md` at the company root (or in
   a consumer folder for a view), validate against
   [`./OFFICE.schema.json`](./OFFICE.schema.json), resolve any `extends:` chain,
   expose both the merged effective config and the resolution chain.
2. **Validate workspace-level invariants** — the four one-way switches
   (`defaults.auditMutations`, `governance.signing.required`,
   `orgTree.containment.enabled`, `orgTree.containment.rules.maxDepth`) MUST be
   checked across the resolved chain; violations are HARD refusals.
3. **Resolve `extends:`** — walk the chain bottom-up, merge per the strategy
   table, expose warnings on malformed chains, refuse views with unresolvable
   `appliesTo` bindings.
4. **Register collections** — for each entry in `collections[]`, delegate to
   [AIP-18](/docs/aip-18). Inline → register directly via AIP-18's
   `defineCollection`. Ref (file or registry) → load via AIP-18, register under
   the alias if set. AIP-22 owns workspace-level conflicts (alias collisions);
   AIP-18 owns item-schema conflicts (type drift, status removal).
5. **Enforce the org tree** — at every item write whose collection participates
   in `orgTree.containment.rules.allowedKinds`, check the parent kind against
   the `allowedParentKinds` matrix, the ancestor depth against `maxDepth`, and
   (for items carrying `reportsTo`) the reporting graph for cycles.

The signature `defineOfficeWorkspace` is the boundary between the host and the
manifest author.

## Loading `OFFICE.md`

The workspace manifest is the host's first read on every company load and on
every consumer (operator/skill/division) activation.

### Resolution algorithm

When a host reads a `OFFICE.md`:

1. **Parse the frontmatter** as YAML. Validate against the schema in
   [`./OFFICE.schema.json`](./OFFICE.schema.json). On failure, surface
   `office_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `office_extends_missing` as a
     WARNING (not an error), use the local manifest only, mark the chain as
     broken, and proceed.
   - If the parent has already appeared in the visited set: emit
     `office_extends_cycle` as a WARNING, break the chain at the cycle point,
     use the partial chain, and proceed.
   - If the chain depth would exceed eight: emit
     `company_extends_depth_exceeded` as a WARNING, break the chain at the
     eighth ancestor, use the partial chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below.
5. **Check one-way switches across the resolved chain.** For each one-way switch
   (`defaults.auditMutations`, `governance.signing.required`,
   `orgTree.containment.enabled`, `orgTree.containment.rules.maxDepth`), walk
   the resolution chain and verify no descendant relaxes the ancestor's value.
   If the chain violates an invariant, refuse with the corresponding HARD code
   (`office_audit_downgrade`, `office_signing_downgrade`,
   `office_orgtree_disable`, `office_orgtree_depth_widen`). Unlike chain
   warnings, these are HARD failures: the view is rejected.
6. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `office_appliesto_unresolvable` if any binding fails to resolve.
7. **Register collections** by walking the merged `collections[]` array. See
   [Collection registration](#collection-registration).
8. **Validate cross-AIP refs** — `executor`, `governance`, `work`, `agency`,
   `knowledge`, `playbook`, `defaults.workflow`. Each unresolvable ref surfaces
   `office_xref_unresolvable` (HARD for
   `executor`/`governance`/`work`/`agency`/`knowledge`/`playbook`; warn for
   `defaults.workflow` since the workflow may be intentionally provisioned
   later).

The host MUST NOT execute any code in `OFFICE.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                                                                         | Strategy                      | Notes                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`                                                                     | override                      | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                                     |
| `extends`                                                                                                     | local-only                    | Not inherited.                                                                                                                                                    |
| `appliesTo`                                                                                                   | local-only                    | Not inherited. Each view declares its own scope.                                                                                                                  |
| `identity.legalName` / `legalEntity` / `jurisdiction` / `foundedAt` / `mission` / `defaultCurrency` / `taxId` | leaf-field override           | Each leaf field independently overridable. A division MAY narrow `jurisdiction` while inheriting `mission`.                                                       |
| `executor`, `governance`, `work`, `agency`, `knowledge`, `playbook`                                           | override                      | Child can rebind. Subject to one-way switches and governance gating.                                                                                              |
| `collections`                                                                                                 | merge-by-effective-name       | Effective name = `alias` if set, otherwise the collection's `name`. Child entry with same effective name → child replaces parent's; new effective names appended. |
| `orgTree.containment.enabled`                                                                                 | child wins (one-way)          | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `office_orgtree_disable`.                                                                    |
| `orgTree.containment.field`                                                                                   | override                      |                                                                                                                                                                   |
| `orgTree.containment.rules.allowedKinds`                                                                      | override                      | A child MAY narrow (subset).                                                                                                                                      |
| `orgTree.containment.rules.allowedParentKinds`                                                                | deep-merge by child kind      | Per child-kind override. New child kinds appended.                                                                                                                |
| `orgTree.containment.rules.maxDepth`                                                                          | child wins (one-way on widen) | Child MAY narrow (smaller value); MUST NOT widen. HARD: `office_orgtree_depth_widen`.                                                                             |
| `orgTree.reporting.enabled`                                                                                   | override                      |                                                                                                                                                                   |
| `orgTree.reporting.field`                                                                                     | override                      |                                                                                                                                                                   |
| `orgTree.reporting.cardinality`                                                                               | override                      |                                                                                                                                                                   |
| `orgTree.reporting.rules.*`                                                                                   | leaf-field override           | `mustResolveTo`, `circularBan` each override independently.                                                                                                       |
| `lints`                                                                                                       | merge-by-id                   | Same `id` → child replaces parent's. New ids appended.                                                                                                            |
| `lints[].severity`                                                                                            | child wins                    | Subject to governance: a parent's policy MAY forbid softening below `error`.                                                                                      |
| `defaults.workflow`                                                                                           | override                      |                                                                                                                                                                   |
| `defaults.approvalClass`                                                                                      | override                      |                                                                                                                                                                   |
| `defaults.auditMutations`                                                                                     | child wins (one-way)          | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `office_audit_downgrade`.                                                                    |
| `display.*`                                                                                                   | leaf-field override           | `homePage`, `defaultGrouping`, `defaultView` each override independently.                                                                                         |
| `metadata`                                                                                                    | deep-merge                    | Recursive merge; vendor namespaces accumulate.                                                                                                                    |

## Collection registration

For each entry in the merged `collections[]`, the host MUST:

1. **Compute the effective name.** If `alias:` is set, the effective name is the
   alias. Otherwise the effective name is the collection's own `name` (read from
   the inline frontmatter or from the loaded `COLLECTION.md` for refs).
2. **Detect alias collisions.** If two entries resolve to the same effective
   name across the merged array, refuse with `office_collection_alias_conflict`
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
     `defineCollection`. Surface `office_collection_unresolvable` (delegating to
     AIP-18's `collection_unresolvable` semantics) on missing files.
   - **Registry ref** (`ws://collections/<slug>`): resolve through the host's
     collection registry. Surface `office_collection_unresolvable` if the
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

AIP-22 owns the workspace-level conflicts (alias collisions, ref
unresolvability, version range pinning). AIP-18 owns the item-schema conflicts
(field type drift, status removal, required-field narrowing). The two AIPs do
NOT share a refusal vocabulary; delegate cleanly.

## Org-tree enforcement

The org tree is AIP-22's distinctive subsystem. Where AIP-20 enforces three
orthogonal scope axes flat across collections, AIP-22's centre of gravity is the
_containment matrix_ and the _reporting graph_. The host MUST validate both at
item-write time.

### Containment validation

When validating an item write whose collection name appears in
`orgTree.containment.rules.allowedKinds`:

1. **Parent ref must resolve.** If the item carries a value in
   `orgTree.containment.field` (default `parent`), the ref MUST resolve to an
   existing item. Failures surface as `company_orgtree_broken_parent` (HARD on
   item write).

2. **Parent kind must match the allowed-parent matrix.** Look up the child's
   collection in `allowedParentKinds`. If a list is declared, the parent's
   collection MUST be in that list. Refuse with
   `office_orgtree_invalid_parent_kind` (HARD on item write).

   ```yaml
   # Example matrix:
   orgTree:
     containment:
       rules:
         allowedParentKinds:
           team: [department]
           role: [team, department]
           department: [department]
   ```

   - A `team` whose parent is a `role` → refused.
   - A `role` whose parent is a `policy` → refused (policy is not in
     `allowedKinds`).
   - A `department` whose parent is another `department` → allowed
     (sub-departments).

3. **Ancestor depth must not exceed `maxDepth`.** Walk the parent chain; count
   the ancestors (inclusive of the new item). If the chain would exceed
   `maxDepth`, refuse with `company_orgtree_depth_exceeded` (HARD on item
   write). Do NOT confuse this with `office_orgtree_depth_widen` (which is the
   chain-time refusal for widening the SCHEMA's maxDepth across `extends:`
   ancestors).

4. **Items in collections NOT in `allowedKinds`** MUST NOT carry a containment
   ref. The host SHOULD warn (not refuse) when, for example, a `policy` item
   carries `parent: department/eng` — policies don't live in the tree, but a
   stray ref is recoverable (delete the field).

### Reporting graph validation

When validating an item write whose collection carries a value in
`orgTree.reporting.field` (default `reportsTo`):

1. **Reporting must be enabled.** If `orgTree.reporting.enabled: false`, the
   host SHOULD warn that the field is being ignored.

2. **Target kind must match `mustResolveTo`.** The ref MUST point at an item of
   the declared kind (default `role`). A role reporting to a `team` is refused.

3. **Cycle detection.** Walk the chain `item → reportsTo → ...` accumulating
   visited role ids. If the new write would close a cycle (the new `reportsTo`
   target's chain leads back to the item), refuse with
   `office_orgtree_circular_report` (HARD on item write).

   For `cardinality: multiple` (matrixed), the cycle check expands to a DAG
   walk: BFS from the new write following all `reportsTo` refs; if the original
   item is reachable, refuse.

4. **Warn on missing manager.** If the per-collection schema marks `reportsTo`
   as required but the item omits it, surface the workspace-level
   `missing-manager` lint (severity per the manifest).

The reporting graph and the containment tree are independent. A role's
containment parent (team it sits in) and its reporting parent (manager) MAY be
the same item, MAY be different, MAY be in different departments. The spec
deliberately does not couple them.

### Cycle detection algorithm (reference)

```
function reportingCycleDetect(item, newReportsTo, store):
    visited = {item.id}
    frontier = [newReportsTo]            # ref(s) — single or array
    while frontier is non-empty:
        target = frontier.pop()
        if target in visited: return "cycle"
        visited.add(target)
        next = store.getItem(target).reportsTo  # may be ref, array, or undefined
        if next is undefined: continue
        if next is array: frontier.extend(next)
        else: frontier.append(next)
    return "ok"
```

Hosts SHOULD memoize the chain walk per (item, write-version) to keep batch
writes within a tenant's normal latency budget. The algorithm runs in O(n) on
the depth of the chain; a 10-level hierarchy is at most ten ref lookups.

## Scope axis enforcement

AIP-22 keeps the _containment_ axis as the centre — the three AIP-20 axes are
NOT applied uniformly here. AIP-22 emphasises org structure over scope axes.
Per-collection ownership rules ([AIP-18](/docs/aip-18) `ownership.role`,
`cardinality`, `required`) still apply; the workspace does not override them.
Applicability (who an item is _about_) is not a first-class concept at the
company workspace level — items either participate in the tree (via containment)
or stand outside it (policies, objectives, etc.).

If an organisation needs the AIP-20 three-axis pattern (e.g. for work items the
company tracks), it sets `work: ws://workspaces/<slug>` to bind to an AIP-20
work tracker; the work tracker carries the scope axes for its items.

## Cross-AIP ref resolution

| Ref                                 | AIP                    | Resolver                                                                       |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `ws://operators/<slug>`             | [AIP-9](/docs/aip-9)   | Look up the operator workspace; verify it exists and the host can activate it. |
| `ws://workspaces/<slug>`            | [AIP-20](/docs/aip-20) | Look up the work workspace.                                                    |
| `ws://agencies/<slug>`              | [AIP-21](/docs/aip-21) | Resolve the agency workspace.                                                  |
| `ws://wikis/<slug>(/KNOWLEDGE.md)?` | [AIP-10](/docs/aip-10) | Resolve the wiki workspace.                                                    |
| `ws://playbooks/<slug>`             | [AIP-12](/docs/aip-12) | Resolve the playbook.                                                          |
| `ws://skills/<slug>`                | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                                                    |
| `ws://collections/<slug>`           | [AIP-18](/docs/aip-18) | Resolve through the collection registry.                                       |
| `ws://companies/<slug>`             | AIP-22                 | Resolve through the company registry (used by `identity.legalEntity`).         |
| `governance: <path>`                | [AIP-7](/docs/aip-7)   | Resolve as a relative path to a policy/audit binding.                          |
| `defaults.workflow: <ref>`          | [AIP-15](/docs/aip-15) | Resolve as a path or ws:// to a `WORKFLOW.md`.                                 |
| `extends: <path>`                   | AIP-22                 | Resolve as a relative path to another `OFFICE.md`.                             |
| `collections[].ref`                 | [AIP-18](/docs/aip-18) | Resolve as a path or ws:// to a `COLLECTION.md`.                               |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer (HARD, `office_appliesto_unresolvable`).

`executor`/`governance`/`work`/`agency`/`knowledge`/`playbook` enforcement: a
host MUST refuse a workspace whose binding does not resolve at load time (HARD,
`office_xref_unresolvable`). This is strict-load posture: the company workspace
is the substrate other AIPs build on, and a company with broken cross-AIP refs
cannot meaningfully coordinate.

## View activation

When an [AIP-9](/docs/aip-9) operator (or a divisional / jurisdictional view, or
a [AIP-3](/docs/aip-3) skill) loads, the host SHOULD:

1. Look for a `OFFICE.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above (including the one-way switch
   check across the chain).
3. Pass the merged effective config to the consumer's runtime context: queries
   against the company SHOULD use the view's merged `collections`, `orgTree.*`,
   and `lints`; mutations SHOULD honour `defaults.approvalClass` and
   `defaults.auditMutations`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id so
   reviewers can audit which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`OFFICE.md` directly. Consumers without their own view inherit the company's
default lens.

## Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedCompanyWorkspace = {
  effective: CompanyWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "office.workspace/v1"
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
      | "office_extends_missing"
      | "office_extends_cycle"
      | "company_extends_depth_exceeded"
      | "company_collection_disabled_with_items"
      | "company_orgtree_stray_ref"
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

**1. Identity narrowed by jurisdictional view.**

Parent (`<company-root>/OFFICE.md`):

```yaml
identity:
  legalName: Acme Holdings
  jurisdiction: US
  defaultCurrency: USD
  mission: Build the most useful AI products on the planet.
```

Child (`jurisdictions/de/OFFICE.md`):

```yaml
extends: ../../OFFICE.md
identity:
  legalName: Acme Deutschland GmbH
  jurisdiction: DE
  defaultCurrency: EUR
```

Effective: `legalName` and `jurisdiction` and `defaultCurrency` narrowed;
`mission` inherited unchanged. The host registers the view as a German
subsidiary of the parent entity.

**2. Audit one-way switch HARD refusal.**

Parent:

```yaml
defaults:
  auditMutations: true
```

Child:

```yaml
extends: ../parent/OFFICE.md
defaults:
  auditMutations: false
```

Result: the host refuses the child view with `office_audit_downgrade` (HARD).
The chain is rejected — the view does NOT degrade to local-only. The author MUST
remove `auditMutations: false` from the child to load the view.

**3. Org-tree disable HARD refusal.**

Parent:

```yaml
orgTree:
  containment:
    enabled: true
    field: parent
    rules:
      allowedKinds: [department, team, role]
      maxDepth: 6
```

Child:

```yaml
extends: ../parent/OFFICE.md
orgTree:
  containment:
    enabled: false
```

Result: the host refuses with `office_orgtree_disable` (HARD). Existing items in
`department`, `team`, and `role` collections were filed under the parent's
containment rules; disabling would orphan them. The child MUST drop the
`enabled: false` override.

**4. Org-tree depth widen HARD refusal.**

Parent:

```yaml
orgTree:
  containment:
    rules:
      maxDepth: 4
```

Child:

```yaml
extends: ../parent/OFFICE.md
orgTree:
  containment:
    rules:
      maxDepth: 8 # widening — REFUSED
```

Result: the host refuses with `office_orgtree_depth_widen` (HARD). Once
`maxDepth: 4` is set, descendants may narrow (e.g. `maxDepth: 2`) but never
widen. The child MUST either narrow or omit the override.

**5. Reporting cycle detection.**

Parent declares:

```yaml
orgTree:
  reporting:
    enabled: true
    rules:
      circularBan: true
```

Items already on disk:

```yaml
# items/role/alice.md
id: ROLE-alice
collection: role
reportsTo: ROLE-bob

# items/role/bob.md
id: ROLE-bob
collection: role
reportsTo: ROLE-carol
```

A new write proposes `ROLE-carol.reportsTo: ROLE-alice`. The host runs the
cycle-detection walk: `ROLE-carol → ROLE-alice → ROLE-bob → ROLE-carol`. Cycle
detected. The write is refused with `office_orgtree_circular_report` (HARD).

**6. Invalid parent kind (per-item HARD refusal).**

Parent's containment matrix:

```yaml
orgTree:
  containment:
    rules:
      allowedParentKinds:
        team: [department]
```

A new write proposes `TEAM-frontend.parent: ROLE-cto` (a team's parent is a
role). The host refuses the write with `office_orgtree_invalid_parent_kind`
(HARD).

**7. Cross-AIP ref binding.**

Parent:

```yaml
executor: ws://operators/founder
governance: ../policies/org-default.yaml
work: ws://workspaces/main-tracker
knowledge: ws://wikis/handbook/KNOWLEDGE.md
playbook: ws://playbooks/values
```

Child (jurisdictional view):

```yaml
extends: ../parent/OFFICE.md
governance: ../policies/de-data-protection.yaml # rebind
```

Effective: the child rebinds `governance` only; the four other cross-AIP refs
are inherited untouched. The host MUST verify the new governance ref resolves
before activating the view. If the parent's policy forbids governance rebinding,
the change itself flows through [AIP-7](/docs/aip-7) approval before the
manifest lands on disk.

## Error envelope

All errors leave the host as:

```ts
type CompanyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; at?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-22 vocabulary:

| Code                                     | Severity                                                                                       | Meaning                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `office_workspace_invalid`               | HARD                                                                                           | `OFFICE.md` frontmatter fails schema validation. Returns the failing field path.                                                 |
| `office_extends_cycle`                   | warn                                                                                           | `extends:` chain visits the same manifest twice. Runtime breaks the chain at the cycle point.                                    |
| `office_extends_missing`                 | warn                                                                                           | View's `extends:` points to a non-existent file. Runtime degrades to local-only.                                                 |
| `company_extends_depth_exceeded`         | warn                                                                                           | Chain depth exceeds eight. Runtime breaks at the eighth ancestor.                                                                |
| `office_appliesto_unresolvable`          | HARD                                                                                           | View's `appliesTo` references a consumer (operator/skill) that does not exist. View is refused.                                  |
| `office_audit_downgrade`                 | HARD                                                                                           | Descendant relaxes `defaults.auditMutations` from true to false. View is refused.                                                |
| `office_signing_downgrade`               | HARD                                                                                           | Descendant relaxes `governance.signing.required` from true to false. View is refused.                                            |
| `office_orgtree_disable`                 | HARD                                                                                           | Descendant disables `orgTree.containment.enabled` after an ancestor enabled it. View is refused.                                 |
| `office_orgtree_depth_widen`             | HARD                                                                                           | Descendant widens `orgTree.containment.rules.maxDepth` past an ancestor's value. View is refused.                                |
| `office_orgtree_circular_report`         | HARD (per-item)                                                                                | Item write would close a cycle in the reporting graph. Write is refused.                                                         |
| `office_orgtree_invalid_parent_kind`     | HARD (per-item)                                                                                | Item write's parent kind is not in `allowedParentKinds[child-kind]`. Write is refused.                                           |
| `company_orgtree_broken_parent`          | HARD (per-item)                                                                                | Item write's parent ref does not resolve. Write is refused.                                                                      |
| `company_orgtree_depth_exceeded`         | HARD (per-item)                                                                                | Item write would push the ancestor chain past `maxDepth`. Write is refused.                                                      |
| `company_orgtree_stray_ref`              | warn                                                                                           | Item in a collection NOT in `allowedKinds` carries a containment ref. Lint surfaces; write proceeds.                             |
| `office_collection_alias_conflict`       | HARD                                                                                           | Two collection entries resolve to the same effective name. Workspace is refused.                                                 |
| `office_collection_unresolvable`         | HARD                                                                                           | Collection ref does not resolve (file missing, registry has no entry). Delegates the underlying AIP-18 error code where useful.  |
| `company_collection_disabled_with_items` | warn                                                                                           | Child disables a parent's collection but live items still reference it. Registration proceeds; lint surfaces the orphaned items. |
| `office_xref_unresolvable`               | HARD (executor / governance / work / agency / knowledge / playbook) / warn (defaults.workflow) | Cross-AIP ref does not resolve.                                                                                                  |

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signatures

The host exposes the following function signatures:

```ts
// Workspace manifest — root or view.
defineOfficeWorkspace({
  schema: "office.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                      // relative path to parent OFFICE.md
  appliesTo?: string[]                  // ws:// refs or relative paths
  identity?: {
    legalName?: string
    legalEntity?: string                // ws://companies/<slug>
    jurisdiction?: string               // ISO 3166-1 alpha-2
    foundedAt?: string                  // ISO date
    mission?: string
    defaultCurrency?: string            // ISO 4217
    taxId?: string
  }
  executor?: string                     // ws://operators/<slug>
  governance?: string                   // path or ref
  work?: string                         // ws://workspaces/<slug>
  agency?: string                       // ws://agencies/<slug>
  knowledge?: string                    // ws://wikis/<slug>
  playbook?: string                     // ws://playbooks/<slug>
  collections?: Array<
    | { inline: AIP18CollectionSchema }
    | { ref: string; alias?: string; version?: string }
  >
  orgTree?: {
    containment?: {
      enabled?: boolean
      field?: string
      rules?: {
        allowedKinds?: string[]
        allowedParentKinds?: Record<string, string[]>
        maxDepth?: number
      }
    }
    reporting?: {
      enabled?: boolean
      field?: string
      cardinality?: "single" | "multiple"
      rules?: { mustResolveTo?: string; circularBan?: boolean }
    }
  }
  lints?: Array<{
    id: string
    kind: "orphan-role" | "broken-report" | "missing-manager" | "unassigned-objective" | "stale-objective" | "custom"
    severity: "error" | "warn" | "info"
    params?: Record<string, unknown>
  }>
  defaults?: { workflow?: string; approvalClass?: string; auditMutations?: boolean }
  display?: { homePage?: string; defaultGrouping?: "kind" | "department" | "parent"; defaultView?: "list" | "tree" | "board" }
  metadata?: Record<string, unknown>
}): ResolvedCompanyWorkspace
```

Hosts MAY alias `defineOfficeWorkspace` as `defineCompany`, `registerCompany`,
`defineOrg`. The canonical name MUST be present.

`defineCollection` and `defineItem` are NOT exposed by AIP-22 — those are
AIP-18's signatures. The boundary between the two AIPs is intentional:
workspace-level concerns flow through `defineOfficeWorkspace`, item-level
concerns flow through AIP-18.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name              | Schema dialect          |
| ----------------------- | -------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineOfficeWorkspace`    | JSON Schema or zod      |
| Python                  | `define_company_workspace` | JSON Schema or pydantic |
| Go                      | `DefineCompanyWorkspace`   | struct tags             |
| Rust                    | `define_company_workspace` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the manifest author's language.

## Registration test

A conforming host SHOULD provide a `validate(companyRoot)` helper that:

1. Checks `OFFICE.md` is present at the company root and validates against
   [`./OFFICE.schema.json`](./OFFICE.schema.json).
2. Resolves the `extends:` chain (if any), walking warnings.
3. Checks the four one-way switches across the chain (HARD refusals).
4. Validates `appliesTo` resolvability (HARD on misses).
5. For each entry in the merged `collections[]`, resolves and registers via
   [AIP-18](/docs/aip-18); checks for alias collisions (HARD).
6. Validates every cross-AIP ref (`executor`, `governance`, `work`, `agency`,
   `knowledge`, `playbook`, `defaults.workflow`).
7. Round-trips parse → resolve → register collections → re-serialise to verify
   the loader is deterministic.
8. Walks every existing item in `allowedKinds` collections and re-validates the
   containment matrix and reporting graph against the merged `orgTree` rules.
   Any pre-existing cycle or invalid-parent-kind is surfaced as a structured
   finding.
9. Runs the workspace-spanning lints; reports findings as a structured list.
10. Reports the first failure with file + field path.

This is the standard "is this company conforming?" handshake. The same helper
MAY be re-used to validate a per-context view by passing the consumer's folder
instead of the company root.

## What this guide does NOT cover

- **Per-item-kind validation** — that's [AIP-18](/docs/aip-18)'s ADAPTER. AIP-22
  delegates field-type validation, status state machine enforcement, and
  ownership cardinality checks downstream.
- **Item write semantics** — also AIP-18's. AIP-22 only enforces workspace-level
  invariants (containment matrix, depth cap, reporting cycles) on the item's
  surface.
- **The host's UI for org-chart rendering, employee directories, or HRIS-style
  views.** AIP-22 carries the data; rendering is a runtime concern.
- **Payroll, equity, time-tracking, identity drivers** — runtime concerns far
  outside the spec.
- **Multi-tenant isolation, quotas, billing** — runtime concerns.

These stay out of the spec on purpose.

## See also

- [AIP-22 — agentoffice/v1 spec](/docs/aip-22)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this AIP composes
  on
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — the predecessor (deprecated)
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-21 — agentagencies/v2](/docs/aip-21) — sibling Workspace AIP for
  commercial agencies
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-7 — governance, approval, audit](/docs/aip-7) — one-way-switch convention
- [`./OFFICE.schema.json`](./OFFICE.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests
- [`./skills/author-office-workspace/SKILL.md`](./skills/author-office-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/office-starters/`](./starters/office-starters) — AIP-6
  compatibility starter library
