# EXAMPLES.md — agentassembly/v1 reference patterns

Reference manifests exemplifying each of the four modes plus a locked-trait
union demonstration for [AIP-24](/docs/aip-24). Each example is a self-contained
`ASSEMBLY.md` a host could load as-is. Manifest authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Council (advisory mode) — Simone-flavored 5-mentor council](#example-1--council-advisory-mode)
2. [Voting (decision body) — small board with quorum and weighted votes](#example-2--voting-decision-body)
3. [Peer (network) — 4 peers exchanging messages on a fully-connected topology](#example-3--peer-network)
4. [Hierarchy (reporting tree) — 3-level tree with bottom-up severity aggregation](#example-4--hierarchy-reporting-tree)
5. [Three-level chain — locked-trait union demonstration with HARD-refusal counter-example](#example-5--locked-trait-union-chain)

---

## Example 1 — Council (advisory mode)

The canonical realisation: Simone's 5-mentor Council. Five members referenced by
persona, three phases (`session`, `standing`, `sentinel`), four synthesis rules
(sentinel-wins, critic-sycophancy- forced, severity-eight-unilateral,
moderate-aggregation), six locked traits matching the working
`SIMONE_LOCKED_TRAITS` constant.

```yaml
---
schema: assembly.workspace/v1
name: simone-council
title: Simone Council of Mentors
description: |
  Five-mentor advisory assembly defending Simone's persona against
  drift, sycophancy, and safety-relevant pattern matches. Mentors
  produce structured guidance; the synthesizer's hard rules pick
  fragments to weave into Simone's instructions; the locked-trait
  floor prevents the council from eroding Simone's voice.
version: 1.0.0

mode: advisory

members:
  - persona: ws://personas/simone-therapist
    id: therapist
    role: Therapist
    phase: session
    triggers: [sample]
    timeout_ms: 30000
    gatherInput:
      strategy: working-memory

  - persona: ws://personas/simone-stoic
    id: stoic
    role: Stoic
    phase: session
    triggers: [sample]
    timeout_ms: 30000
    gatherInput:
      strategy: working-memory

  - persona: ws://personas/simone-elder
    id: elder
    role: Elder
    phase: standing
    triggers: [scheduled, periodic]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 7 }

  - persona: ws://personas/simone-critic
    id: critic
    role: Critic (anti-sycophancy)
    phase: session
    triggers: [sample]
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 12 }

  - persona: ws://personas/simone-sentinel
    id: sentinel
    role: Sentinel (safety pre-filter)
    phase: sentinel
    triggers: [sentinel-match, manual]
    timeout_ms: 15000
    gatherInput:
      strategy: last-message-only

synthesis:
  rules:
    - id: sentinel-wins
      kind: terminal
      appliesTo: [sentinel]
      params:
        triggerSeverity: 9
        priority: 100
        ttlMs: 259200000     # 3 days
    - id: critic-sycophancy-forced
      kind: priority
      appliesTo: [critic]
      params:
        triggerKind: sycophancy
        priority: 80
    - id: severity-eight-unilateral
      kind: aggregate
      appliesTo: [therapist, stoic, elder, critic]
      params:
        minSeverity: 8
        priority: 70
    - id: moderate-aggregation
      kind: aggregate
      appliesTo: [therapist, stoic, elder, critic]
      params:
        minSeverity: 5
        maxSeverity: 7
        topN: 2
        priorityBase: 40
  riskLevels:
    - { range: [0, 3], label: ok }
    - { range: [4, 6], label: watch }
    - { range: [7, 8], label: intervene }
    - { range: [9, 10], label: escalate }

lockedTraits:
  - warmth
  - honest
  - voice register
  - refuse harm
  - kindness
  - core persona
matchMode: substring

audit:
  consultations:
    enabled: true
    retention: forever
  overlays:
    enabled: true
    maxActive: 6
    defaultTtl: P14D
  signing: optional

identity: ws://identities/simone
governance: ../policies/simone-council-governance.yaml
executor: ws://operators/simone

defaults:
  triggerHeuristic: every-n-messages

display:
  defaultGrouping: phase

metadata:
  agentik:
    workingImplementation: packages/simone/src/council
---

# Simone Council of Mentors

## Purpose

The Council protects Simone's persona from drift, sycophancy, and
safety-relevant pattern matches. It runs alongside conversations,
producing structured guidance that the persona builder weaves into
instructions transparently. Users never see the Council; they
experience Simone behaving more cautiously, less sycophantically,
or handing off to a human when the Sentinel fires.

## Mode rationale

Advisory is the right pattern. Voting on Simone's persona would
make every reply slow and dilute the loudest signals (sentinel,
critic) by averaging them with quieter ones (therapist, stoic).
Peer would over-engineer the council into a debate club. Hierarchy
would fail safety: a manager-line aggregating severity from below
introduces latency where seconds matter (sentinel) and dilutes
single-mentor escalation (severity-eight-unilateral).

## Synthesis rationale

Rules apply in declaration order, the loudest signal first:

1. **Sentinel wins** — at severity ≥ 9, the Sentinel's suggestion
   short-circuits everything else with priority 100 and a 3-day TTL.
   Crisis situations resolve on a timescale of days, not weeks.
2. **Critic sycophancy** — sycophancy is the failure mode where
   Simone is being harmful by being too pleasing. The Critic's
   sycophancy concerns are forced through with priority 80
   regardless of what the others said.
3. **Severity-eight unilateral** — any mentor at severity ≥ 8
   produces a fragment regardless of consensus. Prevents averaging
   away an evidence-backed strong signal.
4. **Moderate aggregation** — for the residual case (severities 5-7),
   pick the strongest 1-2 with concrete suggestions.

## Threat model

`lockedTraits` defends against the council eroding Simone's core
identity over time. A Critic could nudge "be more terse" until
warmth is gone; a Sentinel could nudge "be more cautious" until
honesty is gone. The substring lock catches fragments mentioning
any of the six core traits and drops them silently with a note in
the synthesis trail.

## When to extend vs replace

Extend this manifest when the consumer is a Simone-shaped agent
needing the same council semantics with adjusted triggers, locked
traits, or audit posture. Replace it when the agent is a
fundamentally different shape (a customer-support bot doesn't
need standing-pass digest; an enterprise compliance agent needs a
voting board, not advisory).
```

---

## Example 2 — Voting (decision body)

A small executive board voting on internal proposals. Five voting members with
weighted votes, three proposal classes (`budget`, `security`, `architecture`),
quorum at two-thirds.

```yaml
---
schema: assembly.workspace/v1
name: exec-voting-board
title: Executive Voting Board
description: |
  Five-member voting board approving cross-functional proposals.
  CFO weighted 2x on budget; CTO weighted 2x on architecture; CISO
  weighted 2x on security. Quorum at 2/3 of cast non-abstain weight.
  No persona poisoning surface — locked traits guard against
  vote-rationale prompt injection.
version: 1.0.0

mode: voting

members:
  - persona: ws://personas/exec-ceo
    id: ceo
    role: Chief Executive Officer
    weight: 1.5
    voteClass: [budget, security, architecture]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 14 }

  - persona: ws://personas/exec-cfo
    id: cfo
    role: Chief Financial Officer
    weight: 2.0
    voteClass: [budget]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 14, focus: financial }

  - persona: ws://personas/exec-cto
    id: cto
    role: Chief Technology Officer
    weight: 2.0
    voteClass: [architecture]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 14, focus: technical }

  - persona: ws://personas/exec-ciso
    id: ciso
    role: Chief Information Security Officer
    weight: 2.0
    voteClass: [security]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 14, focus: security }

  - persona: ws://personas/exec-coo
    id: coo
    role: Chief Operating Officer
    weight: 1.5
    voteClass: [budget, security, architecture]
    timeout_ms: 45000
    gatherInput:
      strategy: digest
      params: { window_days: 14 }

synthesis:
  rules:
    - id: ciso-veto
      kind: terminal
      appliesTo: [ciso]
      params:
        triggerVote: no
        scope: security
    - id: two-thirds-quorum
      kind: quorum
      appliesTo: "*"
      params:
        threshold: 0.66
    - id: tie-break-on-half
      kind: majority
      appliesTo: "*"
      params:
        tieBreaker: chair-vote
        chair: ceo

lockedTraits:
  - "ignore policy"
  - "override governance"
  - "disregard regulations"
matchMode: substring

audit:
  consultations:
    enabled: true
    retention: forever
  overlays:
    enabled: true
    maxActive: 100
    defaultTtl: P90D
  signing: required

identity: ws://identities/exec-board
governance: ../policies/exec-board-governance.yaml
work: ws://workspaces/board-proposals
executor: ws://operators/exec-clerk

defaults:
  triggerHeuristic: manual

display:
  defaultGrouping: role
---

# Executive Voting Board

## Purpose

Approves cross-functional proposals (budget, security,
architecture) above thresholds set by the bound governance policy.
Members cast structured votes with rationale and evidence; the
synthesis pipeline tallies and records the decision.

## Mode rationale

Voting is the right pattern. Advisory would lose the binary pass /
fail signal that downstream automation needs. Peer would not
produce a crisp decision artifact. Hierarchy would impose a
manager-line bottleneck on cross-functional approvals.

## Synthesis rationale

The CISO veto runs first: a 'no' vote on a security-class proposal
short-circuits the tally and refuses the proposal regardless of
other votes. The two-thirds quorum rule runs next; if the weighted
ratio of yes votes to non-abstain weight crosses 0.66, the proposal
passes. Ties at 0.5 fall through to majority with the CEO as chair.

## Threat model

Locked traits defend against prompt injection in vote rationales.
A member's rationale text — written by an LLM persona — could
contain "ignore policy" if a malicious proposal is crafted. The
substring check catches the phrase at persistence time and refuses
the decision artifact. The consultation row is persisted so
reviewers can audit which member's rationale tripped the lock.
Signing is `required` — every consultation row and decision record
carries a verifiable signature against the bound governance policy.
```

---

## Example 3 — Peer (network)

A four-member creative critique panel. Each peer reviews a candidate campaign
and addresses messages to the other peers; no central referee, no quorum, just
structured exchange. The output is the message log.

```yaml
---
schema: assembly.workspace/v1
name: creative-critique-panel
title: Creative Critique Panel
description: |
  Four-peer network reviewing creative campaigns. Brand, Copy,
  Visual, and Legal critics exchange messages; no referee. Output
  is the message log; downstream tooling renders it for the
  creative lead's review. Locked traits prevent peer messages
  from poisoning the brand voice.
version: 1.0.0

mode: peer

members:
  - persona: ws://personas/critic-brand
    id: brand
    role: Brand Critic
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 30 }

  - persona: ws://personas/critic-copy
    id: copy
    role: Copy Critic
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 30 }

  - persona: ws://personas/critic-visual
    id: visual
    role: Visual Critic
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 30 }

  - persona: ws://personas/critic-legal
    id: legal
    role: Legal Critic
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 30 }

synthesis:
  rules:
    - id: collect-messages
      kind: aggregate
      appliesTo: "*"
      params:
        topology: fully-connected
        maxRounds: 3
        terminationRule: no-new-objections

lockedTraits:
  - "off-brand"
  - "violates brand voice"
  - "ignore brand guidelines"
matchMode: substring

audit:
  consultations:
    enabled: true
    retention: days:180
  overlays:
    enabled: true
    maxActive: 100
    defaultTtl: P30D
  signing: optional

identity: ws://identities/creative-team
work: ws://workspaces/campaigns
executor: ws://operators/creative-lead

defaults:
  triggerHeuristic: on-mode-change

display:
  defaultGrouping: role
---

# Creative Critique Panel

## Purpose

Provides structured peer critique on creative campaigns before
they reach the creative lead's review queue. Brand, Copy, Visual,
and Legal each weigh in independently and address objections to
each other; the message log captures the deliberation in full.

## Mode rationale

Peer is the right pattern. Advisory would silently modulate the
campaign rather than surfacing the debate. Voting would force a
crisp pass/fail on creative work where nuance matters. Hierarchy
would impose a senior critic's view over the others.

## Synthesis rationale

A single `aggregate` rule collects messages into the log. Topology
is fully-connected — any peer can address any other. The round
caps at 3 (or earlier when no new objections are raised) so the
panel converges within a reasonable time budget.

## Threat model

Locked traits defend against the panel itself drifting off-brand
in the act of critique. A peer arguing "the brand voice rule is
wrong here" could erode the brand voice it's supposed to defend.
Substring locks catch the obvious cases.
```

---

## Example 4 — Hierarchy (reporting tree)

A three-level reporting tree where line managers aggregate severity from their
reports and roll up to a head-of-engineering. Useful for multi-stage code review
where each layer adds judgment.

```yaml
---
schema: assembly.workspace/v1
name: eng-review-hierarchy
title: Engineering Review Hierarchy
description: |
  3-level tree (head → 2 VPs → 4 managers) reviewing engineering
  proposals. Leaf members (managers) score severity on their team's
  proposals; VPs aggregate and emit a synthesised view; the head
  emits the final rolled-up assessment.
version: 1.0.0

mode: hierarchy

members:
  - persona: ws://personas/eng-head
    id: head-eng
    role: Head of Engineering
    timeout_ms: 60000
    gatherInput:
      strategy: custom:children-outputs

  - persona: ws://personas/eng-vp-platform
    id: vp-platform
    role: VP Platform
    parent: head-eng
    timeout_ms: 60000
    gatherInput:
      strategy: custom:children-outputs

  - persona: ws://personas/eng-vp-product
    id: vp-product
    role: VP Product Engineering
    parent: head-eng
    timeout_ms: 60000
    gatherInput:
      strategy: custom:children-outputs

  - persona: ws://personas/eng-manager-a
    id: manager-a
    role: Manager (Auth Team)
    parent: vp-platform
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 50 }

  - persona: ws://personas/eng-manager-b
    id: manager-b
    role: Manager (Infra Team)
    parent: vp-platform
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 50 }

  - persona: ws://personas/eng-manager-c
    id: manager-c
    role: Manager (Web Team)
    parent: vp-product
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 50 }

  - persona: ws://personas/eng-manager-d
    id: manager-d
    role: Manager (Mobile Team)
    parent: vp-product
    timeout_ms: 30000
    gatherInput:
      strategy: recent-messages
      params: { limit: 50 }

synthesis:
  rules:
    - id: vp-aggregate
      kind: escalate-on-severity
      appliesTo: [vp-platform, vp-product]
      params:
        severityFn: max
        evidenceFn: union
    - id: head-aggregate
      kind: escalate-on-severity
      appliesTo: [head-eng]
      params:
        severityFn: max
        evidenceFn: union
        emitRollup: true
  riskLevels:
    - { range: [0, 3], label: ok }
    - { range: [4, 6], label: watch }
    - { range: [7, 8], label: intervene }
    - { range: [9, 10], label: escalate }

lockedTraits:
  - "rubber-stamp"
  - "skip review"
matchMode: substring

audit:
  consultations:
    enabled: true
    retention: forever
  overlays:
    enabled: true
    maxActive: 50
    defaultTtl: P90D
  signing: required

identity: ws://identities/eng-org
governance: ../policies/eng-review-governance.yaml
work: ws://workspaces/eng-proposals
executor: ws://operators/eng-clerk

defaults:
  triggerHeuristic: manual

display:
  defaultGrouping: role
---

# Engineering Review Hierarchy

## Purpose

Three-level review structure for engineering proposals. Managers
score on their team's surface area; VPs aggregate across their
two-team coverage; the head emits the final assessment.

## Mode rationale

Hierarchy is the right pattern. The org structure already exists
and reviewers naturally aggregate up. Advisory would lose the
clear authority chain. Voting would treat all levels as peers
when they aren't. Peer would not roll up to a single decision.

## Synthesis rationale

`escalate-on-severity` runs at every non-leaf node: take the max
severity from children, union the evidence, emit the parent's
synthesised concern. The head's rule additionally emits the rolled-
up artifact as the assembly's final output.

## Threat model

Locked traits defend against the hierarchy itself rubber-stamping.
A manager pressured by deadline could suggest "skip review" or
"rubber-stamp the rest"; the substring check catches the artifact
at persistence time and refuses to write it. Signing is required —
every level's consultation row and rolled-up output carries a
signature.
```

---

## Example 5 — Locked-trait union chain

A three-level chain showing that locked traits accumulate monotonically across
descendants and that removing a parent's trait is a HARD refusal.

### Level 1 — Org root

```yaml
# /companies/acme/ASSEMBLY.md
---
schema: assembly.workspace/v1
name: acme-council-root
title: Acme Council (org root)
description: |
  Org-level workspace-root. Declares the warmth lock — the
  non-negotiable that all Acme assemblies inherit.
version: 1.0.0
mode: advisory

members:
  - persona: ws://personas/acme-therapist
    id: therapist
    role: Therapist
    phase: session

synthesis:
  rules:
    - id: pass-through
      kind: aggregate
      appliesTo: "*"

lockedTraits:
  - warmth
matchMode: substring

audit:
  consultations: { enabled: true }
  overlays: { enabled: true, maxActive: 6 }

executor: ws://operators/acme-clerk
---
# Acme Council (org root)

The org-level lock floor. `warmth` is the non-negotiable; every descendant
inherits it.
```

### Level 2 — Team adds another lock

```yaml
# /companies/acme/teams/research/ASSEMBLY.md
---
schema: assembly.workspace/v1
name: acme-research-council
title: Acme Research Council
description: |
  Research-team view extending the org root. Adds 'honesty' to the
  lock floor — research outputs MUST NOT modulate honesty.
version: 1.0.0
extends: ../../ASSEMBLY.md
appliesTo: [ws://companies/acme/teams/research]

# mode inherited from parent (advisory) — DO NOT change
# audit inherited from parent — DO NOT downgrade

lockedTraits:
  - warmth # inherited from parent (would-be HARD if omitted!)
  - honesty # added by this view

members:
  - persona: ws://personas/acme-research-critic
    id: critic
    role: Research Critic
    phase: session

synthesis:
  rules:
    - id: critic-priority
      kind: priority
      appliesTo: [critic]
      params: { triggerKind: rigor-violation }
---
# Acme Research Council

Adds `honesty` to the lock floor. Note that `warmth` is repeated in the array —
child manifests MUST repeat the parent's locked traits (the merge is a UNION,
but a child that omits an ancestor's trait trips the
`assembly_locked_trait_removed` HARD refusal at chain validation).
```

### Level 3 — Operator's view, tightening the floor further

```yaml
# /companies/acme/teams/research/operators/lead-researcher/ASSEMBLY.md
---
schema: assembly.workspace/v1
name: lead-researcher-council
title: Lead Researcher Council
description: |
  Per-operator view for the research lead. Adds 'refuse harm' to
  the lock floor — the lead's overlays cannot soften the safety
  posture, even within the research-team scope.
version: 1.0.0

extends: ../../ASSEMBLY.md
appliesTo: [ws://operators/lead-researcher]

lockedTraits:
  - warmth
  - honesty
  - refuse harm    # added by this view

members:
  - persona: ws://personas/acme-sentinel
    id: sentinel
    role: Sentinel
    phase: sentinel
---

# Lead Researcher Council

Effective `lockedTraits` after merge: `[warmth, honesty, refuse
harm]`. The lead-researcher's overlays are checked against all
three traits at persistence time.
```

### Counter-example — HARD refusal

This child would FAIL to load:

```yaml
# /companies/acme/teams/research/operators/junior/ASSEMBLY.md (REFUSED)
---
schema: assembly.workspace/v1
name: junior-researcher-council
title: Junior Researcher Council (REFUSED)
description: A junior researcher view trying to drop the warmth lock.
version: 1.0.0

extends: ../../ASSEMBLY.md
appliesTo: [ws://operators/junior-researcher]

# 'warmth' is missing from the array — REFUSED
lockedTraits:
  - honesty

members:
  - persona: ws://personas/acme-junior-critic
    id: critic
    role: Junior Critic
    phase: session
---
```

Loading this manifest produces:

```
HARD: assembly_locked_trait_removed
  message: lockedTraits in /companies/acme/teams/research/operators/junior/ASSEMBLY.md is missing entries declared by an ancestor: ['warmth']. lockedTraits is union-only across the extends chain — descendants MUST include all of an ancestor's entries.
  at: /companies/acme/teams/research/operators/junior/ASSEMBLY.md
```

The author MUST add `warmth` back to the array (and MAY add new traits) to load.
Removing a parent's trait is not supported — the junior researcher who genuinely
needs a different posture authors a NEW workspace-root manifest, not a view of
the existing one.

This is the safety floor invariant that makes the registry-of-views trustworthy:
every descendant view is at least as tight as every ancestor. An auditor
inspecting any view in the chain knows that `warmth` is locked.

---

## See also

- [AIP-24 — agentassembly/v1 spec](/docs/aip-24)
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./ASSEMBLY.schema.json`](./ASSEMBLY.schema.json) — frontmatter validator
- [`./skills/author-assembly-workspace/SKILL.md`](./skills/author-assembly-workspace/SKILL.md)
  — agent-side authoring skill
