# ADAPTER.md — implementing AIP-51 (Knowledge Lenses) in a host runtime

This document is the implementer's guide for any runtime that wants to expose
**multi-aspect distillation** on top of an [AIP-10](/docs/aip-10) corpus.
It is normative for the parts marked MUST and informative for the parts marked
SHOULD.

AIP-51 builds on AIP-10 without replacing it. A corpus stays a corpus; a Lens
is a named projection over its shared source pool.

---

## The problem Lenses solve

Sources are captured once (conversations / files / web → immutable `sources/`).
Without lenses, distillation is a single, undifferentiated pass: every source
yields generic "durable insight" entries that mix company strategy, technical
decisions, marketing positioning, and engineering patterns into one flat pile.

A **Lens** tells the distiller *what to look for* and *how those findings live
over time*. The same sources read under a "marketing" lens and a "technical"
lens produce two independent, faceted entry sets — each queryable by its own
`aspect:` tag.

---

## Core concepts

### Lens

A Lens is pure data — no code, no side effects. Its fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Stable, e.g. `"marketing"`. The ledger key. |
| `label` | `string` | yes | Human display name. |
| `prompt` | `string` | yes | Extraction instruction prepended to the base distill prompt. |
| `aspect` | `string` | no | Facet value; defaults to `id` when absent. |
| `kinds` | `RefinedKind[]` | no | Constrains which entry kinds the lens may emit. |
| `mode` | `"log" \| "synthesis"` | yes | How the lens's extraction lives over time (see below). |
| `sourceSelector` | `SourceSelector` | no | Which sources feed it; defaults to `{ kind: "all" }`. |
| `synthesisPath` | `string` | no | Corpus-relative path for the consolidated artifact (`mode:"synthesis"` only). |

### The two modes

**`log` — append-only extraction.** The atoms ARE the artifact. Nothing is ever
rebuilt from them; the lens accumulates entries like a diary or changelog. Use
this when *history* is the product.

**`synthesis` — re-derived living artifact.** Atoms are supersedes-aware; a
consolidated document at `synthesisPath` is rolled up from the *current*
(non-superseded) atoms and rewritten whenever a new decision lands. Use this
when you want the *current state* of a domain (positioning, architecture,
policy).

The distinction is the heart of the design. Choosing the wrong mode produces
either a ever-growing wall of superseded decisions (`synthesis` as `log`) or a
synthesis document that silently reflects stale state (`log` as `synthesis`).

### Faceted tagging

Every entry produced by a lens is stamped with the tag `aspect:<aspect>` (e.g.
`aspect:marketing`). This is the query key: consumers filter `tags` for the
aspect to get the lens's full atom set. The tag MUST be present on every entry
written by that lens; a host MUST NOT strip it.

### The `(source, lens)` composite key

The same source distilled under two different lenses produces two independent
entry sets with two independent cadence records. The DistillIndex (see below)
MUST key records by `(sourceId, lensId)`, not by `sourceId` alone.

---

## DistillIndex — the persistent ledger

The host MUST maintain a `_distill-index.yaml` sidecar at the corpus root. It
is an append-upsert ledger keyed by `(sourceId, lensId)`.

### Purpose

The entry scan alone (scanning `entries/` for `sources:` backlinks) answers
only a boolean ("has this source any entry?") and loses the *cadence*: when it
ran, with which engine, how many entries it produced, the source's content hash
at the time. The ledger records that, enabling:

- **Content-hash skipping** — re-distill only when the source changed.
- **Auditable history** — the corpus carries a git-diffable distillation log.
- **Cost/coverage queries** — queryable without re-reading every entry.

### Shape

```yaml
runs:
  - sourceId: "s-acme-pitch-deck"
    lensId: "marketing"           # absent = generic lens-less pass
    title: "Acme pitch deck"
    distilledAt: "2026-06-19T14:30:00Z"
    engine: "claude-code"
    contentHash: "sha256:abc..."
    entryCount: 7
    entryPaths:
      - "entries/principles/market-fit-signal.md"
      - "entries/patterns/vc-objection-pattern.md"
  - sourceId: "s-acme-pitch-deck"
    lensId: "technical"
    title: "Acme pitch deck"
    distilledAt: "2026-06-19T14:32:00Z"
    engine: "claude-code"
    contentHash: "sha256:abc..."
    entryCount: 3
    entryPaths: [...]
```

### Invariants

- **Atomic writes.** The host MUST write the entire file atomically (read → mutate → write). Partial
  writes corrupt the ledger.
- **Upsert semantics.** Re-distilling a `(sourceId, lensId)` pair MUST overwrite that row (latest
  run wins) while leaving the same source's *other* lens rows untouched.
- **No delete.** Rows are never deleted; they accumulate. Tombstoning a source is done by marking
  the source entry in AIP-10, not by deleting ledger rows.
- **`lensId` absent = generic.** A lens-less distillation run omits `lensId` (or sets it to
  `undefined`). That row shares the key space cleanly with any future lens run over the same source.

### Content-hash skipping

Before distilling a source, the host SHOULD:

1. Load the ledger record for `(sourceId, lensId)`.
2. Compute the current source's content hash.
3. If `record.contentHash === currentHash`, skip — the source has not changed since the last run.

The host MUST NOT skip when `contentHash` is absent from the record (first run, or an engine that
didn't record hashes).

---

## Synthesis mode — the re-derived artifact

### What "current" means

The current atoms of a lens are the entries that:

1. Are tagged `aspect:<lens>` (produced by this lens).
2. Are not archived (`metadata.corpus.status !== "archived"`).
3. Are not the prior synthesis artifact itself (do not carry the tag `role:synthesis`).
4. Are not superseded — no other entry in the corpus lists their `slug` in its `supersedes:` field.

The `role:synthesis` guard is the critical invariant: the synthesis artifact
MUST NOT feed on its own output across rebuilds. A host that includes the prior
artifact in the atom read will produce a compounding hallucination.

### Artifact placement

The artifact is an AIP-10 `knowledge.entry/v1` entry at `lens.synthesisPath` (or
`entries/summaries/<aspect>-knowledge.md` when absent). It MUST carry:

```yaml
schema: knowledge.entry/v1
kind: summary
tags:
  - "aspect:<aspect>"   # the lens's facet tag
  - "role:synthesis"    # the rebuild guard
sources:
  - "<slug-of-atom-1>"  # the atom slugs fed to this synthesis
  - "<slug-of-atom-2>"
  - ...
metadata:
  corpus:
    lens: "<lens-id>"
```

The `sources:` field MUST list the atom *slugs* (not source ids). This is the
staleness detection surface (see § Staleness detection).

### Staleness detection

The synthesis artifact is stale when the *current* atom set (slugs) differs from
the set recorded in the artifact's `sources:` field. The host SHOULD expose a
`lensSynthesisStale(lens)` predicate that:

1. Reads the current atom set (slugs).
2. Reads the artifact's `sources:` field.
3. Returns `{ stale: boolean, reason: "missing" | "drifted" | "fresh" }`.

This is timestamp-free and deterministic — preferred over time-based staleness.

### Rebuild triggers

The host SHOULD rebuild the synthesis artifact when:

- A new atom tagged with `aspect:<lens>` is written.
- An existing atom's `supersedes:` list changes (a decision was reversed).
- The caller explicitly requests a rebuild (on-demand from the operator UI or
  a scheduled routine).

The host MUST NOT auto-rebuild on every distill run if the atom set has not
changed (staleness check first).

### No-op when empty

If the current atom set is empty (no atoms for this lens), the host MUST NOT
write the synthesis artifact. A synthesis over zero atoms is meaningless.
Return `{ wrote: false }`.

---

## DistillPort — the LLM boundary

The kit MUST NOT import any LLM SDK. Distillation is performed through the
`DistillPort` interface:

```ts
interface DistillPort {
  distill(input: {
    title: string
    body: string
    tags?: readonly string[]
    kinds?: readonly RefinedKind[]
    instruction?: string   // the lens's prompt, prepended to the base pass
  }): Promise<readonly DistilledItem[]>
}
```

`instruction` is the lens's `prompt` field. The host-supplied implementation
prepends it to its own base extraction prompt. The kit does not prescribe the
full prompt — only the `instruction` that varies per lens.

### SynthesisPort — the LLM boundary for synthesis

Similarly, synthesis is performed through:

```ts
interface SynthesisPort {
  synthesize(input: {
    aspect: string
    label: string
    atoms: readonly { slug: string; title: string; body: string }[]
  }): Promise<string>  // consolidated markdown body
}
```

The host injects both ports at runtime. No model import leaks into the corpus kit.

---

## Lens registry

The host registers lenses in a `DistillRegistry`. A lens entry (a
`DistillDescriptor`) may be:

- **A concrete lens** — the `Lens` object directly, registered as a `kind:
  "lens"` descriptor.
- **A named descriptor** — an existing descriptor variant (importer-specific)
  that's augmented with a lens before running.

The registry is queried at distill time to:

1. Look up the lens by id.
2. Thread the lens's `prompt` as `instruction` into the `DistillInput`.
3. Stamp `aspect:<aspect>` on every output entry's `tags`.
4. Record the `lensId` in the DistillIndex entry.

### Example registration

```ts
import { createDistillRegistry } from "@agentproto/corpus"
import type { Lens } from "@agentproto/corpus/distill"

const MARKETING_LENS: Lens = {
  id: "marketing",
  label: "Marketing & Positioning",
  prompt: "Extract positioning claims, ICP signals, messaging decisions, and competitive differentiators.",
  mode: "synthesis",
  synthesisPath: "entries/summaries/marketing-knowledge.md",
}

const registry = createDistillRegistry({
  lenses: [MARKETING_LENS],
  importers: [conversationImporter],
})
```

---

## Filesystem layout additions

AIP-51 adds two artefacts to the AIP-10 corpus tree:

```
<corpus-root>/
├── KNOWLEDGE.md
├── _distill-index.yaml          # NEW — DistillIndex ledger
├── sources/
├── entries/
│   ├── summaries/
│   │   └── marketing-knowledge.md  # NEW — synthesis artifact (mode:synthesis)
│   └── ...
└── ...
```

The `_distill-index.yaml` sidecar MUST be tracked in version control alongside
the corpus. It is part of the audit trail.

The synthesis artifact at `synthesisPath` is derived state — it SHOULD be
version-controlled but marked as auto-generated in `.gitattributes` or
equivalent. It MUST NOT be manually edited.

---

## Source selector contract

The `sourceSelector` on a Lens determines which sources feed it:

| Kind | Behaviour |
|---|---|
| `{ kind: "all" }` | All sources in `sources/`. Default. |
| `{ kind: "tag", tag: "internal" }` | Sources whose frontmatter `tags` include `"internal"`. |
| `{ kind: "prefix", prefix: "conv-" }` | Sources whose id starts with `"conv-"`. |

P1 ships `"all"`. Tag and prefix selectors land in later iterations.

---

## Error codes

| Code | Meaning |
|---|---|
| `lens_not_found` | Referenced lens id not registered. |
| `lens_synthesis_path_missing` | `mode:"synthesis"` lens has no `synthesisPath` and no default could be derived. |
| `distill_index_write_failed` | Atomic write of `_distill-index.yaml` failed. |
| `synthesis_no_atoms` | Synthesis called but no current atoms exist (no-op, not an error — surface as `{ wrote: false }`). |
| `synthesis_port_missing` | `mode:"synthesis"` lens triggered but no `SynthesisPort` injected. |

---

## Conformance checklist

A conforming implementation MUST:

- [ ] Stamp `aspect:<aspect>` on every entry produced by a lens.
- [ ] Record `(sourceId, lensId)` in `_distill-index.yaml` after every distill run.
- [ ] Upsert the record, not append (latest run for a `(source, lens)` pair wins).
- [ ] Skip a `(source, lens)` pair when its content hash matches the ledger record.
- [ ] For `mode:"synthesis"`: exclude `role:synthesis` entries from the atom read.
- [ ] For `mode:"synthesis"`: write `sources:` as atom slugs in the artifact.
- [ ] For `mode:"synthesis"`: check staleness before rebuilding.
- [ ] For `mode:"synthesis"`: no-op when the current atom set is empty.
- [ ] Never import an LLM SDK — use the injected `DistillPort` / `SynthesisPort`.

---

## See also

- [AIP-10 — agentknowledge/v1 corpus spec](/docs/aip-10)
- [AIP-10 ADAPTER.md](../aip-10/draft/ADAPTER.md) — the corpus host contract (writerPort.pushSource)
- [AIP-12 — playbook overlays](/docs/aip-12)
- [Reference impl: `@agentproto/corpus` distill/lens.ts, distill/distill-index.ts, distill/synthesize.ts]
