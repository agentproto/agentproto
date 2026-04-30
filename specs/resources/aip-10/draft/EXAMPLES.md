# EXAMPLES.md — agentknowledge/v1 reference patterns

Reference entries and sources exemplifying common patterns. Each example is a
self-contained file a host could load as-is. Curation agents should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Minimal entry](#example-1--minimal-entry)
2. [Entry citing a source](#example-2--entry-citing-a-source)
3. [Entry linking sibling entries](#example-3--entry-linking-sibling-entries)
4. [Entry with stale-claim lint annotation](#example-4--entry-with-stale-claim-lint-annotation)
5. [Raw source pinned by hash](#example-5--raw-source-pinned-by-hash)
6. [Branched / forked wiki](#example-6--branched--forked-wiki)
7. [Distilling a corpus into curated entries](#example-7--distilling-a-corpus-into-curated-entries)
8. [Workspace root manifest (`KNOWLEDGE.md`)](#example-8--workspace-root-manifest-knowledgemd)
9. [Per-operator view extending the workspace](#example-9--per-operator-view-extending-the-workspace)
10. [Per-company view binding governance](#example-10--per-company-view-binding-governance)
11. [Multi-level extends (org → team → operator)](#example-11--multi-level-extends-org--team--operator)

---

## Example 1 — Minimal entry

The smallest legal entry: required frontmatter only, no sources, short body.
Useful for stub entries the curation agent creates when a new entity surfaces in
a source but has no facts beyond existence.

```md
---
schema: knowledge.entry/v1
slug: alex-park
kind: entity
title: Alex Park
updated_at: 2026-04-27T15:00:00Z
---

# Alex Park

Mentioned in [2026-04-27-investor-call] as the lead investor's finance partner.
No further details on disk yet — flagged for follow-up in next ingest.
```

**When to use.** When a source mentions an entity by name but gives no facts
beyond existence. Stubbing the entry now lets future ingests link to
`[[alex-park]]` without rewriting history. Many schemas allow unsourced stubs of
`kind: entity`; check `AGENTS.md` before relying on the pattern.

---

## Example 2 — Entry citing a source

The standard shape: a curated claim backed by one or more raw sources. The
frontmatter resolves source ids against the registry; the body cites them inline
so the prose is self-explanatory.

```md
---
schema: knowledge.entry/v1
slug: runway-extension-q2
kind: concept
title: Runway extension (Q2 2026)
sources:
  - 2026-04-15-board-deck
  - 2026-04-27-investor-call
confidence: 0.9
updated_at: 2026-04-27T15:30:00Z
tags: [finance, runway]
---

# Runway extension (Q2 2026)

A path to extend operating runway by ~6 months without raising a new round, by
combining a bridge note from the lead investor with a one-time cost cut.

## Mechanism

- Bridge of $2M from the existing lead investor (see
  [2026-04-27-investor-call]).
- Q2 cost cut targeting $300k/mo of recurring spend; targets taken from the
  board deck ([2026-04-15-board-deck]).

## Open questions

- Bridge size — pending term sheet ([2026-04-27-investor-call]).
- Cost-cut feasibility under hiring freeze — pending CFO confirmation.
```

**When to use.** This is the default pattern for any factual entry. Cite every
claim. The lint pass treats unsourced claims as bugs in most schemas.

---

## Example 3 — Entry linking sibling entries

An entry that exists primarily to relate other entries. Useful for concepts that
emerge as the wiki grows — the curation agent notices a recurring relation and
writes it down once instead of repeating it.

```md
---
schema: knowledge.entry/v1
slug: investor-relations-2026
kind: concept
title: Investor relations playbook (2026)
sources:
  - 2026-04-15-board-deck
  - 2026-04-27-investor-call
  - 2026-03-10-fundraising-strategy
confidence: 0.75
updated_at: 2026-04-27T16:00:00Z
links:
  - lead-investor
  - alex-park
  - runway-extension-q2
  - bridge-note-terms
tags: [finance, playbook]
---

# Investor relations playbook (2026)

How the company communicates with its investor base in 2026.

## Cadence

- Monthly written update — see [[monthly-investor-update-template]].
- Quarterly deep-dive call with the lead investor and [[alex-park]].
- Ad-hoc updates when [[runway-extension-q2]] mechanics change.

## Active threads

- [[bridge-note-terms]] — under negotiation.
- [[lead-investor]] — primary relationship, owns board seat #2.

## Cross-references

This entry intentionally links downstream entries instead of restating their
content. Update the linked entries; this page inherits.
```

**When to use.** When a concept's value is the _graph of relations_ it captures,
not the prose. The `links` field is a hint — the resolver still walks the body
for `[[slug]]` references, so the field is OPTIONAL; populate it only when
downstream tooling benefits (e.g. a generated TOC).

---

## Example 4 — Entry with stale-claim lint annotation

An entry whose sources are all older than the wiki's stale threshold. The lint
pass flags it; the curation agent annotates the body with a callout so a reader
knows the claim is unre-confirmed, without removing the entry (which would lose
the audit trail).

```md
---
schema: knowledge.entry/v1
slug: q4-2025-targets
kind: concept
title: Q4 2025 revenue targets
sources:
  - 2025-10-01-board-meeting
  - 2025-11-15-revenue-forecast
confidence: 0.4
updated_at: 2026-04-27T16:15:00Z
contradicts: []
tags: [finance, targets, stale]
metadata:
  lint:
    stale: true
    stale_since: 2026-01-29
    stale_reason:
      "All sources older than 90-day threshold; no Q1 2026 source confirms or
      denies."
---

# Q4 2025 revenue targets

> **Stale-claim notice (2026-04-27).** All cited sources were captured before
> 2026-01-29. The figures below have not been re-confirmed against any 2026
> source. Treat as historical record, not as current target. The lint pass
> surfaced this entry on its last run; resolution is pending.

The Q4 2025 plan targeted $X ARR by year-end (see [2025-10-01-board-meeting])
with a $Y/mo new-MRR run rate ([2025-11-15-revenue-forecast]).
```

**When to use.** When the stale-claim lint surfaces an entry but the underlying
claim is still useful as historical record. Annotate, lower `confidence`, set
`metadata.lint.stale`. Don't silently delete. The next ingest may bring a fresh
source that refutes or re-confirms; the entry's `supersedes` chain captures
that.

---

## Example 5 — Raw source pinned by hash

A source-doctype frontmatter for a raw transcript file. The curation agent
ingests this _before_ writing any entry that cites it. The host records
`content_hash`; from this point the file bytes are pinned.

```md
---
schema: knowledge.source/v1
id: 2026-04-27-investor-call
path: sources/2026-04-27-investor-call.md
title: Lead investor weekly sync, 2026-04-27
captured_at: 2026-04-27T15:00:00Z
captured_by: jeremy@agentik.net
content_hash: sha256:9f1b3c7e4d2a8f6b1c0e9d5a3f7b2c8e1d4a6f9b3c7e0d2a5f8b1c4e7d9a3f6b
authority: primary
language: en
tags: [finance, investor, transcript]
---

(The body of a knowledge.source/v1 file is the raw content itself — a
transcript, a paper text, a meeting note. The frontmatter pins it; the body is
what the curation agent summarises. Once registered, the host MUST refuse to
mutate the file's bytes. To 'correct' a source, the curation agent appends a new
source file with a different id and sets `superseded_by` on the old one in the
source registry — the bytes themselves stay fixed.)
```

**When to use.** Every time a new raw artefact (transcript, paper, ticket dump,
meeting note, contract) enters the wiki. Compute the hash before writing entries
that cite it. The hash is what makes forking and cross-wiki citations sound — a
citation by hash means the same bytes regardless of where the wiki lives.

---

## Example 6 — Branched / forked wiki

A fork is a deep copy of `entries/` with the same `AGENTS.md`, pointing at the
same `sources/` (or a copy of it). The fork's `_log.md` opens with a `manual`
event recording the parent.

```md
---
schema: knowledge.entry/v1
slug: runway-extension-q2
kind: concept
title: Runway extension (Q2 2026) — ops fork
sources:
  - 2026-04-15-board-deck
  - 2026-04-27-investor-call
  - 2026-04-27-ops-headcount-plan
confidence: 0.85
updated_at: 2026-04-27T17:00:00Z
supersedes: []
contradicts: []
tags: [finance, runway, fork:ops]
metadata:
  fork:
    parent_wiki: company-wiki
    parent_slug: runway-extension-q2
    forked_at: 2026-04-27T17:00:00Z
    forked_reason:
      "Ops team needs entries scoped to headcount; finance team's wiki keeps the
      broader version."
---

# Runway extension (Q2 2026) — ops fork

The runway plan as it pertains to operations / headcount. Forked from the
company-wide [[runway-extension-q2]] in the parent wiki on 2026-04-27.

## Headcount implications

Q2 cost cut implies a hiring freeze through 2026-09-30 (see
[2026-04-27-ops-headcount-plan]). No layoffs assumed in current plan; revisit at
2026-07-01 review.

## Cross-references

- Parent wiki entry: see `metadata.fork.parent_slug`.
- Bridge mechanics: not duplicated here — read parent wiki.
```

The accompanying `_log.md` opens with:

```md
## [2026-04-27T17:00:00Z] manual | fork-from-company-wiki

- Forked entries/ from /wikis/company-wiki at commit-hash abc1234.
- AGENTS.md unchanged — same schema, same lint rules.
- sources/ shared by hash; no copy made (host policy: shared source pool).
- Fork scope: ops-related concepts only. Pruned 47 entries.
- Owner: ops-lead@example.com.
```

**When to use.** When a team needs a curated subset of an existing wiki, with
its own update cadence, but doesn't want to lose provenance to the parent. Forks
share sources by hash so citations remain comparable. The `metadata.fork.*`
fields are vendor extensions standardised by convention but not required by the
spec; populate them so other tools can walk the fork graph.

---

## Example 7 — Distilling a corpus into curated entries

The "many sources, few entries" pattern. After ingesting a corpus of 30+ sources
on a topic, the curation agent writes a small set of high-confidence concept
entries that cite many sources each. The lint threshold is satisfied (every
entry has sources), the graph is dense (every concept links its neighbours), and
readers get one page per idea instead of one page per source.

```md
---
schema: knowledge.entry/v1
slug: compounding-knowledge-pattern
kind: concept
title: The compounding-knowledge pattern
sources:
  - 2026-04-15-karpathy-llm-wiki-gist
  - 2026-04-16-anthropic-skills-blog
  - 2026-04-18-agents-md-spec
  - 2026-04-22-ingest-prototype-notes
  - 2026-04-25-internal-design-doc
  - 2026-04-26-team-discussion-thread
confidence: 0.95
updated_at: 2026-04-27T18:00:00Z
supersedes:
  - rag-vs-wiki-comparison
  - knowledge-base-options-2026
links:
  - llm-as-compiler
  - immutable-sources-rule
  - schema-as-trade-unit
tags: [knowledge, pattern, distilled]
---

# The compounding-knowledge pattern

A curated wiki rewritten by an LLM on every ingest, on top of immutable raw
sources, produces a knowledge artefact that compounds across ingests instead of
being recomputed per query.

## The three layers

1. **Immutable sources.** Raw bytes — papers, transcripts, dumps — pinned by
   hash and never edited (see [[immutable-sources-rule]]).
2. **Curated entries.** The LLM rewrites these on every ingest, citing sources
   by id, linking sibling entries.
3. **Schema (`AGENTS.md`).** The unit of trade — a domain expert ships a schema,
   runtimes execute it ([[schema-as-trade-unit]]).

## Why this beats RAG

The compiled artefact is auditable and forkable; RAG's per-query retrieval is
neither (see [2026-04-15-karpathy-llm-wiki-gist],
[2026-04-25-internal-design-doc]).

## Why this beats vendor "memory"

The wiki survives runtime migration. The bytes on disk are the contract; any
conforming host can open them ([2026-04-18-agents-md-spec]).

## Supersedes

This entry replaces the older [[rag-vs-wiki-comparison]] (which treated the two
as equivalent options) and [[knowledge-base-options-2026]] (which surveyed the
field without picking). Both old entries remain on disk for audit; new readers
land here.
```

**When to use.** After ingesting a corpus large enough that a per-source summary
entry per source would clutter `_index.md`. Distilling produces a small number
of high-density concept entries backed by many sources, with `supersedes` chains
pointing back to the older shape so the audit trail stays intact. The pattern is
also how a wiki crosses the maturity threshold from "log of ingests" to
"navigable knowledge base" — the moment a reader can land on `_index.md` and
find one page per idea, the wiki has started to compound.

---

---

## Example 8 — Workspace root manifest (`KNOWLEDGE.md`)

The minimal workspace manifest for a research wiki. No `extends:`, no
`appliesTo:` — this IS the base shape. Two entity types (`Concept`, `Person`),
two lint rules (require-source on Concepts, max-age 90 days on everything),
default curation policy.

This file lives at `<wiki-root>/KNOWLEDGE.md`. Every consumer that adapts this
wiki via a view will eventually merge against this manifest as its chain root.

```md
---
schema: knowledge.workspace/v1
name: research-wiki
title: Research wiki
description:
  Shared research knowledge base. Concepts and people that recur across
  projects, with provenance and recency tracking. Source authority defaults to
  'secondary' because most ingests are reading-list digests, not first-party
  recordings.
version: 1.0.0

curator: ws://operators/wiki-curator

entityTypes:
  - name: Concept
    icon: 🧠
    fields: [definition, sources, related]
    description:
      An abstract idea recurring across reading. Curators distill 3+ source
      mentions into one Concept entry.
  - name: Person
    icon: 👤
    fields: [name, role, contact, affiliations]
    description:
      A real-world person referenced by sources. Stub on first mention; expand
      when facts accumulate.

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
  - id: broken-ref
    kind: broken-ref
    appliesTo: "*"
    severity: error

sources:
  retention: forever
  signing: optional
  hashAlgo: sha256
  authorityDefault: secondary

curation:
  tone: neutral
  depth: medium
  autoLink: byName
  conflictResolution: defer

queryHints:
  preferRecent: true
  preferAuthoritative: false

display:
  defaultGrouping: kind
---

# Research wiki — base manifest

## Purpose

Shared research notes. Anyone on the team should be able to land on this wiki
and find a one-page distillation of any concept that has shown up in three or
more reading-list items.

## Conventions

- Concepts MUST cite sources. Stub Person entries are allowed unsourced.
- Body prose stays neutral; per-team views (research, sales) override
  `curation.tone` for their lens.

## When to extend vs replace

Extend (in a per-consumer view) when you want a different lens on the same wiki.
Fork the wiki (separate root) only when the entity model itself diverges enough
that merge no longer makes sense.
```

**When to use.** This is the starting point for any new wiki that expects to
serve more than one consumer. Even if you only have one consumer today, shipping
the workspace as a manifest from day one keeps the door open for views later —
adding `extends:` to a child later is a one-line edit, retrofitting prose-only
`AGENTS.md` is not.

---

## Example 9 — Per-operator view extending the workspace

A view that lives in the research-analyst operator's folder. It narrows focus to
`Concept` (the operator doesn't curate Person entries directly), changes
`curation.tone` to `academic`, adds a view-local lint that enforces minimum
confidence on Concept entries, and softens the workspace's `max-age-90` to a
warning the operator can ignore for historical reading.

```md
---
schema: knowledge.workspace/v1
name: research-analyst-view
title: Research analyst view
description:
  The research-analyst operator's lens on the shared research wiki.
  Concept-focused, academic tone, stricter confidence floor, more lenient on
  historical sources.
version: 1.0.0

extends: ../../research-wiki/KNOWLEDGE.md

appliesTo:
  - ws://operators/research-analyst

curator: ws://operators/research-analyst

lints:
  - id: max-age-90
    kind: max-age
    appliesTo: "*"
    severity: info # softened from 'warn'
    params:
      days: 90
  - id: min-confidence-concept
    kind: min-confidence
    appliesTo: Concept
    severity: warn # added by this view
    params:
      min: 0.6

curation:
  tone: academic # overrides parent 'neutral'
  depth: deep # overrides parent 'medium'

queryHints:
  preferRecent: false # overrides parent 'true'
  preferAuthoritative: true # overrides parent 'false'
  scopeTo: [Concept] # narrow query default
---

# Research-analyst view

The research analyst doesn't care about Person stubs and reads historical
material liberally. Concepts are the unit of value; recency is less important
than authority.
```

**When to use.** Drop a per-operator `KNOWLEDGE.md` whenever the operator's job
changes the lens enough that the workspace defaults get in the way. Inherited
from parent: `entityTypes` (`Concept`, `Person`), `sources.*`, `display.*`, lint
`require-source`, lint `broken-ref`, `metadata`. Overridden: `curator`,
`curation.tone`, `curation.depth`, `queryHints.*`, lint `max-age-90` (severity
softened). Added by this view: lint `min-confidence-concept`, `appliesTo`
binding.

A debug surface query against this view returns the resolution chain
`[../../research-wiki/KNOWLEDGE.md, ./KNOWLEDGE.md]` and the merged effective
config. Reviewers can audit which field came from where; nothing is implicit.

---

## Example 10 — Per-company view binding governance

A company that uses the research wiki for internal knowledge but must layer its
own governance policy on top — for example, a finance team whose entries pass
through an [AIP-7](/docs/aip-7) approval gate before publication. The view adds
a company-specific entity type `Investor` (subtype of `Person`) and binds a
stricter governance policy.

```md
---
schema: knowledge.workspace/v1
name: acme-company-view
title: Acme — research wiki view
description:
  Acme's lens on the shared research wiki. Adds an Investor entity type for the
  finance team and binds an AIP-7 governance policy that gates Concept and
  Investor entries through approval before publication.
version: 1.2.0

extends: ../../research-wiki/KNOWLEDGE.md

appliesTo:
  - ws://companies/acme

curator: ws://operators/acme-librarian
governance: ../policies/acme-knowledge.yaml

entityTypes:
  - name: Investor
    icon: 💼
    parent: Person
    fields: [fund, lead_partner, board_seat, last_meeting_at]
    description:
      An investor on Acme's cap table. Subtype of Person; inherits Person
      fields, adds finance-specific ones.
  - name: Person
    fields: [internal_owner] # appended to parent's [name, role, contact, affiliations]

lints:
  - id: require-source
    kind: require-source
    appliesTo: Investor # narrowed; the parent rule on Concept still applies
    severity: error
  - id: investor-meeting-recency
    kind: max-age
    appliesTo: Investor
    severity: warn
    params:
      days: 60

curation:
  tone: neutral
  conflictResolution: keep-both # finance disputes are kept, not auto-resolved

metadata:
  acme:
    cost_center: research-shared
    pii_class: confidential
---

# Acme — research wiki view

Acme uses the shared research wiki and layers a stricter governance policy on
top. The finance team's Investor subtype extends Person; both pass through
approval before publication.
```

**When to use.** When a company-level consumer wants the shared wiki's content
model AND its own governance/audit posture. The `governance:` rebind here is the
legal/audit control surface — a parent that allows it lets the company police
its own publications; a parent that locks `governance:` (via an AIP-7 policy)
keeps the shared standard intact. Inherited from parent: `Concept` entity type,
lint `broken-ref`, `sources.*`, `display.*`. Inherited then extended: `Person`
(fields union), lint `require-source` (now also applies to `Investor`). Added by
this view: `Investor` entity type, lint `investor-meeting-recency`,
`governance:` binding, `metadata.acme.*`.

---

## Example 11 — Multi-level extends (org → team → operator)

Three-level chain. The org publishes a base workspace. A team inside the org
extends it (different conflict resolution, extra entity type). An operator
inside the team extends the team view (different tone, narrower scope). The
operator's effective config is the result of merging all three.

**Level 1** — `<org>/research-wiki/KNOWLEDGE.md` (the same as
[Example 8](#example-8--workspace-root-manifest-knowledgemd) above).

**Level 2** — `<org>/teams/finance/KNOWLEDGE.md`:

```md
---
schema: knowledge.workspace/v1
name: finance-team-view
title: Finance team view
description:
  Finance team's lens. Adds Deal as a first-class entity type and switches
  conflict resolution to recency.
version: 1.0.0

extends: ../../research-wiki/KNOWLEDGE.md

entityTypes:
  - name: Deal
    icon: 📊
    fields: [counterparty, stage, value, owner, closed_at]
    description: A finance transaction tracked by the team.

curation:
  conflictResolution: recency # overrides parent 'defer'

queryHints:
  scopeTo: [Concept, Deal]
---

# Finance team view
```

**Level 3** — `<org>/teams/finance/operators/cfo-assistant/KNOWLEDGE.md`:

```md
---
schema: knowledge.workspace/v1
name: cfo-assistant-view
title: CFO assistant view
description:
  CFO assistant operator's lens. Sales-tone, deep depth, scoped to Deals only.
version: 0.3.0

extends: ../../KNOWLEDGE.md # the team view, NOT the workspace root

appliesTo:
  - ws://operators/cfo-assistant

curator: ws://operators/cfo-assistant

curation:
  tone: sales # overrides team's inherited 'neutral'
  depth: deep # overrides parent 'medium'

queryHints:
  scopeTo: [Deal] # narrows team's [Concept, Deal]
---

# CFO assistant view
```

**Effective config** (after merging all three):

| Field                            | Source               | Value                                                                                        |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `entityTypes`                    | merged: levels 1 + 2 | `Concept` (from L1), `Person` (from L1), `Deal` (added by L2)                                |
| `lints`                          | inherited from L1    | `require-source`, `max-age-90`, `broken-ref`                                                 |
| `sources.*`                      | inherited from L1    | `retention: forever`, `signing: optional`, `hashAlgo: sha256`, `authorityDefault: secondary` |
| `curation.tone`                  | overridden by L3     | `sales`                                                                                      |
| `curation.depth`                 | overridden by L3     | `deep`                                                                                       |
| `curation.autoLink`              | inherited from L1    | `byName`                                                                                     |
| `curation.conflictResolution`    | overridden by L2     | `recency`                                                                                    |
| `queryHints.preferRecent`        | inherited from L1    | `true`                                                                                       |
| `queryHints.preferAuthoritative` | inherited from L1    | `false`                                                                                      |
| `queryHints.scopeTo`             | replaced by L3       | `[Deal]`                                                                                     |
| `display.defaultGrouping`        | inherited from L1    | `kind`                                                                                       |
| `curator`                        | overridden by L3     | `ws://operators/cfo-assistant`                                                               |
| `appliesTo`                      | local to L3          | `[ws://operators/cfo-assistant]`                                                             |

**When to use.** Multi-level chains demonstrate that the registry-of-views
pattern is real, not aspirational. The org publishes a stable wiki shape; teams
adapt it without forking; per- operator views narrow further. Each level is
small (a handful of overrides) because everything not overridden is inherited
mechanically. The depth cap of eight is rarely hit in practice; two-to-three
levels is the common case.

The host's debug surface for the L3 view returns the resolution chain
`[L1, L2, L3]` and the merged config above. A reviewer auditing why `tone` is
`sales` walks the chain and finds the L3 override; auditing why `Deal` exists
walks the chain and finds the L2 addition.

---

## Anti-patterns to avoid

- **Editing a `sources/` file in place** — spec violation; the host MUST refuse.
  To correct a source, append a new one and set `superseded_by` on the old one's
  registry record. The bytes stay.
- **Citing sources by path instead of id** in an entry's `sources[]` — paths
  drift on rename or fork; ids don't. Always cite by id.
- **Inline links from entry bodies into `sources/`** — entries cite sources via
  the `sources[]` frontmatter, not via inline `[label](sources/foo.md)` links.
  The lint pass flags inline source links as `link_inline_to_source`.
- **Dropping a contradicting claim silently** — when sources disagree and the
  schema's contradiction policy doesn't resolve it, set `contradicts: [...]` on
  both entries and keep both claims with sources cited. Audit > tidiness.
- **Empty `sources: []` on a `kind: summary` entry** — summaries are by
  definition derived from a source. Empty sources here is a spec bug.
- **Forgetting to regenerate `_index.md`** after writing entries — the next lint
  pass will surface every newly-written entry as an orphan, since `_index.md` is
  one of the inbound-link sources.
- **`updated_at` not bumped** — the host MAY accept the write, but stale-claim
  detection breaks. Always bump.
- **Forking without recording the parent in `_log.md`** — the parent provenance
  is what makes the fork comparable; a parentless fork is just "another wiki".
- **Editing the parent `KNOWLEDGE.md` to fix one consumer's lens** — if a single
  operator wants academic tone, the change goes in _that operator's view_, not
  in the workspace root. Edits to the root affect every consumer that doesn't
  override the same field. Reach for `extends:` first, mutate the root last.
- **Setting `appliesTo` without `extends`** — a manifest with `appliesTo` but no
  `extends` is a workspace-root that claims to bind to a consumer. The schema
  rejects this; the host emits `knowledge_workspace_invalid`. Either drop
  `appliesTo` (it's a root) or add `extends` (it's a view).
- **Pointing `extends:` at a workspace in another wiki tree** — composition is
  expected to walk a single repository's tree. A cross-wiki `extends:` works
  mechanically but means the merged config depends on a file the host can't
  audit alongside the consumer; reviewers can't diff what they can't reach. If
  you need shared shape across wikis, factor the shared bits into a small
  workspace package and have both wikis `extends:` it locally.

## See also

- [AIP-10 — agentknowledge/v1 spec](/docs/aip-10)
- [AIP-1 — agent.json](/docs/aip-1)
- [AIP-2 — capability surface](/docs/aip-2)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./SKILL.md`](./SKILL.md) — agent-side curation skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./KNOWLEDGE.schema.json`](./KNOWLEDGE.schema.json) — frontmatter validator
  (entry + source)
