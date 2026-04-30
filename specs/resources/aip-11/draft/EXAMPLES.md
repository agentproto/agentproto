# EXAMPLES.md — LESSON.md reference patterns

Reference `LESSON.md` files exemplifying common shapes a runtime might produce
or a human curator might write. Each example is a self-contained file a host
could load as-is. Authors should copy the closest pattern and edit fields rather
than draft from scratch.

## Patterns covered

1. [Lesson from a successful run](#example-1--lesson-from-a-successful-run)
2. [Lesson from a single failure](#example-2--lesson-from-a-single-failure)
3. [Lesson with narrow scope (specific operator)](#example-3--lesson-with-narrow-scope-specific-operator)
4. [Lesson with broad scope (whole role)](#example-4--lesson-with-broad-scope-whole-role)
5. [Lesson superseding another (retirement)](#example-5--lesson-superseding-another-retirement)
6. [Lesson with conflicting evidence (mixed outcome)](#example-6--lesson-with-conflicting-evidence-mixed-outcome)
7. [Lesson distilled across many runs](#example-7--lesson-distilled-across-many-runs)

---

## Example 1 — Lesson from a successful run

A success-derived lesson. The agent did something specific that made the run
succeed; the lesson captures the _behaviour_, not the narrative.

```md
---
schema: learning/v1
slug: cite-source-url-in-research-summaries
title: Always cite the source URL inline when summarising third-party research.
trigger:
  description:
    The user asks for a research summary of an external article, paper, or doc.
  tags: [research, summarisation, citations]
outcome: success
evidence:
  - kind: run
    ref: r_2026-04-22_8c1d4f
    note:
      User explicitly thanked agent for "easy-to-verify links" in the summary.
  - kind: audit
    ref: aud_2026-04-22_8c1d4f_ok
    note: Approval audit recorded zero unverifiable claims.
confidence: 0.7
success_count: 1
failure_count: 0
---

# Always cite the source URL inline when summarising third-party research.

## When this applies

The user asks for a summary of an external document and a clean citation trail
materially changes whether the summary is trusted and re-used.

## What to do (or avoid)

- After every claim that is not common knowledge, include the source URL inline
  as a markdown link.
- Prefer one-link-per-claim over a single bibliography at the end.
- If a claim has no resolvable source, mark it explicitly with _(unsourced)_
  rather than dropping the citation altogether.

## Counter-example

In an earlier run the agent dropped citations for brevity and the user re-asked
the same question two days later because the summary was unverifiable. This
lesson encodes the fix.
```

**When to use** — a run succeeded _because_ of a specific behaviour the agent
could have skipped. Capture the behaviour, not the topic.

---

## Example 2 — Lesson from a single failure

Failure-only lessons are first-class. `success_count: 0`, `failure_count: 1`,
`outcome: failure` — and the body is a counter-example.

```md
---
schema: learning/v1
slug: verify-page-id-before-load-more
title: Verify the page identifier before clicking "Load More" twice in a row.
trigger:
  description:
    Multi-page list view in a browser-automation context with a Load More
    button.
  tags: [pagination, ui-automation, browser]
outcome: failure
evidence:
  - kind: run
    ref: r_2026-04-21_a3f2e9
    note:
      Agent clicked Load More twice; second click returned the same page because
      the page id had not advanced.
  - kind: audit
    ref: aud_2026-04-21_a3f2e9_fail
    note: Failure audit recorded "stale-page" anomaly.
confidence: 0.5
success_count: 0
failure_count: 1
---

# Verify the page identifier before clicking "Load More" twice in a row.

## When this applies

Any browser-automation task with a "Load More" / "Show More" button that
paginates a list. The page identifier (URL hash, query param, or DOM attribute)
is the only reliable indicator that the new page loaded.

## What to do (or avoid)

- Before clicking Load More a second time, read the page identifier and confirm
  it advanced from the prior click.
- If the identifier did not advance, wait and re-read; do not click again.
- Avoid relying on visual cues (spinner gone, list scrolled) — those can fire
  while the underlying page is stale.

## Counter-example

In `r_2026-04-21_a3f2e9` the agent clicked Load More twice in quick succession.
The second click fired before the first had committed; the visible list looked
longer but the underlying data was still page 1. The agent then summarised page
1 twice and missed the records on page 2. The user spotted the gap.
```

**When to use** — a single run failed and the failure has a clear, nameable
cause that another run could repeat. Do not wait for a second failure to
"confirm" — counter-examples generalise on their own.

---

## Example 3 — Lesson with narrow scope (specific operator)

Scoped to one operator. Other operators ignore this lesson at retrieval; the
targets gate filters them out before tag scoring.

```md
---
schema: learning/v1
slug: marketing-lead-shorten-subject-lines
title:
  Keep email subject lines under 50 characters when drafting for the
  marketing-lead operator.
trigger:
  description:
    The marketing-lead operator is drafting an outbound email subject.
  tags: [email, copywriting, subject-line]
  targets:
    - operator: marketing-lead
outcome: success
evidence:
  - kind: run
    ref: r_2026-04-19_3e7a11
    note: Subject under 50 chars; open rate +18% vs operator's prior baseline.
  - kind: work-item
    ref: wi_q2-newsletter-09
    note:
      Work item retrospective explicitly cited the shorter subject as the win.
confidence: 0.6
success_count: 3
failure_count: 0
---

# Keep email subject lines under 50 characters when drafting for the marketing-lead operator.

## When this applies

The marketing-lead operator is drafting subject-line copy for an outbound
campaign. Other operators (sales, ops) have different subject-line norms and
should not have this lesson injected.

## What to do (or avoid)

- Hard cap subject at 50 characters.
- Lead with a verb when possible.
- Avoid emojis in the subject — they were neutral-to-negative in this operator's
  audience tests.

## Counter-example

A `r_2026-03-30_fe22a4` run ignored the cap (subject = 78 chars) and the
campaign open rate dropped 11%. Lesson reinforced.
```

**When to use** — the lesson is real, but it only generalises within a narrow
context. Scoping prevents the lesson from polluting unrelated operators'
prompts.

---

## Example 4 — Lesson with broad scope (whole role)

Scoped at the role level — applies to every operator playing the "researcher"
role. Broader than Example 3 but still narrower than "all agents."

```md
---
schema: learning/v1
slug: researcher-cross-check-numerical-claims
title:
  Cross-check numerical claims against at least two independent sources before
  stating them.
trigger:
  description:
    The agent is producing a research artifact and is about to state a numerical
    claim (statistic, dollar figure, percentage).
  tags: [research, claims, verification]
  targets:
    - role: researcher
outcome: success
evidence:
  - kind: run
    ref: r_2026-04-18_b2d8c0
    note: Cross-checked CAGR figure; caught a typo in the primary source.
  - kind: run
    ref: r_2026-04-20_71e5a2
    note: Cross-check surfaced a stale figure from a 2023 report.
  - kind: wiki-page
    ref: wiki/research/numerical-claims-policy
    note: Internal policy page that motivated the discipline.
confidence: 0.75
success_count: 5
failure_count: 0
---

# Cross-check numerical claims against at least two independent sources before stating them.

## When this applies

Any researcher-role task that produces an artifact containing numerical claims
read by humans (briefs, decks, memos). Does not apply to internal scratch
outputs.

## What to do (or avoid)

- Identify each numerical claim in the draft.
- For each, find a second source from a non-overlapping origin (different
  publisher, different methodology if possible).
- Cite both sources inline.
- If a second source cannot be found, mark the claim _(single- source)_ and flag
  it for human review rather than silently removing it.

## Counter-example

In an early researcher run a CAGR figure was lifted from a single analyst report
and turned out to be a typo. The cross-check discipline catches that class of
error.
```

**When to use** — the lesson generalises across an entire role's work. Use
sparingly: broader scope means more retrieval surface and more chances of
trigger over-match. Cap with tight tags.

---

## Example 5 — Lesson superseding another (retirement)

A new lesson explicitly supersedes an older one. The older lesson remains on
disk for audit; retrieval excludes it by default.

```md
---
schema: learning/v1
slug: prefer-batch-embed-over-loop-when-rate-limited
title:
  Prefer batch embedding over per-item loops when the embedding endpoint is
  rate-limited.
trigger:
  description:
    The agent needs to embed N>10 texts and the embedding provider returns 429
    responses for sequential calls.
  tags: [embeddings, rate-limit, batch]
  targets:
    - role: indexer
outcome: success
evidence:
  - kind: run
    ref: r_2026-04-25_0a4b9c
    note: Switched to batch-of-96; throughput 12x with zero 429s.
  - kind: audit
    ref: aud_2026-04-25_0a4b9c_ok
supersedes: [retry-aggressively-on-embedding-rate-limit]
confidence: 0.8
success_count: 4
failure_count: 0
---

# Prefer batch embedding over per-item loops when the embedding endpoint is rate-limited.

## When this applies

The indexer role is processing a corpus and the embedding provider exposes a
batch endpoint (typical max 96 items per call) and returns 429 on sequential
single-item calls.

## What to do (or avoid)

- Default to the batch endpoint with the provider's documented max batch size.
- Avoid the prior heuristic of "retry aggressively on 429" — that lesson
  optimised the wrong axis (recovery, not prevention) and silently inflated
  cost.
- If the corpus exceeds one batch, page through batches with a small inter-batch
  delay rather than racing them in parallel.

## Why this supersedes `retry-aggressively-on-embedding-rate-limit`

The prior lesson recommended exponential retry on 429, which worked but cost ~3x
what batching costs. Once the batch endpoint became available the retry lesson
stopped reflecting current best practice. Marking the prior lesson as superseded
preserves the audit trail while removing it from default retrieval.
```

**When to use** — a new piece of evidence makes an older lesson obsolete. Always
state _why_ in the body. Never edit the older lesson silently — supersede it
explicitly.

---

## Example 6 — Lesson with conflicting evidence (mixed outcome)

The behaviour helps in some runs and hurts in others. `outcome: mixed` flags
this for retrieval so the lesson is presented as _conditional_ guidance, not a
directive.

```md
---
schema: learning/v1
slug: include-context-block-in-tool-call-prompts
title:
  Include the conversation context block in tool-call prompts — but not for
  stateless lookups.
trigger:
  description:
    The agent is composing a tool-call prompt and weighing whether to include
    the conversation context.
  tags: [tool-calls, prompting, context]
  targets:
    - role: orchestrator
outcome: mixed
evidence:
  - kind: run
    ref: r_2026-04-15_22a04e
    note: Context block helped; tool grounded its response correctly.
  - kind: run
    ref: r_2026-04-16_c1d3a8
    note:
      Context block hurt; stateless lookup tool latched onto the wrong entity.
  - kind: run
    ref: r_2026-04-17_7e9b22
    note: Context block helped again; multi-turn refinement stayed on topic.
  - kind: audit
    ref: aud_2026-04-16_c1d3a8_partial
    note: Approval audit recorded a near-miss tied to the misled lookup.
confidence: 0.5
success_count: 4
failure_count: 3
---

# Include the conversation context block in tool-call prompts — but not for stateless lookups.

## When this applies

The orchestrator is preparing a tool-call prompt and the tool's character is on
the spectrum from "stateful" (multi-turn refine, search-and-summarise) to
"stateless" (deterministic lookup, math, unit conversion).

## What to do (or avoid)

- For stateful tools (those that benefit from context grounding): include the
  conversation context block.
- For stateless lookups: omit the context block — it can mislead the tool into
  latching onto an unrelated entity from the conversation.
- When uncertain, default to _omit_ and add the block only if a ground-truth
  eval shows it helps.

## Counter-example

`r_2026-04-16_c1d3a8` showed the failure mode clearly: a stateless zip-code
lookup got the conversation context and "helpfully" returned data for the
address mentioned three turns earlier instead of the address in the current
request.
```

**When to use** — observed counts disagree. Promote the lesson to `mixed` rather
than picking one side. The `mixed` label is what makes retrieval honest about
uncertainty.

---

## Example 7 — Lesson distilled across many runs

A meta-lesson formed by collapsing dedup candidates from a long window of runs.
Many evidence entries; high counts; high confidence. This is what a healthy
lesson bank looks like a few weeks in.

```md
---
schema: learning/v1
slug: paginate-large-list-tools-by-default
title:
  Paginate any list-returning tool by default; never request more than 50 items
  in a single call.
trigger:
  description:
    The agent is calling a tool that returns a list (search results, table rows,
    ledger entries).
  tags: [tools, pagination, list]
outcome: success
evidence:
  - kind: run
    ref: r_2026-04-02_c81e23
    note: Unbounded list call OOM'd the worker.
  - kind: run
    ref: r_2026-04-05_19fa07
    note: Paginated rewrite ran cleanly.
  - kind: run
    ref: r_2026-04-08_bc09a4
    note: 50-item cap kept latency under p95 budget.
  - kind: run
    ref: r_2026-04-12_4e2208
    note:
      Cap surfaced a stale-data bug that was previously masked by truncation.
  - kind: run
    ref: r_2026-04-19_92dd11
    note: 50-item cap with explicit cursor in subsequent calls; clean.
  - kind: audit
    ref: aud_2026-04-02_c81e23_fail
    note: OOM root-caused to unbounded list call.
  - kind: wiki-page
    ref: wiki/runtime/tool-budgets
    note: Internal budget doc that codifies the 50-item ceiling.
confidence: 0.9
success_count: 17
failure_count: 1
expires_at: 2026-10-01T00:00:00Z
---

# Paginate any list-returning tool by default; never request more than 50 items in a single call.

## When this applies

Any tool whose output schema includes an unbounded array. Even when the tool
exposes a `limit` parameter, the default value is often unsafe.

## What to do (or avoke)

- Always pass an explicit `limit` of 50 (or the tool's documented safe default
  if smaller).
- Use the tool's cursor / pagination mechanism for subsequent pages — never bump
  the limit to "fit everything in one call."
- If a downstream task genuinely needs the full list, materialise pages into a
  workspace artifact and process the artifact, not the live list.

## Counter-example

`r_2026-04-02_c81e23` requested an unbounded list of ledger entries; the worker
OOM'd. The same shape recurred until the cap was made the default.

## Note on TTL

`expires_at` is set ~6 months out because the underlying tool budgets page
(`wiki/runtime/tool-budgets`) is reviewed quarterly; the lesson should be
re-validated at the next review.
```

**When to use** — a pattern has clearly stabilised across many runs. High counts
plus high confidence justify the broader trigger (no `targets`). Setting an
`expires_at` keeps the lesson honest even as the underlying environment evolves.

---

## Anti-patterns to avoid

- **Evidence-free lessons.** Every lesson MUST cite at least one resolvable
  evidence ref. "I think the agent should..." is not a lesson — it is a prompt
  edit, and belongs in [AIP-12](/docs/aip-12).
- **Free-text refs in `evidence.ref`.** Refs are opaque ids the host can
  resolve. "The Tuesday demo" is not a ref.
- **Author-inflated counts.** `success_count` and `failure_count` are
  runtime-maintained. Authors set initial values from the source run only.
- **Silent overwrites.** Editing the body of an existing lesson loses
  provenance. Use `supersedes` instead.
- **Trigger that says "always."** A lesson that injects on every turn defeats
  the retrieve contract's prompt-budget discipline. Tighten or split.
- **Dropping `outcome` for tidiness.** A failure-only lesson is first-class; do
  not relabel it `success` because that "looks better" in the index.
- **Embeddings or vector fields in frontmatter.** Retrieval is a runtime
  concern. Lessons on disk are portable — runtimes that want vector retrieval
  compute embeddings themselves.

## See also

- [AIP-11 — LESSON.md spec](/docs/aip-11)
- [AIP-7 — governance, audit, evidence anchors](/docs/aip-7)
- [AIP-10 — knowledge / wiki pages (declarative siblings)](/docs/aip-10)
- [AIP-12 — prompt evolution / playbook](/docs/aip-12)
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./LESSON.schema.json`](./LESSON.schema.json) — manifest validator
