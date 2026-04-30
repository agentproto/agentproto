---
schema: skills/v1
name: author-identity-workspace
title: Author an IDENTITY.md (workspace root or view) for AIP-23
description:
  Walk through writing an identity.workspace/v1 manifest — either the canonical
  root for a new identity or a per-context view (per-operator, per-locale,
  per-persona) that extends a parent — using the defineIdentityWorkspace
  canonical signature, with explicit one-way-switch checks before validation.
version: 1.0.0
tags:
  [
    aip-23,
    identity,
    layered,
    workspace,
    manifest,
    agentproto,
    composition,
    collections,
    layers,
    artifacts,
    temporal,
    confidence,
  ]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a new identity workspace for Acme Corp", "a French-locale view extending
      Acme's identity", "an eng-mentor lens on the existing identity"). The
      skill picks workspace-root vs view based on this and on whether a parent
      IDENTITY.md is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new IDENTITY.md will be written.
      For a workspace root, this is the identity root. For a view, this is the
      consumer's folder (e.g. operators/eng-mentor, locales/fr,
      personas/auditor).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent IDENTITY.md, when authoring a
      view. If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, personas,
      skills). Required when authoring a view that wants `appliesTo` populated;
      omitted for workspace-root mode.
examples:
  - input:
      intent:
        A new identity workspace for Acme Corp with soul, mind, personality,
        emotional-bond, and role-context layers; artifacts at three tiers;
        English locale; temporal entries enabled.
      workspaceDir: /repo/identities/acme
    output:
      - /repo/identities/acme/IDENTITY.md (created, workspace root)
  - input:
      intent:
        A French-locale view extending Acme's identity, narrowing
        artifacts.locales to French only.
      workspaceDir: /repo/identities/acme/locales/fr
      parentManifest: /repo/identities/acme/IDENTITY.md
      appliesTo: [ws://operators/fr-country-lead]
    output:
      - /repo/identities/acme/locales/fr/IDENTITY.md (created, view)
---

# Author an `IDENTITY.md` (workspace root or view) for AIP-23

Use this skill when the user asks to **draft, extend, or revise** an
`identity.workspace/v1` manifest under [AIP-23](/docs/aip-23). The skill
produces a valid manifest (workspace-root or view), with the right
layer-collection declarations, artifact policy, temporal contract, confidence
semantics, junction policy, lint rules, and cross-AIP refs, ready for
`defineIdentityWorkspace` to load.

An `IDENTITY.md` manifest is the machine-readable contract for an
[AIP-23](/docs/aip-23) layered identity — which layer kinds it tracks, how those
layers compose, what compression artifacts the host caches, which entities
(operators, companies, personas, users) may bind layer items, and which
workspace-spanning lints run. The same doctype is used in two modes: a
**workspace root** at the identity root (no `extends:`), and a **view** in any
consumer folder (with `extends:` pointing at a parent). Authoring either is the
same flow, with one branch on step 1.

**Critical:** AIP-23 delegates ALL per-layer-kind concerns (field schemas,
status state machines, ownership cardinality, item-level lints) to
[AIP-18](/docs/aip-18). Do NOT re-specify any of those in `IDENTITY.md` —
declare layer collections, then let AIP-18 own the schemas.

## When to use

- "Set up a new identity workspace — write its `IDENTITY.md` from scratch."
- "Add a per-locale view on the existing identity — write a view that extends
  the parent and switches the artifact locales."
- "The eng mentor needs a layer lens — write a view that surfaces only soul and
  personality layers."
- "Bind an [AIP-7](/docs/aip-7) governance policy and an [AIP-10](/docs/aip-10)
  wiki to this identity."
- "Add temporal-entry tracking to the emotional-bond layer."

## When NOT to use

- The user wants to **author per-layer-kind schemas** (which fields are on the
  personality layer, the status ladder for emotional-bond) — that's
  [AIP-18](/docs/aip-18)'s `author-collection` skill.
- The user wants to **write individual layer items** (a specific operator's soul
  record) — also AIP-18.
- The user wants to **change the AIP-23 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **define the persona doctype** — that's
  [AIP-25](/docs/aip-25). AIP-23 only carries the binding rules.
- The user wants to **edit an existing `IDENTITY.md` in place without
  considering the chain** — read the parent first, run the merge in your head,
  then edit. Skipping the merge produces views that override fields the parent
  already provides correctly, or worse, trip a one-way-switch HARD refusal.

## Process

Follow these steps in order. Composition and one-way switches are the central
mechanics; steps 1-2 set up the right mode, steps 3-11 fill in the body, step 12
validates.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `IDENTITY.md` upstream that this manifest should
  adapt?** If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / persona / skill / locale)? If yes → view (set `appliesTo`); if no →
  workspace root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, set `extends:`, **understand one-way switches**

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `IDENTITY.md`. The host resolves it bottom-up; recursion
is allowed.

```yaml
# Per-locale view at /repo/identities/acme/locales/fr/IDENTITY.md
extends: ../../IDENTITY.md
```

Rules:

- Use POSIX path separators in `extends:` even on Windows.
- Maximum chain depth is eight.
- If the parent is in another tree, prefer factoring the shared bits into a
  small workspace package both can `extends:` locally.

**One-way switches — read the parent FIRST.** Three fields (plus
`binding.verifyExistence`), once set at any ancestor, MUST NOT be relaxed by
descendants. Trying to relax triggers a HARD refusal — the view fails to load.
Before authoring a view, read the parent (and its parent, if any) and identify
which one-way switches are already on:

| Field                     | One-way condition                                                                                  | HARD refusal code               |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `defaults.auditMutations` | If any ancestor is `true`, descendants cannot set `false`.                                         | `identity_audit_downgrade`      |
| `binding.exclusivity`     | If any ancestor is set to a stricter value, descendants cannot replace with a more permissive one. | `identity_binding_loosen`       |
| `binding.verifyExistence` | If any ancestor is `true`, descendants cannot set `false`.                                         | `identity_binding_verify_relax` |
| `layers.versioning`       | If any ancestor is `enabled`, descendants cannot set `disabled`.                                   | `identity_versioning_disable`   |

If the parent has any of these set, do NOT redeclare them on the view as a
relaxation — inherit silently. Narrowing `layers.defaultConfidence` (raising the
floor, e.g. 0.3 → 0.5) is fine. Lowering the confidence floor is allowed by the
schema but the host emits `identity_confidence_floor_lowered` as a warning.

Cycle detection and depth-overflow are runtime warnings, not errors. Do not rely
on the warning — write a correct chain.

### 3. Identity (`name`, `title`, `description`, `version`)

Every manifest, root or view, MUST declare these four fields:

```yaml
schema: identity.workspace/v1
name: acme-org-identity # kebab-case, stable
title: Acme Corp organisation identity # human-readable
description: |
  One-paragraph statement of purpose: what this identity
  captures, who or what it is about.
version: 2.1.0 # semver — bump on shape changes
```

Guidance:

- `name` is the stable identifier; never rename once published.
- `version` is the WORKSPACE shape version. Bump on collection / artifact-tier /
  binding / lint / defaults changes. Independent of any individual layer item's
  version.

### 4. Cross-AIP bindings

```yaml
executor: ws://operators/founder
governance: ../policies/identity-default.yaml
work: ws://workspaces/main-tracker
knowledge: ws://wikis/handbook/KNOWLEDGE.md
```

| Field        | Required    | When to set                                                                                                                 |
| ------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `executor`   | optional    | The operator the identity is _about_ (or activates against).                                                                |
| `governance` | optional    | Set when [AIP-7](/docs/aip-7) approval gates apply. Workspace-root manifests usually set this.                              |
| `work`       | optional    | Set to bind the identity to an [AIP-20](/docs/aip-20) work tracker.                                                         |
| `knowledge`  | optional    | Set when items reference an [AIP-10](/docs/aip-10) wiki by default.                                                         |
| `appliesTo`  | conditional | REQUIRED in view mode (whenever `extends` is set AND the view binds to a consumer). MUST NOT be set in workspace-root mode. |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`identity_appliesto_unresolvable`) — verify the consumer's workspace exists
before declaring the binding. The host also refuses workspaces with unresolvable
`executor`, `governance`, or `knowledge` refs (`identity_xref_unresolvable`,
HARD).

### 5. Layer collections — inline vs ref vs aliased

`collections:` is the bridge to [AIP-18](/docs/aip-18). **Each layer kind is one
AIP-18 collection.** Three forms:

- **Inline.** Full AIP-18 collection.schema/v1 frontmatter embedded in
  `IDENTITY.md`. Useful for small, single-tenant identities.
- **File ref** (`./collections/<layer>/COLLECTION.md`). Useful when the layer
  schema is shared with peer identities.
- **Registry import** (`ws://collections/<slug>`). Useful for third-party or
  org-shared collections.

Aliasing (any ref form):

```yaml
collections:
  - ref: ws://collections/emotional-bond
    alias: bond # workspace-local rename
    version: "1.x" # pin schema range
```

Two collection entries resolving to the same effective name (alias or upstream
`name`) is a HARD failure (`identity_collection_alias_conflict`). Pick aliases
deliberately.

**Picking which layers are first-class.** The decision is domain-specific. Some
heuristics from working implementations:

- **Companion-style identities** (one agent, intimate user relationship): soul,
  voice, emotional-bond. Skip mind / role-context (the agent doesn't operate in
  an org).
- **Operator-fleet identities** (many operators in a company): soul,
  personality, role-context, mind. Skip emotional-bond at the org level (it's
  per-relationship; emerges if needed).
- **Council / mentor overlays**: soul, mind, voice. Skip role-context (the
  persona's authority comes from the identity, not from organisational role).
- **Brand-voice identities**: voice, world. Skip the rest (brand voice is
  communication + worldview).

Starter collections AIP-23 ships in `identitykit-compagnon/`:

- `soul` — values, mission, energy sources.
- `mind` — decision process, principles, mental models.
- `personality` — traits, communication style, strengths.
- `emotional-bond` — trust level, shared moments. TEMPORAL.
- `role-context` — role type, decision domains, delegation.

The merged `collections[]` array is computed across the `extends:` chain via
merge-by-effective-name. Inheriting from the parent is the default; only
redeclare collections you want to override.

When extending an [AIP-18](/docs/aip-18) starter collection with org-specific
fields, write the extended collection inline OR as a sibling file with its own
`extends:` — and then ref the extended file from `IDENTITY.md`. Do NOT mutate
the starter file in place.

### 6. Compression artifact policy

The artifact policy is AIP-23's first distinctive subsystem. It manages
token-budget pressure for prompt assembly.

```yaml
artifacts:
  enabled: true
  tiers:
    - { id: short, maxTokens: 80, strategy: aaak }
    - { id: medium, maxTokens: 300, strategy: bullet-list }
    - { id: full, maxTokens: 1024, strategy: markdown }
  locales: [en, fr]
  refreshPolicy: on-write
```

Guidance:

- **Three tiers (`short / medium / full`)** is the conventional pick from
  working implementations. Tiers MUST be monotonic (each tier's `maxTokens`
  strictly greater than the previous).
- **`strategy`** names the compression algorithm. `aaak` for short (compact
  key-value), `bullet-list` for medium (labelled sections), `markdown` for full
  (headers + bodies). Hosts MAY support additional strategies.
- **`locales`** drives the fan-out: when non-empty, the host generates one
  artifact per (layer, tier, locale) triple. Leave empty if the identity is
  single-locale.
- **`refreshPolicy: on-write`** is the safe default — every layer-item mutation
  regenerates artifacts immediately. Use `scheduled` only when LLM costs matter
  more than freshness; use `manual` only when the identity is locked.
- **Disable artifacts** (`enabled: false`) for tiny identities where the layer
  fits inline in every prompt.

### 7. Temporal layers — when to enable, source vocabulary

Temporal entries are AIP-23's second distinctive subsystem.

```yaml
layers:
  temporal:
    enabled: true
    field: validUntil
    sourceVocabulary: [configured, observed, inferred, self-reported]
```

Guidance:

- **Enable temporal entries** when the workspace has at least one layer that
  evolves over time — typically `emotional-bond` (relationship history),
  `shadow` (observed contradictions), or domain-specific layers like
  `attachment-style` (clinical).
- **Mark layer collections themselves as `temporal: true`** in their AIP-18
  COLLECTION.md frontmatter — the workspace declaration is permissive (allows
  temporal entries) and the per-collection declaration is what actually opts
  each layer in.
- **`sourceVocabulary`** is APPEND-ONLY across ancestors: a child MAY add
  (`clinical-assessment` for a therapy domain) but MUST NOT remove the canonical
  four. Removal triggers `identity_temporal_vocab_removal` (HARD).
- **`field`** is the expiry-bearing field on temporal-entry items; default
  `validUntil`.

The companion temporal-entry collection is conventionally named `temporal-entry`
and lives alongside the layer collections it serves. Its schema fields:

| Field         | Type                           | Required |
| ------------- | ------------------------------ | -------- |
| `parentLayer` | ref                            | YES      |
| `content`     | object                         | YES      |
| `observedAt`  | datetime                       | YES      |
| `intensity`   | number (0..1)                  | YES      |
| `validUntil`  | datetime                       | NO       |
| `source`      | enum (from `sourceVocabulary`) | YES      |

### 8. Confidence semantics — when configured (1.0) vs inferred

Every layer item MUST carry `confidence: 0..1`. Defaults:

```yaml
layers:
  defaultConfidence: 0.3 # workspace floor
```

Authoring guidance:

| Authoring mode                            | confidence value          |
| ----------------------------------------- | ------------------------- |
| Designer wrote this directly              | 1.0                       |
| Explicit user statement extracted         | 0.9                       |
| Clear behavioural signal across exchanges | 0.7                       |
| Single-exchange clear signal              | 0.5                       |
| Weak hint, single mention                 | 0.3                       |
| Speculative                               | <0.3 (SHOULD NOT promote) |

Workspace-level guidance:

- **Companion identities** typically set `defaultConfidence: 0.3` — they accept
  inferred entries from conversation.
- **Brand / regulated identities** typically set `defaultConfidence: 0.7` or
  higher — only well-grounded claims land.
- **Council / mentor identities** typically set `defaultConfidence: 1.0` — only
  configured traits, no inference.

The host emits `identity_layer_confidence_missing` (HARD) for any item that
omits `confidence`, and `identity_confidence_below_floor` (HARD) for items below
the declared floor.

### 9. Junction policy — allowed entities, exclusivity

```yaml
binding:
  allowedEntities: [operator, persona]
  exclusivity: per-entity-and-layer
  verifyExistence: true
```

Guidance on `allowedEntities`:

- **Companion-style** (one user, intimate agent): `[user, persona]`.
- **Operator-fleet** (many operators in an org): `[operator, company]`.
- **Brand voice** (single voice across many bearers): `[brand]` (host-defined)
  or `[company]`.
- **Council overlay**: `[persona]` — the persona binds to the identity layers
  the council operator should adopt.

`exclusivity: per-entity-and-layer` (currently the only defined value) means
**at most one item per (bearer, layer)** — an operator has one soul, one
personality, etc. This is the safe default; do not override unless the spec adds
permissive forms.

`verifyExistence: true` (default) requires the host to confirm the bearer exists
before allowing the binding. Set `false` only in ephemeral / sandbox contexts.
Production identities MUST keep this true.

### 10. Workspace-spanning lints

AIP-18 lints are per-collection. AIP-23 lints span layers:

```yaml
lints:
  - id: missing-soul
    kind: missing-required-layer
    severity: error
    params:
      layers: [soul]
  - id: low-confidence-pinned
    kind: low-confidence-pinned
    severity: warn
    params:
      threshold: 0.5
      collections: [soul, personality]
  - id: stale-bond-90d
    kind: stale-temporal
    severity: warn
    params:
      collections: [bond]
      days: 90
  - id: orphan-layer
    kind: orphan-layer
    severity: error
  - id: unbound-personality
    kind: unbound-layer
    severity: warn
    params:
      collections: [personality]
```

Workspace-spanning lint kinds:

| Kind                     | Purpose                                                                    | `params`                             |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------ |
| `missing-required-layer` | Bearer missing a layer the workspace expects every bearer to have.         | `layers: [...]`                      |
| `low-confidence-pinned`  | Layer item with `confidence < threshold` but referenced (not just stored). | `threshold: <n>; collections: [...]` |
| `stale-temporal`         | Temporal entries older than `days` without a refresh.                      | `collections: [...]; days: <n>`      |
| `orphan-layer`           | Layer item whose bearer no longer exists.                                  | none                                 |
| `unbound-layer`          | Layer item with no bearer set (when bearer is required).                   | `collections: [...]`                 |
| `custom`                 | Host-defined, identified by `id`.                                          | host-defined                         |

Severity guidance:

- `error` — block writes that fail the lint.
- `warn` — surface in the audit log, do not block.
- `info` — surface in tooling only.

### 11. Body prose — purpose, conventions, what NOT to put in identity

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this identity captures and why.

## Layers active

The human-readable rendering of the enabled layers and what each captures.

## Conventions

When to file under `personality` vs `voice`; when to add a temporal entry vs
update the layer directly; how confidence thresholds map to authoring modes.

## What this identity does NOT model

Set boundaries explicitly. Tasks belong on AIP-20. Documents belong on AIP-10.
Ephemeral mood does not belong here.

## When to extend vs replace

Composition guidance for downstream view authors.
```

Keep the body short. The frontmatter is the contract; the body explains the
choices.

### 12. Validate against `IDENTITY.schema.json`; if view, dry-run merge — and **CHECK no one-way switch is relaxed**

Validate the new manifest's frontmatter against
[AIP-23's schema](../../IDENTITY.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-23/draft/IDENTITY.schema.json \
  -d "<workspaceDir>/IDENTITY.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends`.
- `collections[].alias` produces a name collision → rename or remove the alias.
- `artifacts.tiers[]` not strictly increasing in `maxTokens` → reorder or fix.
- `layers.temporal.sourceVocabulary` missing canonical values (configured /
  observed / inferred / self-reported) → add them; the vocabulary is append-only
  across ancestors.
- `binding.allowedEntities` empty → add at least one entity kind.
- `lints[].id` collisions inside one manifest → ids must be unique per manifest.
- `version` not semver → `1.0.0`, not `1` or `v1`.

If view, run the host's resolution algorithm in dry-run mode and **explicitly
check that no one-way switch is relaxed**:

```md
## Merge diff: uk-research-lead (vs parent acme-uk)

Inherited (no change):

- collections: soul, role-context, personality (parent's set)
- artifacts.tiers: short(80), medium(300), full(1024)
- artifacts.locales: [en, fr]
- artifacts.refreshPolicy: on-write
- layers.versioning: enabled (one-way; descendants cannot disable)
- layers.temporal.enabled: true
- layers.temporal.sourceVocabulary: [configured, observed, inferred,
  self-reported]
- binding.exclusivity: per-entity-and-layer (one-way; cannot loosen)
- binding.verifyExistence: true (one-way; cannot disable)
- defaults.auditMutations: true (one-way; cannot disable)
- governance: ../../policies/group-identity-default.yaml
- knowledge: ws://wikis/handbook-uk/KNOWLEDGE.md

Overridden:

- layers.defaultConfidence: 0.3 → 0.5 (RAISING — allowed; stricter floor)
- display.homePage: undefined → SOUL-uk-research-lead
- display.defaultGrouping: undefined → layer

Added:

- lints.research-stale-bond (kind=stale-temporal, severity=warn, days=60)
- appliesTo: [ws://operators/uk-research-lead]

One-way switch check: PASS

- defaults.auditMutations: parent=true, view=undefined → inherits true OK
- binding.exclusivity: parent=per-entity-and-layer, view=undefined → inherits OK
- binding.verifyExistence: parent=true, view=undefined → inherits true OK
- layers.versioning: parent=enabled, view=undefined → inherits enabled OK

Resolution chain: 3 levels (org → acme-uk → uk-research-lead) Warnings: none
```

If the merge diff shows the view RELAXING any one-way switch (e.g.
`auditMutations: true → false`, `versioning: enabled → disabled`,
`exclusivity → permissive`, `verifyExistence: true → false`), the view will be
HARD-refused at load — fix it before declaring success.

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to parent's value via the merge).

## Final checklist

Before declaring done:

- [ ] `schema: identity.workspace/v1` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing `IDENTITY.md`;
      `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] `collections[]` entries have unique effective names (alias or `name`);
      refs resolve; inline frontmatters validate against
      [AIP-18's COLLECTION.schema.json](../../../aip-18/draft/COLLECTION.schema.json).
- [ ] Per-layer-kind concerns (fields, statuses, ownership rules) are NOT in
      `IDENTITY.md` — they live on `COLLECTION.md` files.
- [ ] Every layer collection's items are expected to carry `confidence: 0..1`
      (the host enforces).
- [ ] `artifacts.tiers[]` is strictly increasing in `maxTokens` (monotonic).
- [ ] `artifacts.locales` lists every locale your consumers need; empty for
      single-locale identities.
- [ ] `layers.temporal.enabled` is `true` when at least one layer collection
      declares `temporal: true`.
- [ ] `layers.temporal.sourceVocabulary` includes the four canonical values
      (configured, observed, inferred, self-reported); descendants MAY add but
      MUST NOT remove.
- [ ] `binding.allowedEntities` is set deliberately; never empty.
- [ ] `binding.exclusivity: per-entity-and-layer` (the only defined value).
- [ ] `binding.verifyExistence: true` for production identities (one-way).
- [ ] `lints[]` have unique `id`s within this manifest; severities respect any
      parent governance constraints.
- [ ] `defaults.auditMutations` is set deliberately (one-way).
- [ ] `layers.versioning: enabled` for production identities (one-way).
- [ ] Cross-AIP refs (`executor`, `governance`, `work`, `knowledge`) all
      resolve.
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `IDENTITY.schema.json`.
- [ ] Body is short and prose-only.
- [ ] If view: dry-run merge diff was reviewed; **no one-way switch is
      relaxed**.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf, one path per level.
4. **Effective config summary** — the merged shape, in particular which layer
   collections are active, the artifact policy (tiers, locales, refresh policy),
   the temporal contract, the confidence floor, the binding policy, and which
   one-way switches are now in effect.
5. **Bindings** — `executor`, `governance`, `work`, `knowledge`, `appliesTo` (if
   set), each with a one-line note on what it does.
6. **One-way switch report** — for a view, an explicit per-switch line:
   `auditMutations: parent=<x>, view=<y>, status=PASS|FAIL`;
   `binding.exclusivity: parent=<x>, view=<y>, status=...`;
   `binding.verifyExistence: parent=<x>, view=<y>, status=...`;
   `layers.versioning: parent=<x>, view=<y>, status=...`.
7. **Validation result** — schema clean, dry-run merge clean, warnings (if any).
8. **Open assumptions** — fields you guessed (artifact tier sizes, default
   confidence floor, lint severities) that the user might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation — touch only the file
you are creating.

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18) — substrate this skill
  composes on
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling Workspace AIP
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-22 — agentoffice/v1](/docs/aip-22) — sibling Workspace AIP
- [AIP-24 — ASSEMBLY.md](/docs/aip-24) — assembly / council overlay
  (forthcoming)
- [AIP-25 — agentpersonas/v1](/docs/aip-25) — persona doctype (forthcoming)
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests
- [`../../IDENTITY.schema.json`](../../IDENTITY.schema.json) — frontmatter
  validator
- [`../../starters/identitykit-compagnon/`](../../starters/identitykit-compagnon)
  — starter layer collections
