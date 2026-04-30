---
schema: skills/v1
name: author-playbook
title: Author a PLAYBOOK.md (AIP-12)
description:
  Walk through authoring a portable PLAYBOOK.md prompt-overlay fragment plus a
  definePlaybook entry for any agent runtime. Covers applicability, locked-trait
  safeguards, the reflective delta contract, and the shadow → active promotion
  gate.
version: 1.0.0
tags: [aip-12, playbooks, persona, overlays, evolution, agentproto]
inputs:
  - name: insight
    type: string
    required: true
    description:
      One-paragraph statement of the persona adjustment to capture (e.g. "be
      slower with crisis-flagged users", "quote evidence inline when arguing").
      The skill turns this into a single overlay fragment.
  - name: targetOperator
    type: string
    required: false
    description:
      Operator id, role slug, or skill slug the playbook should apply to. If
      omitted, the skill picks the narrowest scope consistent with the insight.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a playbooks folder to author into. If omitted, the skill
      produces a new file under `playbooks/<scope>/<slug>.md`.
examples:
  - input:
      insight:
        When a user is flagged as in crisis, slow down — prefer
        one-question-at-a-time pacing and verbal acknowledgement over advice.
      targetOperator: role/companion
    output:
      - playbooks/role/companion/slow-pace-on-crisis.md
---

# Author a PLAYBOOK.md (AIP-12)

Use this skill when the user asks to **capture, codify, or evolve a persona
adjustment** for an operator — a small overlay fragment that rides on top of the
operator's base persona without rewriting it. The skill produces a valid
[AIP-12 PLAYBOOK.md](/docs/aip-12) with a single overlay fragment, plus an entry
exposing the standard `definePlaybook` signature.

Playbooks are **not** lessons. A lesson tells the agent _do X_ in a single turn
([AIP-11](/docs/aip-11)). A playbook **is** part of the agent — it modifies
persona at session compose time. Lessons retrieve; playbooks weave.

## When to use

- "Whenever the agent helps with X, it should phrase Y like Z."
- "I noticed the agent rushes through crisis flags — capture the slower
  behaviour as a reusable overlay."
- "Promote this shadow playbook to active."
- "The reflection loop produced a delta — turn it into a playbook file."

## When NOT to use

- The change is **a single-turn instruction** → use the
  [AIP-11 lesson-authoring skill](../../../aip-11/skills/author-lesson/SKILL.md)
  instead.
- The change rewrites the **whole** operator persona → that's an
  [AIP-9 operator](/docs/aip-9) edit, not a playbook overlay.
- The user wants to **invoke** an existing playbook — no authoring needed; the
  runtime weaves it automatically.

## Process

Eight steps. Skipping the lock-check or shadow gate is how self-improving
prompts go off-mission silently — every step matters.

### 1. Fix identity and scope

- Pick `slug`: kebab-case, descriptive of the _behaviour the overlay installs_
  (`slow-pace-on-crisis`, not `playbook-1`).
- Write `title`: one sentence — what this overlay does.
- Decide `targets[]`: which operators / roles / skills / runtimes the overlay
  should weave into. Use the **narrowest** scope the insight justifies. Globs
  are allowed (`operator/*`) but every glob is a chance to misfire — prefer
  concrete refs.

### 2. Pick `kind`

Two kinds available — pick the most specific that fits:

| Kind                | When                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `overlay`           | Additive: the fragment is appended to the persona at compose time. The default and most common choice.           |
| `block-replacement` | Swap a named persona block (e.g. `style.voice`). Requires the base persona to declare that block as replaceable. |

Reject these anti-decompositions:

- A single playbook that mixes two unrelated adjustments (split into two —
  credit assignment depends on one-fragment-one-idea).
- A `block-replacement` that targets a block the persona doesn't expose as
  replaceable (host refuses at apply time).
- An overlay that paraphrases the base persona instead of _adding_ to it (drift
  surface — keep overlays additive).

### 3. Declare locked traits

This is the safety contract. Walk the operator's locked-trait list and ask:

- Which traits is this overlay _intended_ to leave alone?
- Could the body be misread as touching any of them?

Populate `lock_check[]` with every trait the author commits not to modify.
Common ids: `warmth`, `honesty`, `voice-register`, `safety-boundary`, `mission`,
`identity`.

`lock_check` is **intent**. The runtime enforces its own list independently —
overlays that violate either are non-conforming. Stricter wins. When in doubt,
copy the operator's full lock list: declaring more locked traits never hurts;
declaring fewer means a faulty evolution loop has one less guardrail.

### 4. Write the overlay body

Markdown, addressed _to the operator_, weave-ready. Rules:

- One concrete behaviour per playbook. If you wrote "and also…", split into two
  playbooks.
- Never refer to _being_ a playbook ("this overlay tells you to…") — the body is
  just persona text. Overlay framing is metadata, not prose.
- No chain-of-thought leakage to user-facing output. The body is prompt
  material, not narration.
- Quote concrete examples where useful (input → behaviour). The LLM reads these.
- Keep it short. Long overlays compete with the base persona for attention; aim
  for one paragraph.

### 5. Provenance — `evidence[]`

Every playbook MUST trace back to the run, conversation, work-item, or
reflection that produced it:

```yaml
evidence:
  - kind: reflection
    ref: reflections/2026-04-27/companion-pacing.md
    note:
      3 of 5 crisis-flagged sessions showed agent rushing past safety
      acknowledgement
```

Why this matters: when a playbook stops working (or starts misfiring), the
evidence pointer is the only way to retrace authorship. Untraceable playbooks
are a maintenance tarpit.

### 6. Status, priority, TTL

| Field        | When to set                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`     | New playbooks SHOULD enter as `shadow`. Promote to `active` only after measurable improvement (A/B vs current, scorer delta, or human approval). |
| `priority`   | 0–100, default 50. Higher wins on ordering ties. Reserve >75 for safety-critical overlays.                                                       |
| `ttl`        | OPTIONAL ISO-8601 duration. The runtime auto-archives at `updated_at + ttl`. Use for time-bounded experiments (e.g. `P14D` = 14 days).           |
| `supersedes` | OPTIONAL. List of slugs this playbook replaces. The host moves the predecessors to `archived` on activation.                                     |

### 7. Compose the manifest + entry

Author `PLAYBOOK.md`:

```md
---
schema: playbooks/v1
slug: <kebab-id>
title: <one sentence>
targets:
  - kind: <operator|role|skill|runtime>
    ref: <slug-or-glob>
kind: <overlay|block-replacement>
priority: 50
lock_check: [<trait-id>, …]
evidence:
  - { kind: <run|conversation|work-item|reflection>, ref: <…>, note: <…> }
status: shadow
ttl: <PnD> # optional
supersedes: [<slug>] # optional
metadata: {}
---

# <title>

<the overlay fragment — one paragraph of prompt material>
```

Author `playbook.ts` exposing the canonical signature:

```ts
import { definePlaybook } from "<host-runtime>"

export default definePlaybook({
  slug: "slow-pace-on-crisis",
  title: "Slow pacing when the user is crisis-flagged.",
  targets: [{ kind: "role", ref: "companion" }],
  kind: "overlay",
  priority: 60,
  lockCheck: ["warmth", "honesty", "safety-boundary"],
  evidence: [
    {
      kind: "reflection",
      ref: "reflections/2026-04-27/companion-pacing.md",
      note: "3 of 5 crisis sessions showed agent rushing past acknowledgement",
    },
  ],
  status: "shadow",
  body: `
When the active user is flagged as in crisis, prefer one question at a
time over a multi-question check-in. Acknowledge feelings verbally
before offering any next step. Do not list bullet points of advice —
read one back, ask if it lands, then continue.
  `.trim(),
})
```

Mirror the manifest exactly. Drift between manifest and entry is a spec bug.

### 8. Validate

Validate the manifest against
[`./PLAYBOOK.schema.json`](./PLAYBOOK.schema.json):

```bash
npx ajv validate -s ./PLAYBOOK.schema.json -d ./PLAYBOOK.md
```

Fix every error before declaring success. Specifically check:

- `slug` is kebab-case and unique within the playbooks folder.
- Every `targets[].ref` resolves (or is an explicit glob).
- `lock_check` covers every trait the operator marks locked, or the author has
  explicitly accepted the gap.
- `status` is `shadow` (new) or carries an `evidence` entry of kind `reflection`
  justifying promotion.
- Body contains no instruction that paraphrases or contradicts a locked trait.

## The reflective delta contract

This skill also handles the second-most-common request: **codify a delta the
reflection loop produced**. Reflective deltas are append-only; the current
playbook set is the materialised view.

When a delta arrives:

1. **Read the delta.** It carries a candidate body, target scope, and the runs
   that motivated it.
2. **Check the lock list.** If the candidate body touches any locked trait of
   any in-scope operator, **discard** it — do not write the file. Surface the
   rejection with the trait id and a short excerpt.
3. **Write the playbook at `status: shadow`.** Never auto-promote. Shadow status
   means "the runtime computes this overlay but does not weave it" — the system
   accumulates evidence without changing behaviour.
4. **Append a `history` entry** describing the delta source (run id or
   reflection id, timestamp, summary). The history is the audit-trail; it MUST
   grow append-only.
5. **Stop.** Promotion to `active` is a separate decision. This skill does not
   promote. Promotion goes through the host's gate (A/B, scorer delta, or
   [AIP-7](/docs/aip-7) governance for high-impact overlays).

A delta whose body would _replace_ the whole persona is not a delta — it's a
persona rewrite. Refuse it. The point of AIP-12 is to forbid monolithic rewrites
in favour of additive overlays.

## Output

Produce two files in the chosen folder:

```
<folder>/
  PLAYBOOK.md      # the manifest
  playbook.ts      # (or playbook.py / …) — the entry exposing definePlaybook
```

Reply to the user with:

1. The folder you wrote to.
2. The `targets[]` and `lock_check[]` so they can verify the scope and safety
   contract before activation.
3. The current `status` (almost always `shadow`) and what the promotion gate is
   (A/B, scorer delta, or governance).
4. **Open assumptions**: defaults you guessed (priority, TTL, the exact phrasing
   of the body) the user might want to override.

Do NOT promote the playbook to `active` yourself — that's the host's gate.
Authoring ends with the file written and the index regenerated.

## See also

- [AIP-12 — PLAYBOOK.md spec](/docs/aip-12)
- [AIP-9 — agentoperators/v1](/docs/aip-9) — operator personas playbooks weave
  into
- [AIP-7 — governance, approval, audit](/docs/aip-7) — high-impact promotion
  path
- [AIP-11 — agentlearning/v1](/docs/aip-11) — single-turn lessons (different
  layer)
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference PLAYBOOK.md files (minimal
  overlay, scoped, locked, evolved, composed, retired)
