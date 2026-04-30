# ADAPTER.md — implementing AIP-11 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, distill, retrieve, and inject** AIP-11
[`LESSON.md`](/docs/aip-11) files. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a framework or runtime author — someone exposing `defineLesson`
and the distill/retrieve hooks to a tool agent. Lesson authors themselves should
read [`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities:

1. **Load** — read `lessons/*.md`, validate frontmatter against
   [`./LESSON.schema.json`](./LESSON.schema.json), build the in-memory bank.
2. **Distill** — after every completed run, evaluate existing lessons against
   the run, then propose 0..N candidate new lessons from the trajectory. Persist
   updates and new lessons.
3. **Retrieve** — before each agent generation, select top-K lessons whose
   triggers match the current request and inject them into the prompt under a
   clearly labelled section.
4. **Govern** — enforce supersession, TTL, conflict resolution, and the security
   guards described below. Route errors through the standard envelope.

`defineLesson` is the boundary between the host and the lesson author when
lessons are loaded as code rather than markdown. Hosts that load only
`LESSON.md` files do not strictly need it; hosts that support both forms MUST
keep the two paths semantically identical.

## `defineLesson` — the entry-point function

### Required behaviour

A host that implements `defineLesson` MUST:

1. **Accept the `LessonDefinition` shape** documented in
   [AIP-11 § LESSON.md shape](/docs/aip-11#lessonmd-shape). Every field listed
   in the schema MUST be honoured.
2. **Reject author-supplied counts as authoritative.** `successCount` and
   `failureCount` on incoming definitions are _initial values_ only. After the
   lesson is admitted, only the host updates them (from observed outcomes). This
   is the confidence-laundering guard from the AIP-11 security section.
3. **Validate evidence.** Each evidence entry MUST resolve to a real run, audit,
   conversation, work item, or wiki page in the host's own indices. Lessons that
   cite non-resolvable evidence MUST be refused; "evidence" without provenance
   is not evidence.
4. **Enforce uniqueness by slug.** Two lessons cannot share a slug. A
   `defineLesson` call with an existing slug is interpreted as an _update_
   (counts incremented, evidence appended) — never a silent overwrite of body or
   trigger. Body/trigger changes require explicit supersession (see below).

### Optional behaviour

A host MAY:

- Re-export `defineLesson` under host-idiomatic aliases (`createLesson`,
  `lesson`, `registerLesson`). The canonical name MUST be present.
- Accept richer trigger predicates (regex, semantic-similarity thresholds) under
  `trigger.metadata.<host>`. Standard fields MUST NOT be redefined.
- Compute and cache embeddings for triggers and evidence notes; these caches
  MUST NOT leak back into the on-disk LESSON.md (mirrors AIP-10's stance).

## Distillation pipeline

The distillation pipeline runs **after a run completes** — never during the run.
Running it in-flight would blur lesson provenance and could create lessons that
cite themselves.

### Inputs

- The completed run `R` (trajectory, tool calls, outcomes).
- The current lesson bank.
- Any audit records from AIP-7 attached to `R`.

### Steps

1. **Replay-match.** Walk `R` against the lesson bank. For every lesson whose
   `trigger` matched some turn in `R`:
   - If the lesson's recommendation was followed and `R` succeeded:
     `successCount += 1`.
   - If the recommendation was followed and `R` failed: do not decrement
     `successCount`; instead append an evidence entry of kind `run` with a
     failure note and let the conflict-resolution pass below decide.
   - If the recommendation was contradicted and `R` succeeded:
     `failureCount += 1`.
2. **Propose candidates.** Run the host's distill judge (typically an
   LLM-as-judge prompted with `R`'s trajectory) to extract 0..N candidate
   lessons. Each candidate MUST come back with a slug suggestion, a one-sentence
   imperative title, a trigger description, and at least one evidence pointer
   back into `R`.
3. **Deduplicate.** For each candidate, check the existing bank by slug
   similarity (Levenshtein, lemma overlap) AND trigger overlap (tag
   intersection, target intersection). A duplicate candidate updates the
   existing lesson — appending evidence — rather than creating a parallel file.
4. **Admit new lessons.** Survivors of dedup are written to disk as new
   `LESSON.md` files with `confidence: 0.5`, counts initialised from `R` alone,
   and `evidence` pointing to `R`.
5. **Conflict-resolution.** See section below.
6. **Index regeneration.** Rewrite `lessons/_index.md`.

### Success vs failure handling

Failure runs are first-class lesson sources. Specifically, the distill pipeline:

- MUST permit a lesson with `outcome: failure`, `successCount: 0`,
  `failureCount: 1` from a single failed run. AIP-11 explicitly blesses
  single-failure lessons.
- SHOULD prefer extracting _counter-example_ lessons ("avoid X when Y") from
  failures over restating success patterns. Counter- examples generalise as well
  or better than positive ones in practice.
- SHOULD attach an AIP-7 audit reference under `evidence` whenever the failure
  tripped a governance gate, so the lesson's provenance threads through to the
  audit record.

## Trigger matching (retrieve contract)

Before the agent generates a turn, the host SHOULD select top-K lessons whose
triggers match the current request.

### Match function

The match function takes (incoming request, lesson) and returns a score in
`[0, 1]`. A reference implementation:

1. **Targets check (gate, not score).** If `trigger.targets` is non-empty, the
   request's operator/role/skill MUST match at least one target. No match →
   score 0, do not consider further.
2. **Tag overlap.** If the lesson has tags, score the intersection between
   request keywords (or the host's classified tags for the request) and
   `trigger.tags`. Pure tag-OR is too loose — AIP-11 recommends tag overlap AND
   target match.
3. **Semantic similarity.** OPTIONAL. Embed the request and the
   `trigger.description`; cosine similarity becomes a tiebreaker.
4. **Confidence + counts.** Multiply by `confidence` and by
   `(successCount - failureCount + 1) / (successCount + failureCount + 1)`.
   Lessons with more failures than successes get presented as _cautions_, not
   guidance — they are not excluded outright.
5. **TTL gate.** If `expires_at` is past, score 0 unless the host is in
   archival-read mode.

The host caps the result at K (typical: 3..7) to bound prompt budget. Caps
prevent trigger-overbroadening attacks.

### Injection format

Selected lessons are injected into the operator's prompt under a clearly
labelled section:

```
Lessons from past experience:

- [success, c=0.8] Verify the page identifier before clicking Load
  More — multi-page list views can return stale results when a
  fresh page id is not re-read.
- [failure, c=0.6] Avoid summarising customer transcripts before
  the full transcript has loaded.
```

The label is normative — the underlying agent must be able to distinguish
lessons from instruction. Hosts MAY enrich the format (citations,
expand/collapse) but MUST keep the labelled boundary.

## Conflict resolution

Two lessons conflict when their triggers overlap and their advice points in
opposite directions ("always do X" vs "never do X" for the same trigger).
Conflicts are not bugs; they often signal that the world is more conditional
than the original distillation captured.

Resolution policy:

1. **Detect at admit time.** When admitting a new lesson, the distill pipeline
   MUST check whether the new advice contradicts any existing lesson with
   overlapping `trigger.tags` _and_ overlapping `trigger.targets`. The detector
   is host-defined (often a second LLM-as-judge pass).
2. **Do not delete.** Conflicting lessons co-exist on disk. The host MAY mark
   one as `outcome: mixed` and the conflicting peer as `supersedes: [<slug>]`,
   but it MUST NOT silently drop either.
3. **At retrieve time.** When two surviving lessons match the same request, the
   host SHOULD inject both, labelled as conflicting. The agent decides; the
   prompt makes the conflict legible.
4. **Promote to mixed.** If a lesson accumulates roughly equal success and
   failure counts (within a host-defined band), the host SHOULD update its
   `outcome` to `mixed` so retrieval presents it as conditional rather than
   directive.

This is the part of the contract that most implementations get wrong: silently
overwriting a lesson with a contradictory new one destroys provenance and
recreates the same conflict on the next run.

## Supersession & retirement

Supersession is **explicit, never silent.** A new lesson `B` may mark older
lesson `A` with `supersedes: [<slug-A>]`. Then:

- `A` MUST be excluded from default retrieval.
- `A` MUST remain on disk; its evidence is part of the audit trail.
- `A`'s `_log` (host-maintained metadata, not on-disk frontmatter) records the
  supersession event with timestamp and `B`'s slug.
- `B`'s body SHOULD explain _why_ it supersedes `A` so a future reader can
  reconstruct the reasoning.

Retirement (no replacement) happens via TTL:

- `expires_at` is a soft TTL. Past it, retrieval treats the lesson as absent by
  default.
- A lint pass MAY archive expired lessons (move to `lessons/_archive/`) but MUST
  NOT delete them.
- A lesson whose `failure_count` materially exceeds its `success_count` over a
  host-defined window SHOULD trigger a review notification — not
  auto-retirement; humans make the call.

## Loader rules

The lesson bank MUST be safely loadable as a side-effect-free operation:

- **No I/O during parse.** Parsing `LESSON.md` reads the file and validates the
  schema. Resolving evidence references happens separately, on demand.
- **Idempotent.** Loading the same `lessons/` folder twice in a row produces the
  same in-memory bank.
- **Stable order.** Lessons are loaded in a deterministic order (slug-sorted by
  default). Retrieval relies on stable ordering for reproducibility under
  tracing.

## Error envelope

Errors leave the host as:

```ts
type LessonResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        retryable?: boolean
        cause?: unknown
      }
    }
```

`code` SHOULD use the AIP-11 vocabulary plus shared codes from the agentproto
error namespace:

| Code                      | Meaning                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `lesson_invalid`          | Frontmatter failed schema validation.                        |
| `slug_collision`          | Two lessons share a slug; admitting refused.                 |
| `evidence_unresolvable`   | An evidence ref does not resolve.                            |
| `supersedes_missing`      | `supersedes` cites a slug that does not exist.               |
| `confidence_out_of_range` | `confidence` outside `[0, 1]`.                               |
| `trigger_overbroad`       | Host-side guard rejected an excessively broad trigger.       |
| `expired`                 | Retrieval requested an expired lesson outside archival mode. |
| `internal`                | Host-side bug; not the lesson's fault.                       |

Hosts piping errors to a tracing backend SHOULD emit `code` as a span attribute
keyed `lesson.error.code` so error budgets aggregate cleanly across runtimes.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name             | Manifest format  |
| ----------------------- | ------------------------- | ---------------- |
| TypeScript / JavaScript | `defineLesson`            | LESSON.md or .ts |
| Python                  | `define_lesson`           | LESSON.md or .py |
| Go                      | `DefineLesson`            | LESSON.md or .go |
| Rust                    | `define_lesson` (free fn) | LESSON.md or .rs |

A lesson on disk as `LESSON.md` is loadable by any host. Code-form entries are
loadable only by their own runtime.

## Security guards

AIP-11's security section
([§ Security Considerations](/docs/aip-11#security-considerations)) lists four
threats. Hosts MUST implement at least the following mitigations:

- **Lesson injection.** All admit paths (LLM-distilled, code-form,
  hand-authored) MUST flow through schema validation and evidence resolution.
  High-impact lessons (broad targets, no TTL) SHOULD require AIP-7 governance
  approval.
- **Confidence laundering.** As noted above, author-supplied counts are
  non-authoritative. The host overwrites them on first observation.
- **Trigger over-broadening.** The retrieve match function MUST apply the
  targets gate before the tag score, and MUST cap K.
- **Stale lesson rot.** TTL is honoured by default; lint passes SHOULD archive
  expired lessons; failure-dominant lessons SHOULD trigger review.

## Registration test

A conforming host SHOULD provide a `validate(lessonsPath)` helper that:

1. Loads every `*.md` under `lessonsPath`, skipping `_index.md` and `_archive/`.
2. Validates each against `LESSON.schema.json`.
3. Resolves every `evidence.ref` against host indices.
4. Verifies all `supersedes` slugs exist.
5. Reports the first failure with file + field path.

This is the standard "is this lesson bank loadable?" handshake.

## What this guide does NOT cover

- The host's persistence model (in-memory bank, DB, distributed registry).
- The host's distill judge (LLM, prompt design, evals).
- Per-operator lesson banks vs guild-wide banks (host policy).
- UI for surfacing lessons in human-readable dashboards.

These are runtime-policy concerns and stay out of the spec.

## See also

- [AIP-11 — LESSON.md spec](/docs/aip-11)
- [AIP-7 — governance, audit, evidence anchors](/docs/aip-7)
- [AIP-10 — knowledge / wiki pages (sibling, declarative)](/docs/aip-10)
- [AIP-12 — prompt evolution / playbook (sibling, prompt-side)](/docs/aip-12)
- [`./LESSON.schema.json`](./LESSON.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
