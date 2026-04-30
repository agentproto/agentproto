---
schema: skills/v1
name: curate-wiki
title: Curate an agentknowledge/v1 wiki (AIP-10)
description:
  Walk through writing, linking, and linting curated wiki entries on top of
  immutable raw sources, using the standard defineEntry / defineSource
  signatures.
version: 1.0.0
tags: [aip-10, knowledge, wiki, curation, agentproto]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the wiki to capture (a new
      ingest, a new entry, a lint pass, a fork). The skill picks a sub-flow
      based on this.
  - name: wikiRoot
    type: string
    required: false
    description:
      Absolute path to the wiki directory. Default `./wiki`. Must contain
      `AGENTS.md`, `entries/`, `sources/`, `_index.md`, `_log.md`.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for entry/source helpers. Default "ts". Accepts "ts",
      "py", "go", "rs", "js".
examples:
  - input:
      intent:
        Add yesterday's investor-call transcript and update everything it
        touches.
    output:
      - wiki/sources/2026-04-27-investor-call.md
      - wiki/entries/concepts/runway-extension.md (updated)
      - wiki/entries/entities/lead-investor.md (created)
      - wiki/_index.md (regenerated)
      - wiki/_log.md (appended)
---

# Curate an agentknowledge/v1 wiki (AIP-10)

Use this skill when the user asks to **write, link, lint, or fork** entries in
an [AIP-10](/docs/aip-10) wiki. The skill produces a valid curated layer on top
of the immutable `sources/` tree, using the standard `defineEntry` and
`defineSource` signatures the host exposes.

## When to use

- "Ingest this transcript / paper / ticket dump into the wiki."
- "Write a new concept page about <X> and link it to the entries that mention
  it."
- "Run a lint pass — what's stale, what's orphaned, what contradicts?"
- "Fork the wiki for a different team and prune the entries that don't apply."

## When NOT to use

- The user wants to **query** the wiki — no authoring needed; read `_index.md`
  then the relevant entries directly.
- The user wants to **edit a raw source** under `sources/` — that's a spec
  violation. Sources are immutable; only append new ones.
- The user wants a **schema change** — to either `KNOWLEDGE.md` (the canonical
  machine config) or `AGENTS.md` (the optional prose companion). That's a
  governance gate, not an authoring task. Use the
  [`author-knowledge`](../author-knowledge/SKILL.md) skill to draft the change,
  then route through [AIP-7](/docs/aip-7) approval before merging.

## Process

Follow these steps in order. Each one matters; skipping the provenance steps
(citing sources, updating `_index.md`) produces entries that look fine until a
lint pass exposes them as orphan, unsourced, or stale.

### 1. Read the schema first

Open `KNOWLEDGE.md` at the wiki root before doing anything else — this is the
canonical, machine-readable workspace manifest. If a prose companion `AGENTS.md`
exists, read it too for context, but treat `KNOWLEDGE.md` as authoritative when
the two disagree (the host's lint pass will flag drift as `wiki_schema_drift`).

The merged effective config (after the host walks any `extends:` chain for the
active consumer's view) defines:

- **Entity types** (`entityTypes`) — what `kind` values are recognized (Concept,
  Person, Investor, …) and the canonical fields each carries.
- **Lints** (`lints`) — which checks run, at what severity, against which entity
  types.
- **Source policy** (`sources`) — retention, hash algorithm, default authority.
- **Curation policy** (`curation`) — tone, depth, autoLink, conflictResolution,
  newEntryThreshold.
- **Query hints** (`queryHints`) — what the active consumer prefers when
  retrieving.

If a per-consumer view applies (the active operator/company/skill has its own
`KNOWLEDGE.md`), the host has already merged it for you; ask the host for the
resolution chain if you want to know which manifest contributed which field.

If you don't read the schema first, you'll write entries that the host rejects
on save or that the next lint pass flags as non-conforming.

### 2. Pin the source first (if ingesting)

A new fact enters the wiki by **first becoming a source**, then by the agent
rewriting the affected entries to cite it. Never the reverse — an entry without
a source is unsourced, and the lint pass will flag it.

To pin a source:

```ts
import { defineSource } from "<host-runtime>"

export default defineSource({
  id: "2026-04-27-investor-call", // stable id, kebab-case, ISO-prefix preferred
  path: "sources/2026-04-27-investor-call.md",
  title: "Lead investor weekly sync, 2026-04-27",
  capturedAt: "2026-04-27T15:00:00Z",
  capturedBy: "jeremy@agentik.net",
  contentHash: "sha256:9f1b…", // host computes; author MAY supply
  authority: "primary", // primary | secondary | rumour
  tags: ["finance", "investor"],
})
```

`defineSource` returns a handle the host writes into a side-car (usually
`sources/.index.json` or `_sources.md`). The raw file itself MUST already exist
on disk; `defineSource` records the metadata, not the bytes.

**Sources are immutable.** Once `contentHash` is set, the host MUST refuse any
mutation of the file. To correct an error, append a new source that supersedes
the old one — never edit the old one.

### 3. Identify affected entries

Read `_index.md` and grep entry bodies for the entities, concepts, or claims the
new source touches. The output is a list of:

- Entries to **update** — the source confirms, contradicts, or refines an
  existing claim.
- Entries to **create** — the source introduces an entity or concept not yet
  covered.
- Entries to **flag** — the source contradicts something but you can't decide
  which side is right.

Write that list down (in scratch state) before touching any file. Skipping this
step leads to monolithic rewrites — see
[AIP-10 § Ingest contract](/docs/aip-10#ingest-contract) — which are
non-conforming.

### 4. Patch entries minimally

Apply the smallest diff per affected entry. The frontmatter and body shape:

```yaml
---
schema: knowledge/v1
slug: runway-extension
kind: concept
title: Runway extension
sources:
  - 2026-04-15-board-deck         # by source id, NOT path
  - 2026-04-27-investor-call
confidence: 0.9
updated_at: 2026-04-27T15:30:00Z
supersedes: []
contradicts: []
metadata: {}
---

# Runway extension

A path to extend operating runway by <N> months without raising new
capital. As of 2026-04-27 the lead investor is exploring a bridge
note (see [[lead-investor]]); board-deck assumptions still apply
([[budget-forecast]]).

## Open questions

- Bridge size — pending term sheet ([2026-04-27-investor-call]).
```

Rules:

- `sources` references are **source ids**, never paths. The host resolves ids to
  paths via the source registry.
- Cross-entry links use `[[slug]]` (wikilinks) OR `[label](relative.md)`
  markdown links. Both MUST resolve.
- `confidence` is advisory — set it lower when the underlying sources disagree
  or when only `secondary` / `rumour` sources back the claim.
- `updated_at` MUST be set on every patch.

### 5. Create new entries when needed

Use `defineEntry` for the new pages:

```ts
import { defineEntry } from "<host-runtime>"

export default defineEntry({
  slug: "lead-investor",
  kind: "entity",
  title: "Lead investor",
  sources: ["2026-04-27-investor-call"],
  confidence: 0.85,
  body: `
# Lead investor

The investor leading the current round. Active in board cadence
since 2026-04-15. Currently exploring a bridge note tied to
[[runway-extension]].
  `,
  links: ["runway-extension"], // OPTIONAL — a hint to the link resolver
})
```

`links` is a hint — the resolver also walks the rendered body for `[[slug]]` and
markdown links. The hint exists for entries whose links are computed (e.g. a
generated index entry).

### 6. Resolve contradictions explicitly

When two sources disagree:

- Apply the schema's contradiction policy (recency? authority? observation
  count?).
- If the policy resolves it: update the entry, set `supersedes: [<old-slug>]` if
  a prior entry is replaced.
- If the policy does NOT resolve it: keep both claims in the body with their
  sources cited, and set `contradicts: [<other-slug>]` on each. The lint pass
  surfaces this so a human can decide.

Never silently drop a claim. The audit trail is the point.

### 7. Update `_index.md` and append `_log.md`

In the same transaction as step 4–6 (the host enforces atomicity):

- Regenerate `_index.md` from current entry frontmatter.
- Append a `_log.md` entry:

```md
## [2026-04-27T15:30:00Z] ingest | 2026-04-27-investor-call

- Updated [[runway-extension]] (confidence 0.8 → 0.9, +1 source).
- Created [[lead-investor]] (entity, 1 source).
- No contradictions surfaced.
```

`event-type` ∈ `ingest | query | lint | manual`. Always include the affected
slugs in bullets — log readability is what makes the wiki auditable after the
fact.

### 8. Lint before declaring done

Run the standard lint rules:

- **Orphans** — entries with no inbound link from `_index.md` or any other
  entry.
- **Broken refs** — `[[slug]]` or markdown links pointing to a missing entry.
- **Stale claims** — entries whose `sources` are all older than the schema's
  threshold.
- **Unresolved contradictions** — entries with non-empty `contradicts`.
- **Unsourced** — entries with empty `sources`.

If lint surfaces issues caused by your patch, fix them in the same session. If
it surfaces pre-existing issues, append them to `_log.md` as a `lint` event and
surface to the user — don't silently fix unrelated entries.

### 9. Validate

Validate every touched entry's frontmatter against
[`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json):

```bash
npx ajv validate -s ./KNOWLEDGE.schema.json -d "wiki/entries/**/*.md"
```

Fix every error before declaring success. Specifically check:

- Every entry has at least one `sources` reference (unless the schema explicitly
  allows unsourced entries).
- Every `sources` id resolves against the source registry.
- Every wikilink / markdown link resolves.

## Output

Reply to the user with:

1. The wiki root you wrote into.
2. **Sources added** (id + path + authority).
3. **Entries created** and **entries updated**, each with the `confidence` delta
   if changed.
4. **Contradictions surfaced** (unresolved) and how you flagged them.
5. **Lint findings** triggered or fixed by this session.
6. **Open assumptions** — fields you guessed (`authority`, `confidence`
   thresholds) that the user might want to override.

Do NOT mutate `sources/` files, rewrite `AGENTS.md`, or run fork/branch
operations the user didn't ask for. Authoring ends with the entries, the
regenerated `_index.md`, and the appended `_log.md`.

## See also

- [AIP-10 — agentknowledge/v1 spec](/docs/aip-10)
- [AIP-1 — agent.json](/docs/aip-1)
- [AIP-2 — capability surface](/docs/aip-2)
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide for hosts (entry,
  source, AND workspace manifest loading)
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference entries, sources, and
  workspace manifests (minimal, sourced, linked, stale, hash-pinned, forked,
  distilled, workspace root, per- operator view, per-company view, multi-level
  extends)
- [`../../KNOWLEDGE.schema.json`](../../KNOWLEDGE.schema.json) — frontmatter
  validator (entry, source, and workspace doctypes)
- [`../author-knowledge/SKILL.md`](../author-knowledge/SKILL.md) — sister skill
  for authoring `KNOWLEDGE.md` (workspace root or view)
