---
schema: skills/v1
name: author-knowledge
title: Author a KNOWLEDGE.md (workspace root or view) for AIP-10
description:
  Walk through writing a knowledge.workspace/v1 manifest — either the canonical
  root for a new wiki or a per-context view that extends a parent manifest —
  using the defineKnowledgeWorkspace canonical signature.
version: 1.0.0
tags: [aip-10, knowledge, workspace, manifest, agentproto, composition]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a new research wiki", "a sales view on the existing wiki", "a
      CFO-assistant lens that extends the finance team view"). The skill picks
      workspace-root vs view based on this and on whether a parent KNOWLEDGE.md
      is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new KNOWLEDGE.md will be written.
      For a workspace root, this is the wiki root. For a view, this is the
      consumer's folder (e.g. operators/research-analyst).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent KNOWLEDGE.md, when authoring a
      view. If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, skills).
      Required when authoring a view that wants `appliesTo` populated; omitted
      for workspace-root mode.
examples:
  - input:
      intent:
        A new shared research wiki, neutral tone, Concept and Person entity
        types.
      workspaceDir: /repo/research-wiki
    output:
      - /repo/research-wiki/KNOWLEDGE.md (created, workspace root)
      - /repo/research-wiki/AGENTS.md (created, prose companion, optional)
  - input:
      intent:
        A research-analyst operator view that scopes to Concept, switches tone
        to academic, and softens max-age lint.
      workspaceDir: /repo/operators/research-analyst
      parentManifest: /repo/research-wiki/KNOWLEDGE.md
      appliesTo: [ws://operators/research-analyst]
    output:
      - /repo/operators/research-analyst/KNOWLEDGE.md (created, view)
---

# Author a `KNOWLEDGE.md` (workspace root or view) for AIP-10

Use this skill when the user asks to **draft, extend, or revise** a
`knowledge.workspace/v1` manifest under [AIP-10](/docs/aip-10). The skill
produces a valid manifest (workspace-root or view), with the right cross-AIP
refs, lint rules, and composition fields, ready for `defineKnowledgeWorkspace`
to load.

A workspace manifest is the machine-readable contract for an
[AIP-10](/docs/aip-10) wiki — entity types, lint rules, retention, curation
policy. The same doctype is used in two modes: a **workspace root** at the wiki
root (no `extends:`), and a **view** in any operator/company/skill folder (with
`extends:` pointing at a parent). Authoring either is the same flow, with one
branch on step 1.

## When to use

- "Set up a new wiki — write its `KNOWLEDGE.md` from scratch."
- "Add a per-operator lens on the existing wiki — write a view that extends the
  workspace."
- "The sales team's view is missing a Deal entity type — extend the team view."
- "Bind an [AIP-7](/docs/aip-7) governance policy to this view."
- "Refactor the workspace: move three lints from the root to a per-team view
  that needs them stricter."

## When NOT to use

- The user wants to **author entries or sources** (the curated layer on top of
  the manifest) — that's the [`curate-wiki`](../curate-wiki/SKILL.md) skill.
- The user wants to **change the AIP-10 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **edit an existing `KNOWLEDGE.md` in place without
  considering the chain** — read the parent first, run the merge in your head,
  then edit. Skipping the merge produces views that override fields the parent
  already provides correctly.

## Process

Follow these steps in order. Composition is the central mechanism; steps 1–2 set
up the right mode, steps 5–8 fill in the body, steps 11–12 validate.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `KNOWLEDGE.md` upstream that this manifest should
  adapt?** If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / skill)? If yes → view (set `appliesTo`); if no → workspace root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. Locate the parent and reference it via `extends:`

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `KNOWLEDGE.md`. The host resolves it bottom-up;
recursion is allowed (the parent may itself have `extends:`).

```yaml
# Operator view at /repo/operators/research-analyst/KNOWLEDGE.md
extends: ../../research-wiki/KNOWLEDGE.md
```

Rules:

- Use POSIX path separators in the `extends:` field even on Windows. Hosts
  normalize before resolving.
- Maximum chain depth is eight. Two-to-three levels is the common case; deeper
  chains usually mean the team needs a refactor.
- If the parent is in another wiki tree, prefer factoring the shared bits into a
  small workspace package both can `extends:` locally — cross-wiki extends works
  mechanically but reviewers can't audit a file they can't reach.

Cycle detection and depth-overflow are runtime warnings, not errors. The host
degrades gracefully to local-only and surfaces `knowledge_extends_cycle` /
`knowledge_extends_depth_exceeded`. Do not rely on the warning — write a correct
chain.

### 3. Identity (`name`, `title`, `description`, `version`)

Every manifest, root or view, declares its identity. These fields are NOT
inherited (each manifest has its own).

```yaml
schema: knowledge.workspace/v1
name: research-analyst-view # kebab-case, stable
title: Research analyst view # human-readable
description: |
  The research-analyst operator's lens on the shared research
  wiki. Concept-focused, academic tone, stricter confidence floor,
  more lenient on historical sources.
version: 1.0.0 # semver of the SHAPE, not content
```

Bump `version` whenever you change `entityTypes`, `lints`, `sources`,
`curation`, or `queryHints`. Patch bumps for cosmetic edits to `description` or
`metadata`.

### 4. Cross-AIP bindings — `curator`, `governance`, `appliesTo`

A view declares its consumers; both views and roots may name a curator and bind
a governance policy.

```yaml
curator: ws://operators/research-analyst
governance: ../policies/research-strict.yaml
appliesTo:
  - ws://operators/research-analyst
```

| Field        | Required    | When to set                                                                                                                                                             |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curator`    | optional    | Set when a specific [AIP-9](/docs/aip-9) operator runs ingest/curation/lint passes. The host activates this operator on workspace load.                                 |
| `governance` | optional    | Set when [AIP-7](/docs/aip-7) approval gates apply. Workspace-root manifests usually set this; views may override only if the parent's policy permits.                  |
| `appliesTo`  | conditional | REQUIRED in view mode (whenever `extends` is set AND the view binds to a consumer). MUST NOT be set in workspace-root mode (the schema rejects roots with `appliesTo`). |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`knowledge_appliesto_unresolvable`) — verify the consumer's workspace exists
before declaring the binding.

### 5. Entity model — declare what types of entries are first-class

`entityTypes` is the most consequential field. It tells the host which `kind`
values entries may carry, and (per type) what canonical fields are expected.

```yaml
entityTypes:
  - name: Concept
    icon: 🧠
    fields: [definition, sources, related]
    description: An abstract idea recurring across reading.
  - name: Person
    icon: 👤
    fields: [name, role, contact, affiliations]
  - name: Investor
    parent: Person # subtype: inherits Person fields
    fields: [fund, lead_partner]
```

Rules:

- `name` is PascalCase. Merge key for composition.
- `fields` is a list of canonical field names; child views append.
- `parent:` declares subtyping against another LOCAL type. Useful when a view
  introduces a specialized type (e.g. `Investor` extends `Person`) without
  rewriting the parent.
- A child view that wants to ADD a field to a parent's type declares the same
  `name` and only the new fields — the host unions the lists.

When authoring a view, only redeclare entity types you are extending or
replacing. Inherited types pass through untouched.

### 6. Lint rules — declare quality gates

Lints run on every maintenance pass. The manifest declares them; the host runs
the algorithm matching `kind`.

```yaml
lints:
  - id: require-source
    kind: require-source
    appliesTo: Concept
    severity: error
  - id: max-age-90
    kind: max-age
    appliesTo: "*"
    severity: warn
    params:
      days: 90
  - id: min-confidence-concept
    kind: min-confidence
    appliesTo: Concept
    severity: warn
    params:
      min: 0.6
```

Lint kinds:

| Kind             | Purpose                                 | `params`     |
| ---------------- | --------------------------------------- | ------------ |
| `require-source` | Entry must have at least one source.    | none         |
| `max-age`        | All sources younger than `params.days`. | `days: <n>`  |
| `min-confidence` | Entry's `confidence` ≥ `params.min`.    | `min: 0..1`  |
| `broken-ref`     | Wikilinks/markdown links resolve.       | none         |
| `orphan`         | Entry has at least one inbound link.    | none         |
| `custom`         | Host-defined, identified by `id`.       | host-defined |

Severity guidance:

- `error` — block writes that fail the lint.
- `warn` — surface in `_log.md`, do not block.
- `info` — surface in tooling only.

Child views may soften severity (warn → info). A parent's `governance:` policy
MAY forbid softening — write the policy deliberately, the host enforces.

### 7. Source policy

```yaml
sources:
  retention: forever # 'forever' | 'days:<n>'
  signing: optional # 'required' | 'optional' | 'none'
  hashAlgo: sha256 # 'sha256' | 'sha512' | 'blake3'
  authorityDefault: secondary # 'primary' | 'secondary' | 'rumour'
```

Each leaf field overrides independently across the chain. If a view only needs
to change `signing`, it declares only `signing` — the rest is inherited.

`signing: required` composes with [AIP-7](/docs/aip-7) signature verification:
every source registered into the wiki MUST carry a valid signature. Use this for
governance-sensitive workspaces (legal, compliance, finance).

### 8. Curation policy

```yaml
curation:
  tone: academic # free-form
  depth: deep # 'shallow' | 'medium' | 'deep'
  autoLink: byName # 'byName' | 'manual' | 'off'
  conflictResolution:
    recency # 'defer' | 'recency' | 'authority'
    # | 'observation-count' | 'keep-both'
  newEntryThreshold: |
    Promote a mention to a full entry when 3+ sources reference it
    OR when an existing entry's body would otherwise grow past 200
    lines on a single subtopic.
```

Tone is free-form — pick a word that the curator agent will interpret
consistently (`neutral`, `academic`, `sales`, `narrative`). The host passes it
to the agent; nothing else.

`conflictResolution` is the key behavioural knob. When sources disagree:

- `defer` — flag both, do not auto-resolve. Audit-friendly.
- `recency` — newer source wins.
- `authority` — `primary` beats `secondary` beats `rumour`.
- `observation-count` — the claim cited by more sources wins.
- `keep-both` — entries store both claims with their citations.

Pick the resolution that matches the wiki's downstream consumers' appetite for
ambiguity. Finance / legal usually wants `keep-both` or `defer`; product
research often wants `recency`.

### 9. Query hints

```yaml
queryHints:
  preferRecent: false
  preferAuthoritative: true
  scopeTo: [Concept]
```

`scopeTo` is the most useful field for views. A research-analyst operator that
doesn't curate Person entries scopes to `[Concept]`; the CFO assistant scopes to
`[Deal]`. The host narrows query defaults accordingly.

`scopeTo` is REPLACED wholesale by a child view if present (it does not union).
Set it consciously.

### 10. Body prose (purpose, conventions)

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this workspace is for, who uses it, what it deliberately excludes.

## Conventions

Naming, style, what to avoid. The body is for humans; runtimes do not parse it.

## When to extend vs replace

For workspace roots: guidance on whether teams should ship a view or fork the
wiki.

## Examples

Short snippets showing what a typical entry looks like under this manifest.
```

Keep the body short — the manifest's frontmatter is the contract; prose explains
the choices behind it. Long prose belongs in `AGENTS.md` (the optional
companion), not in `KNOWLEDGE.md`'s body.

### 11. Validate against `KNOWLEDGE.schema.json`

Validate the new manifest's frontmatter against the workspace `$def` in
[AIP-10's schema](../../KNOWLEDGE.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-10/draft/KNOWLEDGE.schema.json \
  -d "<workspaceDir>/KNOWLEDGE.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends` (a view binding to a
  consumer must extend a parent).
- `entityTypes[].name` not PascalCase → rename.
- `lints[].id` collisions inside one manifest → ids must be unique per manifest;
  merge happens across manifests, not within one.
- `version` not semver → `1.0.0`, not `1` or `v1`.

Fix every error before declaring success.

### 12. If view: dry-run merge against parent, surface diff

For a view, run the host's resolution algorithm in dry-run mode and present the
diff between the parent's effective config and the merged config. The user
reviews:

- Which fields the view OVERRIDES (and is that intentional?).
- Which fields the view INHERITS (anything missing that should override?).
- Which fields the view ADDS (new entity types, new lints).
- Resolution chain length (under eight, no cycles).

Surface the diff in this shape:

```md
## Merge diff: research-analyst-view (vs parent research-wiki)

Inherited (no change):

- entityTypes: Person
- lints: require-source, broken-ref
- sources.\*
- display.defaultGrouping

Overridden:

- curation.tone: neutral → academic
- curation.depth: medium → deep
- queryHints.preferRecent: true → false
- queryHints.scopeTo: (unset) → [Concept]
- lints.max-age-90.severity: warn → info

Added:

- lints.min-confidence-concept (kind=min-confidence, severity=warn)
- appliesTo: [ws://operators/research-analyst]

Resolution chain: 2 levels (research-wiki → research-analyst-view) Warnings:
none
```

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to parent's value via the merge).

## Final checklist

Before declaring done:

- [ ] `schema: knowledge.workspace/v1` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing
      `KNOWLEDGE.md`; `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] `entityTypes` are PascalCase; `parent:` references local types only.
- [ ] `lints` have unique `id`s within this manifest; severities respect any
      parent governance constraints.
- [ ] `sources.*` and `curation.*` use the enum values from the schema (no
      free-form strings where enums apply).
- [ ] `queryHints.scopeTo` only references entity types that exist after the
      merge.
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against `KNOWLEDGE.schema.json`.
- [ ] Body is short and prose-only (no fenced code that the host might mistake
      for a second manifest).
- [ ] If view: dry-run merge diff was reviewed and accepted by the user.
- [ ] If governance binding changed: the change is itself routed through
      [AIP-7](/docs/aip-7) approval before the manifest lands on disk.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf, one path per level.
4. **Effective config summary** — the merged shape, in particular which entity
   types and lints are active for this manifest.
5. **Bindings** — `curator`, `governance`, `appliesTo` (if set), each with a
   one-line note on what it does.
6. **Validation result** — schema clean, dry-run merge clean, warnings (if any).
7. **Open assumptions** — fields you guessed (`tone`, `depth`,
   `authorityDefault`, lint severities) that the user might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation — touch only the file
you are creating.

## See also

- [AIP-10 — agentknowledge/v1 spec](/docs/aip-10)
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide for hosts
  (workspace loading, merge strategy, view activation)
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests (workspace
  root, per-operator view, per-company view, multi- level extends)
- [`../../KNOWLEDGE.schema.json`](../../KNOWLEDGE.schema.json) — frontmatter
  validator
- [`../curate-wiki/SKILL.md`](../curate-wiki/SKILL.md) — sister skill for
  authoring entries and sources on top of a workspace
