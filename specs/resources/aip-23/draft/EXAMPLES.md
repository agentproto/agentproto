# EXAMPLES.md — agentidentity/v1 reference patterns

Reference manifests exemplifying common authoring patterns for
[AIP-23](/docs/aip-23). Each example is a self-contained `IDENTITY.md` a host
could load as-is. Manifest authors should copy the closest pattern and edit
fields rather than draft from scratch.

## Patterns covered

1. [Minimal identity workspace — solo agent, one inline `voice` layer](#example-1--minimal-identity-workspace)
2. [Per-operator view — eng-mentor lens narrowing layers and confidence floor](#example-2--per-operator-view)
3. [Multi-layer organisation identity — full pack with temporal + artifacts](#example-3--multi-layer-organisation-identity)
4. [Per-locale view — French translation pack](#example-4--per-locale-view)
5. [Three-level chain — org → company → operator (one-way switches)](#example-5--three-level-chain-with-one-way-switches)

---

## Example 1 — Minimal identity workspace

The smallest legal `IDENTITY.md`: required frontmatter, one inline `voice`
layer, no temporal entries, no artifacts. Useful for a single-agent prototype
that lives next to the code.

````yaml
---
schema: identity.workspace/v1
name: solo-agent
title: Solo agent identity
description: |
  One-agent identity shell. One inline 'voice' layer; no other
  layers; no temporal observation; no artifact generation. Lives
  at the repo root next to the operator manifest.
version: 1.0.0

executor: ws://operators/solo-agent

collections:
  - inline:
      schema: collection.schema/v1
      name: voice
      title: Voice
      description: Communication style, tone, patterns.
      version: 1.0.0
      fields:
        - name: tone
          type: array
          items: { type: string }
        - name: patterns
          type: array
          items: { type: string }
        - name: avoids
          type: array
          items: { type: string }
        - name: languages
          type: array
          items: { type: string }
        - name: confidence
          type: number
          minimum: 0
          maximum: 1
      ownership:
        cardinality: single
        role: bearer
        required: true

binding:
  allowedEntities: [operator]
  exclusivity: per-entity-and-layer
  verifyExistence: true

display:
  defaultGrouping: layer
---

# Solo agent identity

## Purpose

One-agent identity shell. The agent has a `voice` layer (tone,
patterns, languages); no other layers, no temporal observations,
no artifact generation. As the agent matures, the manifest will
gain `personality` and `soul` collections, enable artifact
generation for token-budget management, and bind a governance
policy.

## What this identity does NOT model

- Multi-bearer identity — there is only one operator.
- Temporal layers — irrelevant for a single-agent prototype.
- Artifact compression — the agent is small enough to inline the
  voice layer in every prompt.
- Persona binding — solo agents do not borrow persona frames.

## Examples

A typical voice layer item:

```yaml
---
schema: collection.item/v1
collection: voice
id: VOICE-solo-agent
title: Solo agent voice
status: active
bearer: ws://operators/solo-agent
tone: [direct, warm, no-bullshit]
patterns: ["you bet", "let's ship it"]
avoids: [hedging, corporate-speak]
languages: [en]
confidence: 1.0
---
````

````

**When to use.** Single-agent prototypes, scratch identities,
solo-founder agents. The manifest deliberately skips
artifact generation and temporal layers; nothing to compress,
nothing to observe.

---

## Example 2 — Per-operator view

A view that extends a shared identity workspace, narrows the
visible collections to `soul` and `personality` only (hides
`mind`, `emotional-bond`, `role-context`), raises the confidence
floor to 0.5 to reject weak inferences, and rebinds the executor.

```yaml
---
schema: identity.workspace/v1
name: eng-mentor-view
title: Engineering mentor identity view
description: |
  Engineering mentor's lens on the shared organisation identity.
  Surfaces only the soul and personality layers — emotional-bond
  and role-context are visible through the parent identity but
  not first-class in this lens. Stricter confidence floor to
  reject weak inferences.
version: 1.0.0

extends: ../../IDENTITY.md
appliesTo:
  - ws://operators/eng-mentor

executor: ws://operators/eng-mentor

# Inherit collections from parent, but the view re-declares only
# the two layers central to the eng-mentor's lens. The parent's
# emotional-bond / role-context / mind collections still load via
# the merge — the view's collections list MAY be a SUBSET.
collections:
  - ref: ./collections/soul/COLLECTION.md
  - ref: ./collections/personality/COLLECTION.md

layers:
  defaultConfidence: 0.5    # raise the floor — strict identity standards

lints:
  - id: low-confidence-pinned-warn
    kind: low-confidence-pinned
    severity: warn
    params:
      threshold: 0.7
      collections: [soul, personality]

display:
  defaultGrouping: layer
---

# Engineering mentor identity view

## Purpose

The eng mentor's daily lens on the org identity. Soul + personality
only; emotional-bond and role-context inherited from the parent
but not surfaced as primary in the view.

## When to extend vs replace

Sub-team mentors extending this view should narrow display.homePage
to their own soul item, not redeclare the lints.
````

**When to use.** Whenever an [AIP-9](/docs/aip-9) operator needs a per-operator
lens on a shared identity. The view inherits the workspace's collection schemas,
artifact policy, junction rules, and one-way switches; it adds only what's
specific to the mentor's role.

---

## Example 3 — Multi-layer organisation identity

The full identity workspace: five layer collections (`soul`, `mind`,
`personality`, `emotional-bond`, `role-context`) — three via file ref, one
inline-extends-starter, one registry import; artifact tiers configured at all
three levels with locale fan-out to English and French; temporal layers enabled
with the canonical source vocabulary; bindings to AIP-9 operators; governance +
work

- knowledge cross-AIP refs. This is the kind of identity Example 2's view
  extends.

```yaml
---
schema: identity.workspace/v1
name: acme-org-identity
title: Acme Corp organisation identity
description: |
  Acme Corp's identity workspace. Tracks soul, mind, personality,
  emotional-bond, and role-context layers across all org operators.
  Compression artifacts at three tiers (short / medium / full);
  English and French locales; on-write refresh; temporal entries
  enabled for emotional-bond observations.
version: 2.1.0

executor: ws://operators/founder
governance: ../policies/identity-default.yaml
work: ws://workspaces/main-tracker
knowledge: ws://wikis/handbook/KNOWLEDGE.md

collections:
  # Three starter collections from identitykit-compagnon:
  - ref: ./collections/soul/COLLECTION.md
  - ref: ./collections/mind/COLLECTION.md
  - ref: ./collections/role-context/COLLECTION.md
  # One inline collection extending the starter personality with
  # acme-specific fields:
  - inline:
      schema: collection.schema/v1
      name: personality
      title: Acme personality
      description: |
        Big-Five-flavored personality with Acme-specific traits.
        Adds 'creativity' and 'analytical' bands on top of the
        starter personality collection.
      version: 1.0.0
      extends: ../../starters/identitykit-compagnon/personality/COLLECTION.md
      fields:
        - name: traits
          type: object
          properties:
            creativity: { type: number, minimum: 0, maximum: 10 }
            analytical: { type: number, minimum: 0, maximum: 10 }
            warmth: { type: number, minimum: 0, maximum: 10 }
            precision: { type: number, minimum: 0, maximum: 10 }
            proactivity: { type: number, minimum: 0, maximum: 10 }
        - name: communicationStyle
          type: object
          properties:
            tone: { type: string }
            formality: { type: string }
            verbosity: { type: string }
            humor: { type: string }
        - name: strengths
          type: array
          items: { type: string }
        - name: weaknesses
          type: array
          items: { type: string }
        - name: confidence
          type: number
          minimum: 0
          maximum: 1
      ownership:
        cardinality: single
        role: bearer
        required: true
  # A registry import for cross-org temporal-layered emotional-bond:
  - ref: ws://collections/emotional-bond
    alias: bond
    version: "1.x"

layers:
  defaultConfidence: 0.3
  versioning: enabled         # ONE-WAY SWITCH
  temporal:
    enabled: true
    field: validUntil
    sourceVocabulary: [configured, observed, inferred, self-reported]

artifacts:
  enabled: true
  tiers:
    - { id: short,  maxTokens: 80,    strategy: aaak }
    - { id: medium, maxTokens: 300,   strategy: bullet-list }
    - { id: full,   maxTokens: 1024,  strategy: markdown }
  locales: [en, fr]
  refreshPolicy: on-write

binding:
  allowedEntities: [operator, company]
  exclusivity: per-entity-and-layer
  verifyExistence: true

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

defaults:
  approvalClass: on-mutate
  auditMutations: true                     # ONE-WAY SWITCH

display:
  homePage: SOUL-acme-founder
  defaultGrouping: entity
---

# Acme Corp organisation identity

## Purpose

The identity workspace for Acme Corp's organisation. Captures
soul (values, mission), mind (decision style), personality
(traits, communication), emotional-bond (relationship history),
and role-context (decisions, delegation) layers across all
operators bound to the company.

## Layers active

- **soul** — values, mission, energy sources. Most stable layer.
- **mind** — decision process, principles, mental models.
- **personality** — traits, communication style, strengths.
  Acme extends the starter to add Big-Five trait bands.
- **bond** (emotional-bond) — trust level, shared moments,
  communication preferences. TEMPORAL: observations are tracked
  over time via temporal-entry items.
- **role-context** — role type, decision domains, delegation
  style.

## Conventions

- Every operator has at most one item per layer (the workspace's
  exclusivity rule).
- New observations on bond go in as temporal-entry items, not as
  bond layer mutations. The bond layer's effective state at read
  time is computed from the (non-expired) entries.
- Confidence below 0.3 is refused. Inferred entries from the
  ingestion service start at 0.3-0.7 depending on signal
  strength; explicit configurations land at 1.0.

## What this identity does NOT model

- Per-task task lists — that lives in the work tracker (AIP-20).
- Long-form narrative biographies — that lives in the wiki
  (AIP-10) under the operator's dossier.
- Ephemeral mood — too transient; lives in conversation memory,
  not identity.
- Persona overlays / "act as the auditor" frames — those live in
  AIP-25 personas, which bind to this workspace via the junction
  policy.

## When to extend vs replace

Per-operator and per-locale views SHOULD extend this workspace
and narrow visibility via `appliesTo`. Forking is rarely the
right move — descendants honour the audit, versioning, and
binding-exclusivity invariants automatically.
```

**When to use.** A multi-operator organisation with rich, audited identity.
Mixes ref forms (file + registry + inline-extends-starter), enables artifacts at
three tiers with locale fan-out, declares temporal layers with the canonical
vocabulary, audits all mutations. The canonical organisation identity — every
per-operator view extends from here.

---

## Example 4 — Per-locale view

A view that extends the parent identity for French-speaking consumers: switches
the locale of artifacts to French, narrows `binding.allowedEntities` to
operators only (hides company-level identity from this lens), inherits
everything else.

```yaml
---
schema: identity.workspace/v1
name: acme-fr-identity
title: Acme — French identity view
description: |
  French-locale lens on the Acme organisation identity. Generates
  French-locale artifacts at all three tiers; narrows binding to
  operators only (the company-level identity stays with the parent
  view); inherits all layer collections and the temporal contract.
version: 1.0.0

extends: ../../IDENTITY.md
appliesTo:
  - ws://operators/fr-country-lead
  - ws://operators/fr-design-mentor

# All collections inherit from the parent; no overrides.
# The artifacts pipeline regenerates French-locale artifacts for
# every layer item under this view.

artifacts:
  enabled: true
  # Inherit tiers from parent; just change the active locale set.
  locales: [fr]               # narrowing — only French in this view
  refreshPolicy: on-write

binding:
  allowedEntities: [operator]   # narrowing — no company-level binding here
  exclusivity: per-entity-and-layer    # inherited (one-way; cannot relax)
  verifyExistence: true                # inherited (one-way; cannot relax)

display:
  homePage: SOUL-acme-founder
  defaultGrouping: layer
---

# Acme — French identity view

## Purpose

French-locale lens on the parent organisation identity. The
artifact pipeline generates French translations for every layer
item; consumers under this view see French artifacts at prompt
assembly. The parent's English artifacts remain available
through the parent view.

## Conventions

- Layer items themselves are stored once (in the parent
  workspace's source locale, typically English). Translations
  live as artifacts — they do NOT mutate the source layer.
- A French-speaking operator's prompt assembly walks artifact
  records keyed by `(layerItemId, tier, "fr")`; when a French
  artifact is missing, the host falls back to the source-locale
  artifact with `identity_artifact_locale_fallback` warning.
- The view does not redeclare layers or temporal contracts;
  inheriting cleanly is the entire point.

## What this view does NOT model

- Different layer schemas for French speakers — the schemas
  travel with the parent.
- Persona / company bindings — narrowed out via
  binding.allowedEntities.

## When to extend vs replace

Sub-locale views (e.g. fr-CA, fr-BE) extend this view and add
their own locale variants. The artifact pipeline generates one
artifact per (layer, tier, locale); descendants only need to
add the new locale code to `artifacts.locales`.
```

**When to use.** Multi-locale identity. Each locale gets its own view; the
artifact pipeline regenerates per locale. The view inherits the layer schemas,
the binding rules, and the audit posture; it only narrows what's
locale-specific.

---

## Example 5 — Three-level chain with one-way switches

A three-level composition demonstrating the one-way switches on
`defaults.auditMutations`, `binding.exclusivity`, `binding.verifyExistence`, and
`layers.versioning`. The org sets the switches; the company passes them through
unchanged; the operator-level view CANNOT relax them. Counter-examples show the
HARD refusals.

### Level 1 — Org-level identity

`org/IDENTITY.md`:

```yaml
---
schema: identity.workspace/v1
name: acme-group-identity
title: Acme Group identity
description: |
  Holding-level identity workspace. Sets the audit, versioning,
  and binding-exclusivity one-way switches — descendants cannot
  relax them. Concrete layer collections are added by sub-company
  views.
version: 1.0.0

governance: ../policies/group-identity-default.yaml

collections:
  - ref: ./collections/soul/COLLECTION.md
  - ref: ./collections/role-context/COLLECTION.md

layers:
  defaultConfidence: 0.3
  versioning: enabled                      # ONE-WAY: descendants cannot disable
  temporal:
    enabled: true
    sourceVocabulary: [configured, observed, inferred, self-reported]

artifacts:
  enabled: true
  tiers:
    - { id: short,  maxTokens: 80,    strategy: aaak }
    - { id: medium, maxTokens: 300,   strategy: bullet-list }
    - { id: full,   maxTokens: 1024,  strategy: markdown }
  locales: [en]
  refreshPolicy: on-write

binding:
  allowedEntities: [operator, company]
  exclusivity: per-entity-and-layer        # ONE-WAY: descendants cannot loosen
  verifyExistence: true                    # ONE-WAY: descendants cannot disable

defaults:
  approvalClass: on-mutate
  auditMutations: true                     # ONE-WAY: descendants cannot disable
---

# Acme Group identity

## Purpose

The group's holding-level identity workspace. Every subsidiary
and operator extends this workspace; the audit, versioning,
exclusivity, and verify-existence switches are set here so no
descendant can relax them.

## When to extend vs replace

Always extend. Forking the group root would lose the audit and
binding invariants that compliance tooling relies on.
```

### Level 2 — Subsidiary identity

`companies/acme-uk/IDENTITY.md`:

```yaml
---
schema: identity.workspace/v1
name: acme-uk-identity
title: Acme UK identity
description: |
  Acme's UK subsidiary identity. Inherits the group's audit,
  versioning, and binding switches unchanged; adds a
  personality collection and the UK engineering wiki binding.
version: 1.2.0
extends: ../../org/IDENTITY.md

knowledge: ws://wikis/handbook-uk/KNOWLEDGE.md

collections:
  - ref: ws://collections/personality
    alias: personality

artifacts:
  locales: [en, fr] # widening — locales are merge-by-value (set union)


# All one-way switches inherited unchanged:
# - layers.versioning: enabled (one-way)
# - binding.exclusivity: per-entity-and-layer (one-way)
# - binding.verifyExistence: true (one-way)
# - defaults.auditMutations: true (one-way)
---
# Acme UK identity

## Purpose

Acme's UK subsidiary identity. Adds a personality collection so the UK org can
model trait-band data; adds French to the locale set; everything else inherits
from the group.
```

### Level 3 — Operator view (CORRECT)

`operators/uk-research-lead/IDENTITY.md`:

```yaml
---
schema: identity.workspace/v1
name: uk-research-lead-view
title: UK research lead identity view
description: |
  Research lead's lens on the UK subsidiary identity. Raises the
  confidence floor and adds a stale-temporal lint. Does NOT touch
  the audit, versioning, or binding one-way switches.
version: 1.0.0
extends: ../../companies/acme-uk/IDENTITY.md
appliesTo:
  - ws://operators/uk-research-lead

layers:
  defaultConfidence: 0.5 # NARROWING — allowed (0.5 > 0.3)

lints:
  - id: research-stale-bond
    kind: stale-temporal
    severity: warn
    params:
      collections: [bond]
      days: 60

display:
  homePage: SOUL-uk-research-lead
  defaultGrouping: layer
---
# UK research lead identity view

## Purpose

Research lead's lens. Stricter confidence floor (0.5 — research operators want
only well-grounded identity claims); stricter stale-temporal lint (60 days vs
the parent's 90).
```

The chain validates cleanly. The host computes the merged effective config,
exposes the resolution chain
(`org/IDENTITY.md → companies/acme-uk/IDENTITY.md → operators/uk-research-lead/ IDENTITY.md`),
and registers all three layer collections (`soul`, `role-context`,
`personality`) under their effective names. The view's `defaultConfidence: 0.5`
is honoured (stricter than the group's 0.3); the audit, versioning, and binding
switches all inherit unchanged.

### Level 3 — Operator view (COUNTER-EXAMPLE 1: audit downgrade HARD refusal)

A view that tries to disable the audit log:

```yaml
---
schema: identity.workspace/v1
name: uk-research-lead-broken-audit
title: UK research lead (broken — disables audit)
description: Tries to silence the audit log for this lens.
version: 1.0.0

extends: ../../companies/acme-uk/IDENTITY.md
appliesTo:
  - ws://operators/uk-research-lead

defaults:
  auditMutations: false # ATTEMPTS TO DOWNGRADE
---
```

**Result.** The host walks the resolution chain:

1. `org/IDENTITY.md` sets `defaults.auditMutations: true`.
2. `companies/acme-uk/IDENTITY.md` inherits unchanged.
3. `operators/uk-research-lead-broken-audit/IDENTITY.md` (this view) tries
   `false`.

The host MUST refuse the view with `identity_audit_downgrade` (HARD). The view
does NOT degrade to local-only; it fails to load entirely. The author MUST drop
the `auditMutations: false` override.

### Level 3 — Operator view (COUNTER-EXAMPLE 2: versioning disable HARD refusal)

A view that tries to disable layer versioning:

```yaml
---
schema: identity.workspace/v1
name: uk-research-lead-broken-versioning
title: UK research lead (broken — disables versioning)
description: Tries to suppress layer versioning for this lens.
version: 1.0.0

extends: ../../companies/acme-uk/IDENTITY.md
appliesTo:
  - ws://operators/uk-research-lead

layers:
  versioning: disabled # ATTEMPTS TO DISABLE
---
```

**Result.** The host refuses the view with `identity_versioning_disable` (HARD).
The group's versioning is enabled; descendants cannot turn it off (which would
silently suppress audit-log entries on layer mutations). The author MUST drop
the override.

### Level 3 — Operator view (COUNTER-EXAMPLE 3: binding-verify relax HARD refusal)

A view that tries to skip bearer-existence verification:

```yaml
---
schema: identity.workspace/v1
name: uk-research-lead-broken-verify
title: UK research lead (broken — skips bearer verification)
description: Tries to allow layer items pointing at non-existent operators.
version: 1.0.0

extends: ../../companies/acme-uk/IDENTITY.md
appliesTo:
  - ws://operators/uk-research-lead

binding:
  verifyExistence: false # ATTEMPTS TO RELAX
---
```

**Result.** The host refuses the view with `identity_binding_verify_relax`
(HARD). The group enabled verifyExistence; descendants cannot disable it (which
would allow junction-forgery attacks). The author MUST drop the override.

The same posture applies if the view tries `binding.exclusivity: <permissive>`
(refused with `identity_binding_loosen`).

**When to use.** Three-level (or deeper) compositions where audit, versioning,
or binding invariants must hold across every descendant. The one-way switches
make the resolution chain trustworthy without re-validating every leaf.

---

## See also

- [AIP-23 — agentidentity/v1 spec](/docs/aip-23)
- [AIP-18 — COLLECTION.md / ITEM.md](/docs/aip-18)
- [AIP-22 — agentoffice/v1](/docs/aip-22) — sibling Workspace AIP
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP
- [AIP-25 — agentpersonas/v1](/docs/aip-25) — persona doctype (forthcoming)
- [`./IDENTITY.schema.json`](./IDENTITY.schema.json) — frontmatter validator
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./skills/author-identity-workspace/SKILL.md`](./skills/author-identity-workspace/SKILL.md)
  — agent-side authoring skill
- [`./starters/identitykit-compagnon/`](./starters/identitykit-compagnon) —
  starter layer collections
