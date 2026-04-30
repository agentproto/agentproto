# ADAPTER.md — implementing AIP-10 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and maintain** [AIP-10](/docs/aip-10)
`agentknowledge/v1` wikis. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a wiki-runtime author — someone exposing `defineEntry` and
`defineSource` to curation agents. Curation agents themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements six responsibilities:

1. **Load the workspace manifest** — read `KNOWLEDGE.md` at the wiki root,
   validate against [`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json),
   resolve any `extends:` chain, expose both the merged effective config and the
   resolution chain. Optionally also read the prose companion `AGENTS.md` for
   human-display purposes.
2. **Index the sources** — walk `sources/`, compute a content hash per file
   (using the algorithm from `sources.hashAlgo` in the manifest, default
   `sha256`), populate the source registry. Refuse to mutate any source file
   from this point forward.
3. **Load the entries** — read every `.md` under `entries/`, validate
   frontmatter against [`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json),
   build the in-memory entry graph.
4. **Resolve links** — wikilink (`[[slug]]`) and markdown-link
   (`[label](path.md)`) cross-references; produce inbound-link sets for orphan
   detection.
5. **Activate per-context views** — when an [AIP-9](/docs/aip-9) operator,
   [AIP-6](/docs/aip-6) company, or [AIP-3](/docs/aip-3) skill loads, the host
   SHOULD locate its `KNOWLEDGE.md` (if any) and apply the merged effective
   config to queries, curations, and lints performed in that consumer's context.
   See [View activation](#view-activation) below.
6. **Run the lint pipeline** — orphans, broken refs, stale claims, unresolved
   contradictions, unsourced entries — using the merged `lints` from the active
   manifest. Append findings to `_log.md`.

The three signatures `defineKnowledgeWorkspace`, `defineEntry`, and
`defineSource` are the boundary between the host and the curation agent.

## Filesystem layout

The host MUST treat the wiki tree as canonical. The on-disk shape:

```
<wiki-root>/
├── KNOWLEDGE.md           # workspace manifest (required, machine config)
├── AGENTS.md              # human-readable schema (recommended companion)
├── _index.md              # generated catalog (required, host-maintained)
├── _log.md                # append-only activity log (required)
├── sources/               # raw sources (immutable)
│   ├── .index.json        # OPTIONAL — host-maintained source registry sidecar
│   └── <files>            # raw bytes; host MUST NOT mutate
├── entries/               # curated layer (mutable)
│   ├── entities/
│   ├── concepts/
│   ├── summaries/
│   ├── comparisons/
│   └── timelines/
└── .wiki/                 # OPTIONAL — host-private cache (may be .gitignored)
```

Per-context views (operators, companies, skills) live in the consumer's folder,
not under the wiki root:

```
<repo-root>/
├── operators/
│   └── research-analyst/
│       └── KNOWLEDGE.md   # extends ../../<wiki-root>/KNOWLEDGE.md
├── companies/
│   └── acme/
│       └── KNOWLEDGE.md   # extends ../../<wiki-root>/KNOWLEDGE.md
└── skills/
    └── sales-assist/
        └── KNOWLEDGE.md   # extends ../../<wiki-root>/KNOWLEDGE.md
```

Hosts MAY co-locate `entries/` subdirectories by `kind` (as above) or flatten
them (`entries/<slug>.md` only). The frontmatter `kind` is authoritative; the
path is a hint.

## Loading `KNOWLEDGE.md`

The workspace manifest is the host's first read on every wiki load and on every
consumer (operator/company/skill) activation. The host exposes the merged
effective config to queries, curations, and lints that run in the active
consumer's context.

### Resolution algorithm

When a host reads a `KNOWLEDGE.md`:

1. **Parse the frontmatter** as YAML. Validate against the `workspace` `$def` in
   [`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json). On failure, surface
   `knowledge_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `knowledge_extends_missing` as a
     WARNING (not an error), use the local manifest only, mark the chain as
     broken, and proceed.
   - If the parent has already appeared in the visited set: emit
     `knowledge_extends_cycle` as a WARNING, break the chain at the cycle point,
     use the partial chain, and proceed.
   - If the chain depth would exceed eight: emit
     `knowledge_extends_depth_exceeded` as a WARNING, break the chain at the
     eighth ancestor, use the partial chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below. Child wins on overrides.
5. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `knowledge_appliesto_unresolvable` if any binding fails to resolve.
   Unlike chain warnings, this is a hard failure: a view that binds to a
   non-existent consumer is semantically broken.

The host MUST NOT execute any code in `KNOWLEDGE.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                       | Strategy            | Notes                                                                                                                                            |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `title`, `description`, `version`                   | override            | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                    |
| `extends`                                                   | local-only          | Not inherited.                                                                                                                                   |
| `appliesTo`                                                 | local-only          | Not inherited. Each view declares its own scope.                                                                                                 |
| `curator`, `governance`                                     | override            | Child can rebind. Governance bindings flow through [AIP-7](/docs/aip-7); a parent's policy MAY restrict whether a child can rebind `governance`. |
| `entityTypes`                                               | merge-by-name       | Same `name` → child replaces parent. New names → appended.                                                                                       |
| `entityTypes[].fields`                                      | union               | Child's fields are appended to the parent's set; duplicates collapsed.                                                                           |
| `entityTypes[].parent`                                      | override            | Child can subtype a parent type by setting `parent:`.                                                                                            |
| `lints`                                                     | merge-by-id         | Same `id` → child replaces parent. New ids → appended.                                                                                           |
| `lints[].severity`                                          | child wins          | Subject to governance: a policy MAY forbid softening a parent lint below `error`.                                                                |
| `sources.*`                                                 | leaf-field override | `retention`, `signing`, `hashAlgo`, `authorityDefault` each override independently.                                                              |
| `curation.*`                                                | leaf-field override | `tone`, `depth`, `autoLink`, `conflictResolution`, `newEntryThreshold` each override independently.                                              |
| `queryHints.preferRecent`, `queryHints.preferAuthoritative` | override            |                                                                                                                                                  |
| `queryHints.scopeTo`                                        | replace wholesale   | Child replaces the parent's array if present.                                                                                                    |
| `display.*`                                                 | leaf-field override |                                                                                                                                                  |
| `metadata`                                                  | deep-merge          | Recursive merge; vendor namespaces accumulate.                                                                                                   |

### Cross-AIP ref resolution

| Ref                     | AIP                  | Resolver                                                                       |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `ws://operators/<slug>` | [AIP-9](/docs/aip-9) | Look up the operator workspace; verify it exists and the host can activate it. |
| `ws://companies/<slug>` | [AIP-6](/docs/aip-6) | Look up the company workspace.                                                 |
| `ws://skills/<slug>`    | [AIP-3](/docs/aip-3) | Look up the skill manifest.                                                    |
| `governance: <path>`    | [AIP-7](/docs/aip-7) | Resolve as a relative path to a policy/audit binding.                          |
| `extends: <path>`       | AIP-10               | Resolve as a relative path to another `KNOWLEDGE.md`.                          |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer. This is the only unresolvable cross-AIP ref
that triggers a hard failure during manifest load — `governance:` and `curator:`
MAY be unresolvable at load time (they're activated lazily) and surface a
runtime warning when activation actually attempts to use them.

### View activation

When an [AIP-9](/docs/aip-9) operator (or [AIP-6](/docs/aip-6) company, or
[AIP-3](/docs/aip-3) skill) loads, the host SHOULD:

1. Look for a `KNOWLEDGE.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above.
3. Pass the merged effective config to the consumer's runtime context: queries
   against the wiki SHOULD use the view's `queryHints` and `entityTypes` scope;
   curation passes SHOULD use the view's `curation` policy; lint passes SHOULD
   use the view's merged `lints`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id
   (e.g. `defineKnowledgeWorkspace().resolved.chain`) so reviewers can audit
   which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`KNOWLEDGE.md` directly. Consumers without their own view inherit the wiki's
default lens — explicitly, via the merge algorithm, not implicitly.

### Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedKnowledgeWorkspace = {
  effective: KnowledgeWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "knowledge.workspace/v1"
    name: string
    version: string
  }>
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "knowledge_extends_missing"
      | "knowledge_extends_cycle"
      | "knowledge_extends_depth_exceeded"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

The merged `effective` is what consumers use; the `chain` is what tooling uses
to explain _where_ a field came from. The `warnings` list is empty on a healthy
load.

### Conflict cases

The following examples illustrate the merge rules with concrete parent/child
manifests. Each is a minimal pair, not a full manifest.

**1. Lint severity softened by child.**

Parent (`<wiki>/KNOWLEDGE.md`):

```yaml
lints:
  - id: require-source
    kind: require-source
    appliesTo: Concept
    severity: error
```

Child (`operators/research/KNOWLEDGE.md`):

```yaml
extends: ../../my-wiki/KNOWLEDGE.md
lints:
  - id: require-source
    kind: require-source
    appliesTo: Concept
    severity: warn
```

Effective: `severity: warn`. The host MUST allow the override unless the
parent's `governance:` policy forbids softening lints — in which case the host
emits `governance:lint_softening_refused` and uses the parent's
`severity: error`.

**2. Entity type subtyped by child.**

Parent:

```yaml
entityTypes:
  - name: Person
    fields: [name, role, contact]
```

Child:

```yaml
entityTypes:
  - name: Investor
    parent: Person
    fields: [fund, lead_partner]
  - name: Person
    fields: [linkedin]
```

Effective:

```yaml
entityTypes:
  - name: Person
    fields: [name, role, contact, linkedin] # union
  - name: Investor
    parent: Person
    fields: [fund, lead_partner]
```

The child both _extended_ `Person` (union of fields) and _added_ a new subtype
`Investor`.

**3. Governance rebinding.**

Parent: `governance: ../policies/wiki.yaml`. Child:
`governance: ../policies/research-strict.yaml`.

Effective: `governance: ../policies/research-strict.yaml` (child wins). The host
applies the child's policy for any governance gate on this view.

### Canonical signatures

The host exposes three function signatures the curation agent (and the manifest
author) call:

```ts
// Workspace manifest — root or view.
defineKnowledgeWorkspace({
  schema: "knowledge.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                    // relative path to parent KNOWLEDGE.md
  appliesTo?: string[]                // ws:// refs or relative paths
  curator?: string                    // ws://operators/<slug>
  governance?: string                 // path or ref
  entityTypes?: Array<{ name: string; fields?: string[]; icon?: string; description?: string; parent?: string }>
  lints?: Array<{ id: string; kind: "require-source" | "max-age" | "min-confidence" | "broken-ref" | "orphan" | "custom"; appliesTo: string; severity: "error" | "warn" | "info"; params?: Record<string, unknown> }>
  sources?: { retention?: string; signing?: "required" | "optional" | "none"; hashAlgo?: "sha256" | "sha512" | "blake3"; authorityDefault?: "primary" | "secondary" | "rumour" }
  curation?: { tone?: string; depth?: "shallow" | "medium" | "deep"; autoLink?: "byName" | "manual" | "off"; conflictResolution?: "defer" | "recency" | "authority" | "observation-count" | "keep-both"; newEntryThreshold?: string }
  queryHints?: { preferRecent?: boolean; preferAuthoritative?: boolean; scopeTo?: string[] }
  display?: { homePage?: string; defaultGrouping?: "kind" | "tag" | "source" }
  metadata?: Record<string, unknown>
}): ResolvedKnowledgeWorkspace
```

Hosts MAY alias `defineKnowledgeWorkspace` as `defineWorkspace`,
`registerWorkspace`, or `defineKnowledge`. The canonical name MUST be present.

`defineEntry` and `defineSource` are unchanged from earlier drafts; their
signatures remain the boundary between the host and curation agent for the
entry/source layers.

## `defineSource` — register a raw source

### Required behaviour

A host that implements `defineSource` MUST:

1. **Verify the file exists at `path`** under `sources/`. If not, refuse with
   `{ code: "source_not_found", … }`.
2. **Compute or verify `contentHash`.** If the author supplied a hash, compare
   it to the file bytes; mismatch is `{ code: "source_hash_mismatch", … }`. If
   absent, compute `sha256:<hex>` and persist.
3. **Reject any subsequent mutation of the file.** Once a source is registered,
   the file's bytes are pinned for the lifetime of the wiki. The only ways to
   "change" a source are:
   - Append a new source file with a different id.
   - Mark the old source `superseded_by: <new-id>` in the registry (registry
     edits are allowed; source bytes are not).
4. **Reject any rename or delete of the file.** The host MUST refuse
   `mv sources/old.md sources/new.md` and `rm sources/old.md` once the source is
   registered. Tombstones stay in the registry.

### Optional behaviour

A host MAY:

- Store the source registry as `sources/.index.json`, `_sources.md`, or in a
  sidecar database. The persistence is host-defined; the **immutability
  semantic** is normative.
- Re-export `defineSource` under host-idiomatic aliases (`registerSource`,
  `pinSource`). The canonical name MUST be present.
- Compute additional hashes (sha512, blake3) for downstream needs. `sha256` MUST
  be present to make wikis comparable across hosts.

### Source immutability — the hard rule

> A host that allows mutation of a registered source's bytes is non-conforming.
> Period.

This is the spec's strongest invariant. The whole curation model collapses if
sources can drift: confidence values, contradictions, and stale-claim detection
all assume the cited bytes haven't changed since the entry was written. Hosts
that need "edit a source" semantics MUST implement it as `append + supersede`.

## `defineEntry` — register a curated entry

### Required behaviour

A host that implements `defineEntry` MUST:

1. **Validate frontmatter** against `KNOWLEDGE.schema.json` before accepting the
   entry. Reject with the failing field path.
2. **Resolve every `sources[]` id** against the source registry. Unresolvable id
   → `{ code: "source_unresolved", … }`.
3. **Persist atomically.** The entry write, the `_index.md` regeneration, and
   the `_log.md` append MUST commit as one transaction. Partial writes corrupt
   the audit trail.
4. **Refuse forward references.** `supersedes: [<slug>]` and
   `contradicts: [<slug>]` MUST resolve to existing entries in the same commit,
   OR MUST be slugs of entries written earlier in the same atomic batch.
   Dangling refs are a spec bug.
5. **Compute inbound links** as part of `_index.md` regeneration. Every entry's
   body is parsed for `[[slug]]` and `[label](path.md)` references; the inbound
   set is recorded for orphan detection.

### Optional behaviour

A host MAY:

- Accept `body` as a string OR as a path to a `.md` file. The string form is
  canonical; the path form is a convenience.
- Re-export `defineEntry` as `createEntry`, `registerEntry`. The canonical name
  MUST be present.
- Cache the parsed entry graph in `.wiki/cache.json` for fast reload. The cache
  MUST be invalidated whenever any entry, source, or `AGENTS.md` changes.

## Entry mutability — the soft rule

> Entries are mutable. They're the curated layer.

A host MUST allow:

- Updating an entry's `body`, `confidence`, `sources`, `updated_at`,
  `supersedes`, `contradicts`.
- Deleting an entry — but the `_log.md` MUST capture the deletion with reason.
- Renaming an entry's `slug` — but the host MUST rewrite all inbound links in
  the same transaction (or refuse the rename).

The host MAY snapshot entry history (git-style or custom). History is not
normative; the present-state files are.

## Link resolver

The link resolver MUST handle two forms:

| Syntax                    | Resolution                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `[[slug]]`                | Look up `slug` in the entry registry; broken if absent.                                                       |
| `[label](path.md)`        | Resolve `path.md` relative to the containing entry's directory; broken if absent or pointing into `sources/`. |
| `[label](path.md#anchor)` | As above; the anchor is informational.                                                                        |
| `[label](https://…)`      | External URL; resolver passes through, no lint check by default.                                              |

Links into `sources/` from an entry body are explicitly disallowed — the entry
MUST cite sources via the frontmatter `sources` field (by id), not by inline
path link. The resolver MUST flag inline source-path links as
`{ code: "source_link_inline", … }`.

## Lint pipeline

The host MUST implement five lint rules. Authors MAY add more via the schema;
these five are the floor.

### Orphans

An entry is **orphan** when no other entry, and no group section in `_index.md`,
links to it. Run after every `_index.md` regeneration.

```ts
const orphans = entries.filter(
  e => inboundLinks.get(e.slug)?.size === 0 && !indexLinks.has(e.slug)
)
```

### Broken refs

A wikilink or markdown link in any entry that doesn't resolve. Surface the
originating entry, the unresolvable target, and the line number.

### Stale claims

An entry whose **all** `sources[]` were captured before
`now - schema.staleThresholdDays`. The entry's claim MAY still be true, but no
recent source confirms it.

```ts
const stale = entries.filter(e => {
  const ages = e.sources.map(id => sources.get(id).capturedAt)
  return ages.every(a => a < cutoff)
})
```

Stale entries SHOULD be flagged with a `lint` event in `_log.md`. The host MUST
NOT auto-delete stale entries.

### Unresolved contradictions

Entries with non-empty `contradicts: [...]`. The host surfaces them to the
curation agent on every lint pass until the schema's contradiction policy
resolves them.

### Unsourced entries

Entries with empty `sources: []`. The schema MAY permit unsourced entries for
derived/synthetic kinds (`comparison`, `timeline`); for all other kinds,
unsourced is a lint failure.

### Lint output

Every lint pass MUST append to `_log.md`:

```md
## [2026-04-27T16:00:00Z] lint | full-pass

- 2 orphans: entities/old-vendor, concepts/abandoned-strategy
- 1 broken-ref: entries/concepts/runway-extension.md → [[lead-investor]] (now
  lead-investor-2)
- 3 stale: entities/founder-bio, concepts/q1-targets, summaries/2025-12-board
- 0 unresolved-contradictions
- 0 unsourced
```

## Curation lifecycle

Every wiki goes through these states:

| State       | Trigger                                                  | Allowed transitions                 |
| ----------- | -------------------------------------------------------- | ----------------------------------- |
| `empty`     | New directory, only `AGENTS.md` present.                 | → `populated` (first entry written) |
| `populated` | At least one entry.                                      | → `linted`, → `forked`              |
| `linted`    | Lint pass completed; findings logged.                    | → `populated` (next ingest)         |
| `forked`    | Entries copied to a new wiki root with same `AGENTS.md`. | → `populated`                       |
| `frozen`    | Schema marks the wiki read-only (e.g. archived project). | terminal                            |

The host SHOULD expose these states via a status query so schedulers know when
to run lint and when to skip.

### Forking

A fork is a deep copy of `entries/` + `_index.md` to a new wiki root. The host
MUST:

- Copy `AGENTS.md` (or replace it with a new schema if the curation agent is
  forking _with_ a schema change).
- **Reference `sources/` by hash, not by path** — the new wiki MAY point to the
  same `sources/` directory, OR the host MAY copy the `sources/` directory;
  either way, every entry's `sources[]` ids MUST still resolve.
- Append a `manual` event to `_log.md` capturing the fork origin.

## Error envelope

All errors leave the host as:

```ts
type WikiResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        entry?: string
        source?: string
        cause?: unknown
      }
    }
```

`code` SHOULD use the AIP-10 vocabulary:

- `schema_missing` — `KNOWLEDGE.md` not present at the wiki root. (`AGENTS.md`
  is RECOMMENDED, not REQUIRED; its absence is not an error.)
- `knowledge_workspace_invalid` — `KNOWLEDGE.md` frontmatter fails schema
  validation. Returns the failing field path.
- `knowledge_extends_missing` — view's `extends:` points to a non-existent file.
  Soft warning; runtime degrades to local-only.
- `knowledge_extends_cycle` — `extends:` chain visits the same manifest twice.
  Soft warning; runtime breaks the chain at the cycle point.
- `knowledge_extends_depth_exceeded` — chain depth exceeds eight. Soft warning;
  runtime breaks at the eighth ancestor.
- `knowledge_appliesto_unresolvable` — view's `appliesTo` references a consumer
  (operator/company/skill) that does not exist. Hard failure; the view is
  refused.
- `source_not_found` — referenced file missing.
- `source_hash_mismatch` — registered hash does not match bytes.
- `source_mutation_refused` — caller attempted to write to `sources/`.
- `source_unresolved` — entry references a source id not in the registry.
- `link_broken` — wikilink/markdown link does not resolve.
- `link_inline_to_source` — entry body links into `sources/`.
- `entry_invalid` — frontmatter fails schema validation.
- `entry_orphan` — lint surfaced an orphan (lint findings travel via `_log.md`,
  not as errors, but the type exists for callers that want them as errors).
- `contradiction_unresolved` — same.
- `wiki_schema_drift` — `KNOWLEDGE.md` and `AGENTS.md` describe divergent
  schemas (e.g. an entity type declared in one but not the other). Lint-level
  finding; does not block writes.

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Loader rules

Entry and source files MUST be safely importable as side-effect-free markdown.
Specifically:

- **No I/O at load.** The host reads bytes; nothing executes.
- **Frontmatter is YAML or TOML.** Implementations MUST support YAML; TOML is
  OPTIONAL.
- **Body is markdown.** Wikilink and markdown-link extensions are parsed;
  everything else is plain markdown for downstream tooling (rendering, search,
  summarisation).

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function names                                                | Schema dialect          |
| ----------------------- | ------------------------------------------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineKnowledgeWorkspace`, `defineEntry`, `defineSource`     | JSON Schema or zod      |
| Python                  | `define_knowledge_workspace`, `define_entry`, `define_source` | JSON Schema or pydantic |
| Go                      | `DefineKnowledgeWorkspace`, `DefineEntry`, `DefineSource`     | struct tags             |
| Rust                    | `define_knowledge_workspace`, `define_entry`, `define_source` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the curation agent's language.

## Registration test

A conforming host SHOULD provide a `validate(wikiRoot)` helper that:

1. Checks `KNOWLEDGE.md` is present at the wiki root and validates against the
   workspace `$def` in `KNOWLEDGE.schema.json`. If `AGENTS.md` is also present,
   parse it and surface `wiki_schema_drift` findings where it diverges from
   `KNOWLEDGE.md`.
2. Walks `sources/`, recomputes hashes (using the algorithm from
   `sources.hashAlgo` in the merged manifest), compares to the registry.
3. Validates every entry frontmatter against `KNOWLEDGE.schema.json`.
4. Resolves every `sources[]` id and every link.
5. For every per-context view it can locate (operators, companies, skills),
   resolves the `extends:` chain and validates the merged effective config.
6. Runs the full lint pipeline using the merged `lints` from the active
   manifest; reports findings as a structured list.
7. Reports the first failure with file + field path.

This is the standard "is this wiki conforming?" handshake.

## What this guide does NOT cover

- The host's retrieval strategy (BM25, embeddings, graph walk). AIP-10
  explicitly leaves this to runtime policy.
- The host's UI for browsing, editing, or approving entries.
- Multi-tenant isolation, quotas, billing — runtime concerns.
- Any specific markdown renderer or wiki UI.

These stay out of the spec on purpose.

## See also

- [AIP-10 — agentknowledge/v1 spec](/docs/aip-10)
- [AIP-1 — agent.json](/docs/aip-1)
- [AIP-2 — capability surface](/docs/aip-2)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json) — frontmatter validator
  (entry + source)
- [`./SKILL.md`](./SKILL.md) — agent-side curation skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference entries and sources
