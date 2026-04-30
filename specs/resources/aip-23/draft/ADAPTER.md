# ADAPTER.md — implementing AIP-23 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and maintain** [AIP-23](/docs/aip-23)
`agentidentity/v1` workspaces. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing
`defineIdentityWorkspace` to manifest authors and routing layer-level calls down
to [AIP-18](/docs/aip-18)'s `defineCollection` / `defineItem`. Manifest authors
themselves should read
[`./skills/author-identity-workspace/SKILL.md`](./skills/author-identity-workspace/SKILL.md),
not this file.

## Contract overview

A conforming host implements **five responsibilities**:

1. **Load the workspace manifest** — read `IDENTITY.md` at the identity root (or
   in a consumer folder for a view), validate against
   [`./IDENTITY.schema.json`](./IDENTITY.schema.json), resolve any `extends:`
   chain, expose both the merged effective config and the resolution chain.
2. **Validate workspace-level invariants** — the three one-way switches
   (`defaults.auditMutations`, `binding.exclusivity`, `layers.versioning`) MUST
   be checked across the resolved chain; violations are HARD refusals. The
   `binding.verifyExistence: true` posture is also one-way on relaxation.
3. **Resolve `extends:`** — walk the chain bottom-up, merge per the strategy
   table, expose warnings on malformed chains, refuse views with unresolvable
   `appliesTo` bindings.
4. **Register layer collections** — for each entry in `collections[]`, delegate
   to [AIP-18](/docs/aip-18). Each layer kind is one AIP-18 collection.
   Layer-specific concerns (the reserved `confidence` field, the optional
   temporal companion) are enforced by the host on top of AIP-18's
   per-collection validation.
5. **Run the artifacts pipeline** — for every layer item write, walk the
   configured tier × locale matrix and generate compression artifacts according
   to `artifacts.refreshPolicy`. On every prompt assembly, walk the tier ladder
   and pick the richest artifact that fits the budget.

The signature `defineIdentityWorkspace` is the boundary between the host and the
manifest author.

## Loading `IDENTITY.md`

The workspace manifest is the host's first read on every identity load and on
every consumer (operator/persona/locale) activation.

### Resolution algorithm

When a host reads an `IDENTITY.md`:

1. **Parse the frontmatter** as YAML. Validate against the schema in
   [`./IDENTITY.schema.json`](./IDENTITY.schema.json). On failure, surface
   `identity_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `identity_extends_missing` as a
     WARNING, use the local manifest only, mark the chain as broken, and
     proceed.
   - If the parent has already appeared in the visited set: emit
     `identity_extends_cycle` as a WARNING, break the chain at the cycle point,
     use the partial chain, and proceed.
   - If the chain depth would exceed eight: emit
     `identity_extends_depth_exceeded` as a WARNING, break the chain at the
     eighth ancestor, use the partial chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below.
5. **Check one-way switches across the resolved chain.** For each one-way switch
   (`defaults.auditMutations`, `binding.exclusivity`, `binding.verifyExistence`,
   `layers.versioning`), walk the resolution chain and verify no descendant
   relaxes the ancestor's value. If the chain violates an invariant, refuse with
   the corresponding HARD code (`identity_audit_downgrade`,
   `identity_binding_loosen`, `identity_binding_verify_relax`,
   `identity_versioning_disable`). These are HARD failures: the view is
   rejected.
6. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `identity_appliesto_unresolvable` if any binding fails to resolve.
7. **Register layer collections** by walking the merged `collections[]` array.
   See [Layer collection registration](#layer-collection-registration).
8. **Validate cross-AIP refs** — `executor`, `governance`, `work`, `knowledge`.
   Each unresolvable ref surfaces `identity_xref_unresolvable` (HARD for
   `executor` / `governance` / `knowledge`; warn for `work`).

The host MUST NOT execute any code in `IDENTITY.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                         | Strategy                        | Notes                                                                                                                                                             |
| --------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`     | override                        | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                                     |
| `extends`                                     | local-only                      | Not inherited.                                                                                                                                                    |
| `appliesTo`                                   | local-only                      | Not inherited. Each view declares its own scope.                                                                                                                  |
| `executor`, `governance`, `work`, `knowledge` | override                        | Child can rebind. Subject to one-way switches and governance gating.                                                                                              |
| `collections`                                 | merge-by-effective-name         | Effective name = `alias` if set, otherwise the collection's `name`. Child entry with same effective name → child replaces parent's; new effective names appended. |
| `layers.defaultConfidence`                    | child wins                      | Child MAY raise the floor (stricter); child SHOULD NOT lower it. Hosts MAY emit `identity_confidence_floor_lowered` as a warning.                                 |
| `layers.versioning`                           | child wins (one-way on disable) | Once `enabled` at any ancestor, child cannot set `disabled`. HARD: `identity_versioning_disable`.                                                                 |
| `layers.temporal.enabled`                     | override                        |                                                                                                                                                                   |
| `layers.temporal.field`                       | override                        |                                                                                                                                                                   |
| `layers.temporal.sourceVocabulary`            | append-only                     | Vocabulary is additive across ancestors; descendants MAY add but MUST NOT remove. Removal attempts surface `identity_temporal_vocab_removal` (HARD).              |
| `artifacts.enabled`                           | override                        |                                                                                                                                                                   |
| `artifacts.tiers`                             | merge-by-id                     | Child tier with same `id` overrides; monotonic ordering re-validated after merge. Non-monotonic merge surfaces `identity_artifacts_tiers_non_monotonic` (HARD).   |
| `artifacts.locales`                           | merge-by-value                  | Set union.                                                                                                                                                        |
| `artifacts.refreshPolicy`                     | override                        |                                                                                                                                                                   |
| `binding.allowedEntities`                     | merge-by-value                  | Set union.                                                                                                                                                        |
| `binding.exclusivity`                         | child wins (one-way on relax)   | A more permissive `exclusivity` cannot replace a stricter one. HARD: `identity_binding_loosen`.                                                                   |
| `binding.verifyExistence`                     | child wins (one-way on disable) | Once `true` at any ancestor, child cannot set `false`. HARD: `identity_binding_verify_relax`.                                                                     |
| `lints`                                       | merge-by-id                     | Same `id` → child replaces parent's. New ids appended.                                                                                                            |
| `lints[].severity`                            | child wins                      | Subject to governance: a parent's policy MAY forbid softening below `error`.                                                                                      |
| `defaults.approvalClass`                      | override                        |                                                                                                                                                                   |
| `defaults.auditMutations`                     | child wins (one-way)            | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `identity_audit_downgrade`.                                                                  |
| `display.*`                                   | leaf-field override             | `homePage`, `defaultGrouping` each override independently.                                                                                                        |
| `metadata`                                    | deep-merge                      | Recursive merge; vendor namespaces accumulate.                                                                                                                    |

## Layer collection registration

For each entry in the merged `collections[]`, the host MUST:

1. **Compute the effective name.** If `alias:` is set, the effective name is the
   alias. Otherwise the effective name is the collection's own `name`.
2. **Detect alias collisions.** If two entries resolve to the same effective
   name across the merged array, refuse with
   `identity_collection_alias_conflict` (HARD).
3. **Delegate to AIP-18.**
   - **Inline**: validate the inline frontmatter against
     [AIP-18's `COLLECTION.schema.json`](../aip-18/draft/COLLECTION.schema.json),
     then call AIP-18's `defineCollection` with the parsed frontmatter.
   - **File ref** (`./path/to/COLLECTION.md`): resolve the path relative to the
     manifest's directory, load the file, validate, then call
     `defineCollection`.
   - **Registry ref** (`ws://collections/<slug>`): resolve through the host's
     collection registry.
   - **Versioned ref** (`{ ref, version: "1.x" }`): pin the schema version
     range. The host MUST refuse a registered collection whose version falls
     outside the range with `collection_item_schema_pinned_drift` (HARD, AIP-18
     vocabulary) at item load time.
4. **Layer-specific concerns** — apply on top of AIP-18:
   - **Reserved `confidence` field.** Every item in this layer collection MUST
     carry `confidence: 0..1`. The host MUST validate this at item-load time
     regardless of whether the AIP-18 collection schema declares the field.
     Missing → `identity_layer_confidence_missing` (HARD per-item).
   - **Confidence-floor enforcement.** If `layers.defaultConfidence` is
     non-zero, items with `confidence` below the floor MUST be refused with
     `identity_confidence_below_floor` (HARD per-item).
   - **Temporal companion.** If the collection's own AIP-18 schema declares
     `temporal: true` (an extension field on the collection), the host MUST
     verify a sibling `temporal-entry`-shaped collection is also registered;
     temporal-entry items reference the parent layer item via `parentLayer`. See
     [Temporal entry handling](#temporal-entry-handling).
5. **Expose collection registration** through the merged effective config: a
   debug surface keyed by effective name returning the collection's resolved
   schema, the resolution chain (collection's own `extends:` chain — separate
   from the workspace's), and the registration source (inline / file /
   registry).

AIP-23 owns the workspace-level conflicts (alias collisions, confidence
enforcement, temporal-companion linkage). AIP-18 owns the item-schema conflicts
(field type drift, status removal, required-field narrowing). The two AIPs do
NOT share a refusal vocabulary; delegate cleanly.

## Compression artifact pipeline

The artifacts pipeline is AIP-23's first distinctive subsystem. The host MUST
run it on every layer item write (when `artifacts.refreshPolicy: on-write`) and
on every prompt assembly that requests an artifact.

### On-write generation

When a layer item is written:

1. **Look up the artifact policy.** Read `artifacts.enabled`, `tiers`,
   `locales`, `refreshPolicy` from the merged effective config.
2. **If `enabled: false`**, skip.
3. **If `refreshPolicy: scheduled` or `manual`**, mark all existing artifacts
   for this layer as STALE; do not regenerate now.
4. **If `refreshPolicy: on-write`**:
   - For each tier in `tiers[]`:
     - For each locale in `locales[]` (or `[null]` if no locales declared):
       - Compute the artifact:
         `compress(layerItem.data, tier.maxTokens, tier.strategy, locale)`
       - Persist as `(layerItemId, tier.id, locale, content)`.
       - Replace any existing artifact for the same
         `(layerItemId, tier.id, locale)` triple.
5. **Audit the generation**. If `defaults.auditMutations: true`, write an
   audit-log entry with fields
   `{ layerItemId, tier.id, locale, generatedAt, generatedBy, inputHash }`.
6. **Surface failures as warnings**, not errors.
   `identity_artifact_generation_failed` is a WARNING — the layer item is still
   considered written, but the artifacts are missing. Subsequent prompt assembly
   walks the tier ladder and may drop the layer if no artifact fits.

### Locale fan-out

When `artifacts.locales` is non-empty, every (layer, tier) combination produces
N artifacts (one per locale). The host SHOULD:

- Generate locale artifacts in parallel.
- Use the host's translation pipeline; the layer item's source locale is
  determined by host policy (defaults to the workspace default).
- Fall back to the source locale's artifact if a locale-specific artifact is
  missing at prompt-assembly time, with `identity_artifact_locale_fallback` as a
  WARNING.

### Eviction policy

On layer-item mutation:

1. Mark all derived artifacts as STALE (do not delete immediately — staleness
   lets the host serve a "best-effort" artifact while regeneration runs).
2. If `refreshPolicy: on-write`, start regeneration immediately.
3. If a stale artifact is read while regeneration is pending, return the stale
   content with `identity_artifact_stale` as a WARNING.

### Prompt-assembly fallback

When the prompt-assembly pipeline calls the host with a budget, the host SHOULD:

1. Sort the layer's artifacts by tier (largest `maxTokens` first).
2. Walk the list; pick the first artifact whose `maxTokens` is ≤ the remaining
   budget.
3. If no artifact fits, emit `identity_layer_dropped_for_budget` (WARNING) and
   skip the layer.

This is exactly the algorithm from the reference implementation's
`assembleCompressed(layers, artifacts, totalBudget, priority)`.

## Temporal entry handling

Temporal entries are AIP-23's second distinctive subsystem. The host MUST link
temporal-entry items to their parent layer item and walk expiry on read.

### Linking entries to parent layers

On every temporal-entry item write:

1. **Verify `parentLayer` resolves.** The temporal-entry's `parentLayer` ref
   MUST point at an existing layer item. Missing → `identity_temporal_orphan`
   (per-entry WARNING; the host MAY refuse the write OR allow it pending
   eventual reconciliation, depending on host policy).
2. **Verify `source` is in the workspace's `layers.temporal.sourceVocabulary`.**
   Mismatched values surface `identity_temporal_source_unknown` (per-entry
   WARNING; the host SHOULD coerce to `inferred` if the source is unknown).
3. **Verify `intensity` is in `[0, 1]`.** Out-of-range values are coerced to the
   nearest bound; the host emits `identity_temporal_intensity_clamped` as a
   warning.
4. **Verify `observedAt` is sane.** Far-future timestamps (beyond +30 days from
   now) and far-past timestamps (beyond the workspace's creation date by some
   host-defined window) surface `identity_temporal_observed_at_implausible`
   (warn).

### Expiry walk

On every read of a temporal-layered item:

1. Query the temporal-entry collection for entries with
   `parentLayer = layerItem.id`.
2. Filter out entries where `validUntil` is non-null AND `validUntil < now()`.
3. Sort the surviving entries by `observedAt` descending.
4. Surface the filtered list to the consumer.

The walk is cheap (an indexed scan); hosts SHOULD cache the result per-request.

### Source vocabulary enforcement

The vocabulary is **append-only across ancestors**. A child's declared
`sourceVocabulary` extends the parent's:

- Adding a new value (e.g. `clinical-assessment`) is allowed.
- Removing a parent value (e.g. dropping `inferred`) is HARD —
  `identity_temporal_vocab_removal`.
- Reordering has no effect (it's a set, not a list).

The default vocabulary is `[configured, observed, inferred, self-reported]`.
Workspaces SHOULD start there and add domain-specific values as needed.

## Confidence enforcement

Every layer item MUST carry `confidence: 0..1`. The host MUST:

1. Reject any item write missing `confidence` with
   `identity_layer_confidence_missing` (HARD per-item).
2. Reject any item write whose `confidence < layers. defaultConfidence` with
   `identity_confidence_below_floor` (HARD per-item).
3. Audit any _increase_ in `confidence` if `defaults.auditMutations: true` — the
   audit-log entry SHOULD include the previous and new values, the source of the
   elevation, and the actor's id.
4. Emit `identity_confidence_elevation_unaudited` as a WARNING if the audit log
   is disabled but a confidence elevation is detected — this is a soft hint that
   the workspace's audit posture is too permissive.

## Junction enforcement

When binding a layer item to a bearer entity:

1. **Verify the bearer's kind is in `binding.allowedEntities`.** Mismatch →
   `identity_binding_kind_disallowed` (HARD).
2. **Verify the bearer entity exists.** When `binding.verifyExistence: true`
   (the default), the host MUST resolve the bearer's workspace and confirm
   presence. Missing → `identity_binding_target_missing` (HARD).
3. **Enforce exclusivity.** When `binding.exclusivity: per-entity-and-layer`,
   the host MUST refuse a write that would create a second item of the same
   layer kind for the same bearer. Conflict →
   `identity_binding_exclusivity_violation` (HARD).
4. **Audit the binding.** When `defaults.auditMutations: true`, write an
   audit-log entry with fields
   `{ layerItemId, bearerKind, bearerId, boundAt, boundBy }`.

## Cross-AIP ref resolution

| Ref                                 | AIP                    | Resolver                                              |
| ----------------------------------- | ---------------------- | ----------------------------------------------------- |
| `ws://operators/<slug>`             | [AIP-9](/docs/aip-9)   | Look up the operator workspace; verify it exists.     |
| `ws://offices/<slug>`               | [AIP-22](/docs/aip-22) | Resolve the office workspace.                         |
| `ws://personas/<slug>`              | [AIP-25](/docs/aip-25) | Resolve the persona doctype.                          |
| `ws://workspaces/<slug>`            | [AIP-20](/docs/aip-20) | Look up the work workspace.                           |
| `ws://wikis/<slug>(/KNOWLEDGE.md)?` | [AIP-10](/docs/aip-10) | Resolve the wiki workspace.                           |
| `ws://skills/<slug>`                | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                           |
| `ws://collections/<slug>`           | [AIP-18](/docs/aip-18) | Resolve through the collection registry.              |
| `governance: <path>`                | [AIP-7](/docs/aip-7)   | Resolve as a relative path to a policy/audit binding. |
| `extends: <path>`                   | AIP-23                 | Resolve as a relative path to another `IDENTITY.md`.  |
| `collections[].ref`                 | [AIP-18](/docs/aip-18) | Resolve as a path or ws:// to a `COLLECTION.md`.      |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer (HARD, `identity_appliesto_unresolvable`).

`executor` / `governance` / `knowledge` enforcement: a host MUST refuse a
workspace whose binding does not resolve at load time (HARD,
`identity_xref_unresolvable`). `work` is a warn — the work workspace may be
intentionally provisioned later.

## View activation

When an [AIP-9](/docs/aip-9) operator (or a per-locale view, or an
[AIP-25](/docs/aip-25) persona, or an [AIP-3](/docs/aip-3) skill) loads, the
host SHOULD:

1. Look for an `IDENTITY.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above (including the one-way switch
   check across the chain).
3. Pass the merged effective config to the consumer's runtime context: prompt
   assembly SHOULD use the view's merged `collections`, `artifacts.tiers`,
   `artifacts.locales`, and `lints`; mutations SHOULD honour
   `defaults.approvalClass` and `defaults.auditMutations`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id so
   reviewers can audit which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`IDENTITY.md` directly.

## Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedIdentityWorkspace = {
  effective: IdentityWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "identity.workspace/v1"
    name: string
    version: string
  }>
  collections: Array<{
    // resolved layer-collection registrations
    effectiveName: string // alias if set, else collection.name
    layerKind: string // collection's own name
    source: "inline" | "file" | "registry"
    sourcePath?: string // for file refs
    sourceUri?: string // for ws:// refs
    versionPin?: string // semver range if set
    temporalCompanion?: string // effective name of the linked temporal-entry collection, if temporal: true
    aip18Resolved: ResolvedCollection // delegated AIP-18 resolution
  }>
  artifacts: {
    // resolved artifact policy
    enabled: boolean
    tiers: Array<{ id: string; maxTokens: number; strategy?: string }>
    locales: string[]
    refreshPolicy: "on-write" | "scheduled" | "manual"
  }
  binding: {
    allowedEntities: string[]
    exclusivity: "per-entity-and-layer"
    verifyExistence: boolean
  }
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "identity_extends_missing"
      | "identity_extends_cycle"
      | "identity_extends_depth_exceeded"
      | "identity_artifact_stale"
      | "identity_artifact_generation_failed"
      | "identity_artifact_locale_fallback"
      | "identity_layer_dropped_for_budget"
      | "identity_temporal_orphan"
      | "identity_temporal_source_unknown"
      | "identity_temporal_intensity_clamped"
      | "identity_temporal_observed_at_implausible"
      | "identity_confidence_floor_lowered"
      | "identity_confidence_elevation_unaudited"
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

**1. Audit one-way switch HARD refusal.**

Parent (`<identity-root>/IDENTITY.md`):

```yaml
defaults:
  auditMutations: true
```

Child (`personas/auditor/IDENTITY.md`):

```yaml
extends: ../../IDENTITY.md
defaults:
  auditMutations: false
```

Result: the host refuses the child view with `identity_audit_downgrade` (HARD).
The chain is rejected — the view does NOT degrade. The author MUST remove
`auditMutations: false` from the child.

**2. Versioning disable HARD refusal.**

Parent:

```yaml
layers:
  versioning: enabled
```

Child:

```yaml
extends: ../../IDENTITY.md
layers:
  versioning: disabled
```

Result: the host refuses with `identity_versioning_disable` (HARD). Once any
ancestor has versioning enabled, no descendant can disable.

**3. Binding loosening HARD refusal.**

Parent:

```yaml
binding:
  exclusivity: per-entity-and-layer
```

Child (an attempted future-defined permissive value):

```yaml
extends: ../../IDENTITY.md
binding:
  exclusivity: unrestricted # hypothetical permissive value
```

Result: the host refuses with `identity_binding_loosen` (HARD). A more
permissive `exclusivity` cannot replace a stricter one. (Currently only
`per-entity-and-layer` is defined; this case becomes relevant when the spec adds
future values.)

**4. Layer-collection alias conflict HARD refusal.**

Workspace:

```yaml
collections:
  - ref: ws://collections/personality
    alias: traits
  - inline:
      schema: collection.schema/v1
      name: traits
      title: Personality traits
      description: Inline duplicate.
      version: 1.0.0
      fields: [...]
```

Result: both entries resolve to the effective name `traits`. The host refuses
with `identity_collection_alias_conflict` (HARD). The workspace MUST rename or
remove one of the entries.

**5. Confidence laundering attempt (per-item HARD refusal).**

A previously-stored item:

```yaml
# items/personality/founder.md
collection: personality
id: PERS-founder
bearer: ws://operators/founder
confidence: 0.4
# ... fields ...
```

A subsequent write proposes:

```yaml
# items/personality/founder.md (new write)
collection: personality
id: PERS-founder
bearer: ws://operators/founder
confidence: 1.0 # ELEVATION FROM 0.4 TO 1.0
```

Result: the elevation is not refused outright (legitimate elevations exist — a
designer reviewing an inferred entry and ratifying it). However, when
`defaults.auditMutations: true`, the host MUST write an audit-log entry
recording the change. Hosts SHOULD additionally route confidence elevations
through [AIP-7](/docs/aip-7) approval if the workspace's
`approvalClass: policy:<ref>` so designates. If audit is disabled and an
elevation is detected, the host emits `identity_confidence_elevation_unaudited`
as a WARNING — soft, not HARD, but the workspace's audit posture is
questionable.

**6. Temporal entry expiry walk.**

Parent:

```yaml
layers:
  temporal:
    enabled: true
    field: validUntil
    sourceVocabulary: [configured, observed, inferred, self-reported]
```

Items on disk:

```yaml
# items/temporal-entry/bond-2025-12-01.md
parentLayer: PERS-bond
content: { trustLevel: 0.5 }
observedAt: 2025-12-01T10:00:00Z
intensity: 0.7
validUntil: 2026-01-01T00:00:00Z   # expired
source: observed

# items/temporal-entry/bond-2026-04-15.md
parentLayer: PERS-bond
content: { trustLevel: 0.8 }
observedAt: 2026-04-15T14:00:00Z
intensity: 0.9
validUntil: null                    # active
source: observed
```

On a read of `PERS-bond` at the current time (2026-04-28), the host's expiry
walk:

1. Queries entries where `parentLayer = PERS-bond`.
2. Filters out the entry with `validUntil: 2026-01-01T00:00:00Z` (in the past).
3. Returns the surviving entry only.

The result is a single active observation; the expired entry remains on disk but
does not contribute to the layer's effective state.

**7. Layer-collection alias conflict via merge.**

Parent:

```yaml
collections:
  - ref: ./collections/personality/COLLECTION.md
    alias: personality
```

Child:

```yaml
extends: ../../IDENTITY.md
collections:
  - ref: ws://collections/big-five-traits
    alias: personality # collides with parent's effective name
```

The merge-by-effective-name rule replaces the parent's entry with the child's
(same effective name). This is NOT a conflict — the child is overriding. But if
the child _also_ declares a second entry with the same alias inside its own
list, that is a HARD failure. The conflict check runs after the merge is
computed; same-name overrides between parent and child are normal merge.

**8. Junction target missing (per-item HARD refusal).**

Workspace:

```yaml
binding:
  allowedEntities: [operator, persona]
  verifyExistence: true
```

A new layer item write:

```yaml
collection: soul
id: SOUL-ghost
bearer: ws://operators/non-existent-operator
# ... fields ...
```

The host walks `binding.verifyExistence: true`, looks up the operator, finds
nothing, refuses the write with `identity_binding_target_missing` (HARD).

## Error envelope

All errors leave the host as:

```ts
type IdentityResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; at?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-23 vocabulary:

| Code                                        | Severity                                               | Meaning                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `identity_workspace_invalid`                | HARD                                                   | `IDENTITY.md` frontmatter fails schema validation.                                                        |
| `identity_extends_cycle`                    | warn                                                   | `extends:` chain visits the same manifest twice.                                                          |
| `identity_extends_missing`                  | warn                                                   | View's `extends:` points to a non-existent file.                                                          |
| `identity_extends_depth_exceeded`           | warn                                                   | Chain depth exceeds eight.                                                                                |
| `identity_appliesto_unresolvable`           | HARD                                                   | View's `appliesTo` references a consumer that does not exist.                                             |
| `identity_audit_downgrade`                  | HARD                                                   | Descendant relaxes `defaults.auditMutations` from true to false.                                          |
| `identity_binding_loosen`                   | HARD                                                   | Descendant relaxes `binding.exclusivity` to a more permissive value.                                      |
| `identity_binding_verify_relax`             | HARD                                                   | Descendant sets `binding.verifyExistence: false` after an ancestor set true.                              |
| `identity_versioning_disable`               | HARD                                                   | Descendant sets `layers.versioning: disabled` after an ancestor enabled.                                  |
| `identity_collection_alias_conflict`        | HARD                                                   | Two layer-collection entries resolve to the same effective name.                                          |
| `identity_collection_unresolvable`          | HARD                                                   | Layer-collection ref does not resolve (file missing, registry has no entry).                              |
| `identity_layer_confidence_missing`         | HARD (per-item)                                        | Layer item write missing the reserved `confidence` field.                                                 |
| `identity_confidence_below_floor`           | HARD (per-item)                                        | Layer item write whose `confidence` is below `layers.defaultConfidence`.                                  |
| `identity_confidence_floor_lowered`         | warn                                                   | Child lowers `layers.defaultConfidence` below ancestor's value.                                           |
| `identity_confidence_elevation_unaudited`   | warn                                                   | A confidence elevation was detected but `defaults.auditMutations` is false.                               |
| `identity_binding_target_missing`           | HARD (per-item)                                        | Bearer entity referenced by a layer item does not resolve.                                                |
| `identity_binding_kind_disallowed`          | HARD (per-item)                                        | Bearer's kind is not in `binding.allowedEntities`.                                                        |
| `identity_binding_exclusivity_violation`    | HARD (per-item)                                        | Layer item write would create a second instance of the same layer for the same bearer.                    |
| `identity_temporal_orphan`                  | warn (per-entry)                                       | Temporal-entry's `parentLayer` does not resolve.                                                          |
| `identity_temporal_source_unknown`          | warn (per-entry)                                       | Temporal-entry's `source` is not in `layers.temporal.sourceVocabulary`. Host SHOULD coerce to `inferred`. |
| `identity_temporal_intensity_clamped`       | warn (per-entry)                                       | Temporal-entry's `intensity` was outside [0, 1]; clamped.                                                 |
| `identity_temporal_observed_at_implausible` | warn (per-entry)                                       | Temporal-entry's `observedAt` is far-future or far-past.                                                  |
| `identity_temporal_vocab_removal`           | HARD                                                   | Descendant removes a value from `layers.temporal.sourceVocabulary`.                                       |
| `identity_artifact_generation_failed`       | warn                                                   | Artifact generation failed for a (layer, tier, locale) triple; layer item is still considered written.    |
| `identity_artifact_stale`                   | warn                                                   | Stale artifact returned while regeneration is pending.                                                    |
| `identity_artifact_locale_fallback`         | warn                                                   | Locale-specific artifact missing; source-locale artifact returned.                                        |
| `identity_artifacts_tiers_non_monotonic`    | HARD                                                   | After merge, `artifacts.tiers[]` is not strictly increasing in `maxTokens`.                               |
| `identity_layer_dropped_for_budget`         | warn                                                   | No artifact tier fits the prompt-assembly budget; layer dropped.                                          |
| `identity_xref_unresolvable`                | HARD (executor / governance / knowledge) / warn (work) | Cross-AIP ref does not resolve.                                                                           |

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signatures

The host exposes the following function signatures:

```ts
// Workspace manifest — root or view.
defineIdentityWorkspace({
  schema: "identity.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                      // relative path to parent IDENTITY.md
  appliesTo?: string[]                  // ws:// refs or relative paths
  executor?: string                     // ws://operators/<slug>
  governance?: string                   // path or ref
  work?: string                         // ws://workspaces/<slug>
  knowledge?: string                    // ws://wikis/<slug>
  collections?: Array<
    | { inline: AIP18CollectionSchema }
    | { ref: string; alias?: string; version?: string }
  >
  layers?: {
    defaultConfidence?: number          // 0..1
    versioning?: "enabled" | "disabled"
    temporal?: {
      enabled?: boolean
      field?: string
      sourceVocabulary?: string[]
    }
  }
  artifacts?: {
    enabled?: boolean
    tiers?: Array<{ id: string; maxTokens: number; strategy?: string }>
    locales?: string[]
    refreshPolicy?: "on-write" | "scheduled" | "manual"
  }
  binding?: {
    allowedEntities?: Array<"operator" | "company" | "persona" | "user" | "skill">
    exclusivity?: "per-entity-and-layer"
    verifyExistence?: boolean
  }
  lints?: Array<{
    id: string
    kind: "orphan-layer" | "low-confidence-pinned" | "stale-temporal" | "unbound-layer" | "missing-required-layer" | "custom"
    severity: "error" | "warn" | "info"
    params?: Record<string, unknown>
  }>
  defaults?: { approvalClass?: string; auditMutations?: boolean }
  display?: { homePage?: string; defaultGrouping?: "layer" | "entity" }
  metadata?: Record<string, unknown>
}): ResolvedIdentityWorkspace
```

Hosts MAY alias `defineIdentityWorkspace` as `defineIdentity`,
`registerIdentity`. The canonical name MUST be present.

`defineCollection` and `defineItem` are NOT exposed by AIP-23 — those are
AIP-18's signatures. The boundary between the two AIPs is intentional:
workspace-level concerns flow through `defineIdentityWorkspace`, item-level
concerns flow through AIP-18.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name               | Schema dialect          |
| ----------------------- | --------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineIdentityWorkspace`   | JSON Schema or zod      |
| Python                  | `define_identity_workspace` | JSON Schema or pydantic |
| Go                      | `DefineIdentityWorkspace`   | struct tags             |
| Rust                    | `define_identity_workspace` | JSON Schema or schemars |

The frontmatter shape is the same across all languages.

## Registration test

A conforming host SHOULD provide a `validate(identityRoot)` helper that:

1. Checks `IDENTITY.md` is present at the identity root and validates against
   [`./IDENTITY.schema.json`](./IDENTITY.schema.json).
2. Resolves the `extends:` chain (if any), walking warnings.
3. Checks the four one-way switches across the chain (HARD refusals).
4. Validates `appliesTo` resolvability (HARD on misses).
5. For each entry in the merged `collections[]`, resolves and registers via
   [AIP-18](/docs/aip-18); checks for alias collisions (HARD); links
   temporal-entry companions where declared.
6. Validates every cross-AIP ref (`executor`, `governance`, `work`,
   `knowledge`).
7. Round-trips parse → resolve → register → re-serialise to verify the loader is
   deterministic.
8. Walks every existing layer item and re-validates the `confidence` field, the
   bearer existence (when `binding.verifyExistence: true`), and the exclusivity
   constraint. Any pre-existing missing-confidence or exclusivity violation is
   surfaced as a structured finding.
9. Walks every existing temporal-entry item and re-validates the `parentLayer`
   ref, the source vocabulary, the intensity range.
10. If `artifacts.enabled: true` and `refreshPolicy: on-write`, generates
    artifacts for every layer item and validates monotonic tier ordering.
11. Runs the workspace-spanning lints; reports findings as a structured list.
12. Reports the first failure with file + field path.

## What this guide does NOT cover

- **Per-layer-item field validation, status state machines, ownership
  cardinality** — that's [AIP-18](/docs/aip-18)'s ADAPTER. AIP-23 delegates the
  per-collection layer schema downstream.
- **Per-trait locking, council overlays, assembly composition** — that's
  [AIP-24](/docs/aip-24) (forthcoming). AIP-23 owns the layered identity
  surface; AIP-24 owns the per-trait immutability and assembly mechanics layered
  on top.
- **The persona doctype itself** — that's [AIP-25](/docs/aip-25) (forthcoming).
  AIP-23 carries the binding rules (`binding.allowedEntities` includes
  `persona`); the persona's own fields and lifecycle live on AIP-25.
- **The host's UI for layer editors, identity dossiers, or audit log
  explorers.** AIP-23 carries the data; rendering is a runtime concern.
- **Long-term storage, backup, retention** — runtime concerns.
- **LLM-side ingestion of confidence-scored signals from conversations** — the
  reference implementation's `IdentityIngestionService` is an example, not a
  normative part of the spec. Hosts MAY reuse it; the spec only requires that
  any signal that lands as a layer item carries the reserved `confidence` field.

These stay out of the spec on purpose.

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this AIP composes
  on
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-22 — agentoffice/v1](/docs/aip-22) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP
- [AIP-7 — governance, approval, audit](/docs/aip-7) — one-way-switch convention
- [AIP-24 — ASSEMBLY.md](/docs/aip-24) — per-trait locking and council overlays
  (forthcoming)
- [AIP-25 — agentpersonas/v1](/docs/aip-25) — persona doctype (forthcoming)
- [`./IDENTITY.schema.json`](./IDENTITY.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests
- [`./skills/author-identity-workspace/SKILL.md`](./skills/author-identity-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/identitykit-compagnon/`](./starters/identitykit-compagnon) — five
  canonical layer collections
