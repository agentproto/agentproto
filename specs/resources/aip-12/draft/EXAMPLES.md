# EXAMPLES.md — PLAYBOOK.md reference patterns

Reference `PLAYBOOK.md` files exemplifying common patterns. Each example is a
self-contained manifest a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

Every playbook rides on top of an [AIP-9 operator](/docs/aip-9) persona. The
relationship is explicit: the operator declares its locked traits; the playbook
declares which it will not modify; the runtime enforces both layers at compose
time.

## Patterns covered

1. [Minimal overlay (one fragment)](#1--minimal-overlay-one-fragment)
2. [Scoped applicability](#2--scoped-applicability)
3. [Locked-trait safeguards](#3--locked-trait-safeguards)
4. [Evolved via reflective delta](#4--evolved-via-reflective-delta)
5. [Composed on top of another playbook](#5--composed-on-top-of-another-playbook)
6. [Bound to a specific operator (AIP-9)](#6--bound-to-a-specific-operator-aip-9)
7. [Retirement via TTL and supersede](#7--retirement-via-ttl-and-supersede)

---

## 1 — Minimal overlay (one fragment)

The simplest possible playbook. One overlay fragment, single role target,
default priority, lock_check empty (the runtime's locks still apply).

```md
---
schema: playbooks/v1
slug: quote-evidence-inline
title: Quote evidence inline when arguing against a teammate.
targets:
  - kind: role
    ref: companion
kind: overlay
priority: 50
lock_check: []
evidence:
  - kind: reflection
    ref: reflections/2026-04-12/companion-arguments.md
    note: 7 of 12 disagreement turns lacked the source the agent referenced
status: active
created_at: "2026-04-12T10:00:00Z"
updated_at: "2026-04-12T10:00:00Z"
tags: [companion, evidence, communication]
---

# Quote evidence inline when arguing against a teammate.

When you disagree with something a teammate said, quote the exact phrase you're
disagreeing with before stating your position. Do not paraphrase — paraphrase
loses the disagreement. One sentence quote, then your counter.
```

**When to use.** A behaviour you want to apply broadly to a role with no hard
safety surface. The smallest viable AIP-12 file — useful as a template for new
playbooks.

---

## 2 — Scoped applicability

Same fragment shape, but `targets[]` narrows to a specific skill on a specific
role. The runtime weaves it only when the operator is acting in that skill.

```md
---
schema: playbooks/v1
slug: check-token-expiry-first
title: Check token expiry before debugging auth flows.
targets:
  - kind: skill
    ref: research/auth-debugging
  - kind: role
    ref: engineer
kind: overlay
priority: 70
lock_check: [honesty, mission]
evidence:
  - kind: run
    ref: runs/2026-04-15/auth-flow-debug-3h-rabbit-hole
    note:
      agent spent 3h debugging a fresh-token flow that turned out to be expired
      tokens
status: active
created_at: "2026-04-15T14:22:00Z"
updated_at: "2026-04-15T14:22:00Z"
tags: [auth, debugging, engineer, time-saver]
---

# Check token expiry before debugging auth flows.

Before investigating an auth flow that returns 401/403, confirm the token isn't
simply expired. Decode the JWT, check `exp`, compare to now. If expired, refresh
first and retry — most "broken auth flow" reports are this. Spend at most 2
minutes on this check; if the token is fresh and the failure persists, proceed
with normal debugging.
```

**When to use.** When the insight only makes sense in a specific context —
debugging a specific kind of problem, working on a specific surface, or
operating under a specific role. Narrow scope keeps the persona focused;
over-broad scope dilutes attention.

---

## 3 — Locked-trait safeguards

A playbook that _adjusts pacing_ but explicitly commits not to touch warmth,
honesty, or the safety boundary. The runtime independently enforces the same
locks — both layers must agree before the overlay weaves.

```md
---
schema: playbooks/v1
slug: slow-pace-on-crisis
title: Slow pacing when the user is crisis-flagged.
targets:
  - kind: role
    ref: companion
kind: overlay
priority: 85
lock_check: [warmth, honesty, voice-register, safety-boundary, identity]
evidence:
  - kind: reflection
    ref: reflections/2026-04-21/companion-pacing-under-crisis.md
    note:
      3 of 5 crisis-flagged sessions showed agent rushing past acknowledgement
      into advice mode
  - kind: human
    ref: feedback/safety-review-2026-04-22
    note:
      safety lead requested explicit pacing overlay rather than persona rewrite
status: active
created_at: "2026-04-21T09:00:00Z"
updated_at: "2026-04-22T11:30:00Z"
tags: [companion, crisis, pacing, safety-adjacent]
---

# Slow pacing when the user is crisis-flagged.

When the active user is flagged as in crisis (per the runtime's crisis-detection
signal), prefer one question at a time over a multi-question check-in.
Acknowledge feelings verbally before offering any next step. Do not list bullet
points of advice — read one option back, ask if it lands, then continue. Stay
warm and honest; this overlay is about pacing, not about changing what you say.
```

**When to use.** Anytime the overlay touches a behaviour adjacent to a locked
trait. Listing the locks explicitly makes the author's intent auditable, and
means a faulty evolution loop AND a lax runtime have to _both_ fail before a
locked trait is touched. When in doubt, copy the operator's full lock list —
declaring more never hurts.

---

## 4 — Evolved via reflective delta

A playbook whose `history[]` shows it was authored, then refined once via a
reflection-loop delta. The current body is the materialised view; the history is
the audit trail. Status moves `shadow → active` only after the promotion gate
passes.

```md
---
schema: playbooks/v1
slug: cite-source-when-naming-frameworks
title: Cite the source when referencing named frameworks.
targets:
  - kind: role
    ref: researcher
kind: overlay
priority: 60
lock_check: [honesty, mission]
evidence:
  - kind: reflection
    ref: reflections/2026-04-05/researcher-framework-claims.md
    note: agent named ACE, GEPA, RAFT in arguments without ever linking sources
status: active
supersedes: []
history:
  - at: "2026-04-05T16:00:00Z"
    kind: created
    summary:
      Initial overlay drafted from reflection over 18 research conversations.
    source: reflections/2026-04-05/researcher-framework-claims.md
    by: reflection-loop:v3
  - at: "2026-04-08T10:14:00Z"
    kind: delta
    summary:
      Reflection loop tightened wording — "named framework" replaced with
      "framework, paper, or technique" to cover unnamed methods too.
    source: reflections/2026-04-08/researcher-citation-gap.md
    by: reflection-loop:v3
  - at: "2026-04-12T09:00:00Z"
    kind: promoted
    summary:
      A/B harness showed +12% citation rate, no measured warmth regression.
      Promoted shadow → active.
    source: ab-harness/runs/2026-04-10-citation
    by: jeremy
    gate: a-b
created_at: "2026-04-05T16:00:00Z"
updated_at: "2026-04-12T09:00:00Z"
tags: [research, citation, evolved]
---

# Cite the source when referencing named frameworks.

When you name a specific framework, paper, or technique in an argument or
recommendation, link the source on first mention. If you don't have a link at
hand, say so explicitly — "I'm recalling this from training; verify before
quoting" — instead of letting the name stand alone. The standard is: a teammate
reading the message should be able to follow the cited source without asking you
for it.
```

**When to use.** This is the canonical AIP-12 lifecycle: a reflection loop
produced an initial draft, a second pass tightened the wording, an A/B test
promoted it. The `history[]` is what makes the evolution auditable — replay
history, the body must reconstruct.

---

## 5 — Composed on top of another playbook

Two playbooks targeting the same role. Both are `active`; the runtime weaves
them in priority order. Lower-priority overlays append after higher-priority
ones, so the higher-priority guidance sets the frame and the lower-priority one
specialises within it.

**File `slow-pace-on-crisis.md`** — see
[pattern 3](#3--locked-trait-safeguards). That overlay sets pacing for
crisis-flagged users at `priority: 85`.

**File `acknowledge-before-redirecting.md`** — composes on top:

```md
---
schema: playbooks/v1
slug: acknowledge-before-redirecting
title: Acknowledge feelings before redirecting to a resource.
targets:
  - kind: role
    ref: companion
kind: overlay
priority: 65
lock_check: [warmth, honesty, voice-register, safety-boundary, identity]
evidence:
  - kind: reflection
    ref: reflections/2026-04-25/companion-redirect-flow.md
    note:
      when redirecting to crisis resources, agent jumped straight to the link
      without acknowledging
  - kind: conversation
    ref: conversations/2026-04-23/session-7741
    note:
      user said "you didn't even hear me" after a hotline link with no preamble
status: active
created_at: "2026-04-25T10:00:00Z"
updated_at: "2026-04-25T10:00:00Z"
tags: [companion, redirect, pacing-adjacent]
---

# Acknowledge feelings before redirecting to a resource.

When you decide to redirect the user to an external resource (crisis hotline,
professional support, documentation), first reflect back what you heard them
say. One sentence acknowledging the feeling, THEN the resource and why. Never
paste a link without preamble.
```

**When to use.** When two adjustments are _related_ but _independent_ — they
speak to the same context but make distinct choices. Splitting them keeps each
playbook's credit-assignment clean (you can A/B one without the other). The
`slow-pace-on-crisis` playbook frames the pacing; this one specialises the
redirect step inside that pacing. Together they compose; separately they audit.

---

## 6 — Bound to a specific operator (AIP-9)

A playbook bound to a single operator instance, not a role. The narrowest
possible scope. Useful when an operator has gathered operator-specific context
(a personal communication style, a specific user it serves, a specific
workflow).

```md
---
schema: playbooks/v1
slug: alice-prefers-bullet-summaries
title: Alice's preferred response shape — bullet summary first, then prose.
targets:
  - kind: operator
    ref: operator/alice
kind: overlay
priority: 55
lock_check: [honesty, mission, voice-register]
binds_operator: alice
evidence:
  - kind: human
    ref: feedback/alice-2026-04-19
    note:
      Alice said in three separate sessions "give me the bullets first, I'll
      read prose if I have time"
  - kind: run
    ref: runs/2026-04-19/alice-summary-feedback
status: active
created_at: "2026-04-19T15:00:00Z"
updated_at: "2026-04-19T15:00:00Z"
tags: [alice, format, preference]
---

# Alice's preferred response shape — bullet summary first, then prose.

When responding to Alice with anything longer than two sentences, lead with a
3–5 bullet summary of the key points, then provide the prose explanation
underneath. Bullets first, prose second. If the response is already short, skip
the bullets — they're for replies that benefit from a scannable head.
```

**When to use.** Operator-bound personalisation. The `binds_operator` field
locks the scope to a single operator id — the runtime refuses to weave this
overlay into any other operator even if the role matches. This is how AIP-12
preserves [AIP-9](/docs/aip-9) operator identity while letting personal context
accumulate.

---

## 7 — Retirement via TTL and supersede

Two playbooks: an older one with a TTL set, and a newer one that explicitly
supersedes it. The host walks the lifecycle: TTL expires → status auto-flips to
`archived`; supersede declared → predecessor is archived on activation.

**File `temp-promo-tone.md`** — TTL-bounded experiment:

```md
---
schema: playbooks/v1
slug: temp-promo-tone
title: Match the spring 2026 launch campaign tone for marketing replies.
targets:
  - kind: role
    ref: marketing-assistant
kind: overlay
priority: 60
lock_check: [honesty, mission, voice-register]
ttl: P30D
evidence:
  - kind: human
    ref: campaigns/spring-2026-launch-brief.md
    note: 30-day campaign window — overlay should self-archive
status: archived
history:
  - at: "2026-03-15T09:00:00Z"
    kind: created
    summary: Authored from spring-2026 launch brief; TTL set to 30 days.
    by: jeremy
  - at: "2026-04-14T09:00:00Z"
    kind: archived
    summary: TTL expired (P30D from updated_at). Auto-archived by runtime sweep.
    by: system:ttl-sweep
created_at: "2026-03-15T09:00:00Z"
updated_at: "2026-03-15T09:00:00Z"
tags: [marketing, campaign, time-bounded]
---

# Match the spring 2026 launch campaign tone for marketing replies.

For external marketing replies during the spring 2026 launch window, match the
campaign's playful-but-precise tone: short sentences, one unexpected verb per
paragraph, never use the word "solution".
```

**File `summer-2026-tone.md`** — supersedes the spring playbook:

```md
---
schema: playbooks/v1
slug: summer-2026-tone
title: Summer 2026 campaign tone for marketing replies.
targets:
  - kind: role
    ref: marketing-assistant
kind: overlay
priority: 60
lock_check: [honesty, mission, voice-register]
ttl: P60D
supersedes: [temp-promo-tone]
evidence:
  - kind: human
    ref: campaigns/summer-2026-brief.md
status: active
history:
  - at: "2026-04-20T09:00:00Z"
    kind: created
    summary: Authored from summer-2026 brief; supersedes temp-promo-tone.
    by: jeremy
  - at: "2026-04-20T09:00:00Z"
    kind: superseded
    summary:
      temp-promo-tone listed as superseded; predecessor moved to archived.
    source: temp-promo-tone
    by: jeremy
created_at: "2026-04-20T09:00:00Z"
updated_at: "2026-04-20T09:00:00Z"
tags: [marketing, campaign, time-bounded]
---

# Summer 2026 campaign tone for marketing replies.

For external marketing replies during the summer 2026 campaign window, match the
campaign's quieter tone: longer sentences, no exclamation marks, prefer concrete
numbers over adjectives.
```

**When to use.** Time-bounded overlays that should retire automatically
(campaigns, experiments, seasonal adjustments) and deliberate replacements that
should clean up their predecessors. TTL handles the auto-archive; `supersedes`
handles the explicit hand-off. Both ensure the active playbook set stays small
and auditable — without retirement, the catalog grows unbounded and the
operator's persona drifts.

---

## Anti-patterns to avoid

- **Status `active` on first write** — every new playbook SHOULD enter at
  `shadow`. Auto-promotion defeats the gate.
- **Empty `lock_check` on a body that touches identity** — even if the runtime
  catches it at compose time, the empty list means the author didn't think about
  it. Declare what you committed to leave alone.
- **Overlapping playbooks at the same priority** — ordering ties break by
  `updated_at`, but if two playbooks legitimately compete, reconcile them rather
  than letting timestamp luck decide.
- **`history[]` rewrites** — history is append-only. A correction is a new
  entry, not an edit of an old one.
- **Monolithic body** — if the overlay reads like a persona rewrite, it's not a
  delta; it's a [AIP-9](/docs/aip-9) edit pretending to be a playbook. Refuse.
- **Globbed `targets` without lock-check** — a
  `targets: [{kind: operator, ref: "operator/*"}]` overlay with empty
  `lock_check` will misfire on operators it wasn't designed for. Either narrow
  the target or expand the lock list.
- **Reflection loop output written straight to `active`** — the shadow → active
  transition is the whole safety story. Skipping it makes ACE-style loops
  degrade silently.

## See also

- [AIP-12 — PLAYBOOK.md spec](/docs/aip-12)
- [AIP-9 — agentoperators/v1](/docs/aip-9) — base personas
- [AIP-11 — agentlearning/v1](/docs/aip-11) — single-turn lessons
- [AIP-7 — governance, approval, audit](/docs/aip-7) — promotion gate
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./PLAYBOOK.schema.json`](./PLAYBOOK.schema.json) — manifest validator
