---
schema: skills/v1
name: author-lesson
title: Author a LESSON.md (AIP-11)
description:
  Walk through authoring a portable LESSON.md — one transferable lesson
  distilled from a completed run — plus the optional defineLesson entry that
  wires it into a runtime's lesson bank.
version: 1.0.0
tags: [aip-11, lessons, learning, authoring, manifest, agentproto]
inputs:
  - name: source
    type: string
    required: true
    description:
      Reference to the run, audit, conversation, or work item the lesson is
      being distilled from. The skill turns this into the evidence block.
  - name: outcome
    type: string
    required: false
    description:
      One of "success", "failure", "mixed". If omitted, the skill infers from
      the source.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a lessons/ folder to author into. If omitted, the skill
      produces a new file under `lessons/<slug>.md` next to the runtime's lesson
      bank.
examples:
  - input:
      source: run:r_2026-04-21_a3f2e9
      outcome: failure
    output:
      - lessons/verify-page-id-before-load-more.md
---

# Author a LESSON.md (AIP-11)

Use this skill when the user (or a runtime's distill pipeline) asks to **capture
a transferable lesson** from a completed run. The skill produces a valid
[AIP-11 LESSON.md](/docs/aip-11) file — one lesson, one trigger, one
evidence-grounded outcome — that another runtime can load and inject into future
turns.

## When to use

- "I just watched the agent fail on X — write up the lesson so it doesn't
  repeat."
- "This run worked unusually well; capture why."
- "The distill pipeline produced a candidate; turn it into a checked-in
  LESSON.md."
- "Several runs all hit the same gotcha — collapse them into one lesson."

## When NOT to use

- The user wants to record **a fact** about the world ("Stripe's invoice
  endpoint returns paginated results") → that is declarative knowledge; use the
  wiki-page authoring path ([AIP-10](/docs/aip-10)) instead. Lessons are
  imperative ("do X" / "avoid Y").
- The user wants to **store the full trajectory** of a run for replay — that is
  run state, not a lesson. Lessons are the _distillate_.
- The user wants to **change the agent's prompt** — that is prompt evolution
  ([AIP-12](/docs/aip-12)), a different file.

## Process

Follow these steps in order. Each step has a short justification — keep that
justification visible to the reviewer so it's clear why the lesson ended up the
shape it did.

### 1. Fix identity

- Pick `slug`: kebab-case, 2–80 chars, **imperative** voice. Good:
  `verify-page-id-before-load-more`. Bad: `pagination` or `lesson-1`.
- Write `title`: one sentence in the imperative — the lesson as the agent would
  read it ("Verify the page identifier before clicking Load More").

The slug is also the filename. Slug is the unit of supersession; a new lesson
that replaces an old one cites the old slug in `supersedes`.

### 2. Write the trigger

The trigger is the most underestimated field. It decides whether the lesson
injects into a future turn at all — vague triggers waste prompt budget; precise
triggers win.

- `trigger.description`: one or two sentences in plain text — what shape of task
  or situation invites this lesson. Frame as a detectable pattern, not as a
  story.
- `trigger.tags`: optional retrieval keywords. Keep them narrow. Three tags are
  usually enough.
- `trigger.targets`: optional operator/role/skill globs. Use this to scope a
  lesson to one operator (`operator: marketing-lead`) or a whole role
  (`role: researcher`). Empty targets means "anyone."

A test: if the trigger reads as "always" or "every time the agent runs," it is
too broad; tighten or split into multiple lessons.

### 3. Set the outcome

`outcome` is one of:

- `success` — the run succeeded _because of_ the behaviour the lesson
  recommends.
- `failure` — the run failed _because of_ the behaviour the lesson warns
  against. Failure-only lessons are first-class.
- `mixed` — applied across many runs, the behaviour helped sometimes and hurt
  sometimes; the lesson is conditional.

Do not pick `success` reflexively. A counter-example from a single failure is
often the more transferable lesson.

### 4. Cite evidence

Every lesson MUST cite at least one `evidence` entry pointing back to the source
run. Evidence is provenance — it lets a human re-read the original trajectory
and check the distillation.

- `kind` is one of `run`, `conversation`, `work-item`, `audit`, `wiki-page`.
  (Audits are AIP-7 governance records.)
- `ref` is an opaque id or path the host can resolve. Never free text. If you
  cannot cite a concrete reference, you are not distilling — you are
  speculating.
- `note` is one short line — what happened. Not the lesson; the _event_. ("Agent
  clicked Load More twice and got a stale page.")

Multiple evidence entries are encouraged when the lesson is distilled across
runs (see EXAMPLES.md pattern 7).

### 5. Set counts honestly

`success_count` and `failure_count` track real applications of the lesson, not
author guesses. On first creation:

- One success run that demonstrated the lesson → `success_count: 1`,
  `failure_count: 0`.
- One failure run that established the counter-example → `success_count: 0`,
  `failure_count: 1`.

Counts are then updated **by the runtime** every time the lesson's trigger fires
and the agent's behaviour either matches or contradicts the recommendation.
Authors do not edit counts after creation; runtimes do.

### 6. Pick a confidence

`confidence` is in `[0, 1]`. Default `0.5` at first sighting — one data point is
one data point. Move it up only as `success_count` accumulates and the lesson
survives review.

The retrieve contract weighs `confidence` against
`success_count - failure_count`; runtimes are not obliged to trust
author-supplied confidence over observed counts.

### 7. Decide scope and TTL

- `supersedes`: list slugs of lessons this one replaces. Supersession is
  **explicit** — the runtime never silently overwrites a lesson. When you
  supersede, write _why_ in the body.
- `expires_at`: optional ISO 8601 soft TTL. Use when a lesson is tied to an
  external state that may change (a vendor's UI, a known bug, a deprecated API).
  Past the TTL, retrieval treats the lesson as absent.

A lesson with neither supersedes nor expires_at is a long-lived heuristic — that
is the common case.

### 8. Compose the file

Write `lessons/<slug>.md`:

```md
---
schema: learning/v1
slug: <kebab-slug>
title: <imperative one-sentence title>
trigger:
  description: <plain-text trigger>
  tags: [<topic>, <topic>]
  targets:
    - role: <slug-or-glob>
outcome: success | failure | mixed
evidence:
  - kind: run
    ref: <run-id>
    note: <one-liner>
confidence: 0.5
success_count: 0
failure_count: 1
---

# <title>

## When this applies

<expanded trigger prose>

## What to do (or avoid)

<imperative steps>

## Counter-example

<short narrative of the run>
```

The body has three required sections — _When this applies_, _What to do (or
avoid)_, _Counter-example_ — and stays short. A lesson is a heuristic, not an
essay.

### 9. (Optional) Add a defineLesson entry

For runtimes that load lessons programmatically rather than as plain files,
mirror the manifest in code:

```ts
// lesson.ts
import { defineLesson } from "<host-runtime>"

export default defineLesson({
  slug: "verify-page-id-before-load-more",
  title: "Verify the page identifier before clicking Load More",
  trigger: {
    description: "Multi-page list view with a Load More button.",
    tags: ["pagination", "ui-automation"],
  },
  outcome: "failure",
  evidence: [
    {
      kind: "run",
      ref: "r_2026-04-21_a3f2e9",
      note: "Stale page after second click.",
    },
  ],
  successCount: 0,
  failureCount: 1,
  confidence: 0.5,
})
```

The signature is normative across runtimes; consult the host's
[ADAPTER.md](./ADAPTER.md) for naming conventions in non-TS languages
(`define_lesson`, `DefineLesson`, etc.).

### 10. Validate

Validate the manifest against [`./LESSON.schema.json`](./LESSON.schema.json):

```bash
npx ajv validate -s ./LESSON.schema.json -d ./lessons/<slug>.md
```

Fix any errors before declaring success. Watch in particular for:

- `confidence` outside `[0, 1]`.
- `outcome: success` with `failure_count > 0` (allowed, but flag for review —
  the lesson may need to be `mixed`).
- `supersedes` referencing a slug that does not exist.

### 11. Regenerate the index

Every distill or supersession SHOULD regenerate `lessons/_index.md` so retrieval
has a fast directory. The runtime owns this — authors need not edit `_index.md`
by hand.

## Output

Produce one (or two) files in the chosen folder:

```
lessons/
  <slug>.md      # the LESSON manifest
  lesson.ts      # OPTIONAL — defineLesson entry, only if the
                 # runtime loads lessons as code
```

Reply to the user with:

1. The slug and file path written.
2. A one-line summary of `trigger.targets` + `outcome` + counts so they can
   verify scope before the lesson goes into rotation.
3. Any **open assumptions** — fields where you defaulted (`confidence: 0.5`,
   empty `targets`, no TTL) so the user can tighten if needed.

Do NOT inject the lesson into a live agent yourself. Authoring ends with the
file written; injection is the runtime's retrieve contract, which the author
does not call directly.

## See also

- [AIP-11 — LESSON.md spec](/docs/aip-11)
- [AIP-7 — governance, audit, evidence anchors](/docs/aip-7)
- [AIP-10 — knowledge / wiki pages (declarative siblings)](/docs/aip-10)
- [AIP-12 — prompt evolution / playbook (the prompt-side sibling)](/docs/aip-12)
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for runtimes
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference LESSON.md patterns (success,
  failure, narrow-scope, broad-scope, supersession, conflicting evidence,
  multi-run distillation)
