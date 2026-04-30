---
schema: skills/v1
name: author-assembly-workspace
title: Author an ASSEMBLY.md (workspace root or view) for AIP-24
description:
  Walk through writing an assembly.workspace/v1 manifest — a multi-agent
  collective in advisory / voting / peer / hierarchy mode — using the
  defineAssemblyWorkspace canonical signature, with explicit mode-selection,
  member-roster authoring, synthesis-rule selection, locked-trait union
  semantics, and four one-way-switch checks before validation.
version: 1.0.0
tags:
  [
    aip-24,
    assembly,
    council,
    voting,
    peer,
    hierarchy,
    workspace,
    manifest,
    agentproto,
    composition,
    synthesis,
    locked-traits,
  ]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "a 5-mentor council for a Simone-shaped agent", "a small voting board for
      executive proposals", "a creative-critique peer panel", "an engineering
      review hierarchy", "a stricter per-operator view extending the org
      council"). The skill picks workspace-root vs view based on this and on
      whether a parent ASSEMBLY.md is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new ASSEMBLY.md will be written.
      For a workspace root, this is the assembly root. For a view, this is the
      consumer's folder (e.g. operators/<slug>, companies/<slug>,
      tenants/<slug>).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent ASSEMBLY.md, when authoring a
      view. If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, work
      workspaces, skills). Required when authoring a view that wants `appliesTo`
      populated; omitted for workspace-root mode.
  - name: mode
    type: string
    required: false
    description:
      One of advisory | voting | peer | hierarchy. When authoring a
      workspace-root, the skill prompts for this if not supplied. When authoring
      a view, the parent's mode is inherited and MUST NOT be changed (the skill
      refuses to set a different mode).
examples:
  - input:
      intent:
        A 5-mentor council in advisory mode for a Simone-shaped agent —
        therapist, stoic, elder, critic, sentinel — with the
        SIMONE_LOCKED_TRAITS floor and Simone's four synthesis rules.
      workspaceDir: /repo/assemblies/simone-council
      mode: advisory
    output:
      - /repo/assemblies/simone-council/ASSEMBLY.md (created, workspace root,
        mode=advisory)
  - input:
      intent:
        A per-operator view extending the org council, tightening the
        locked-trait floor with 'refuse harm' for the lead researcher.
      workspaceDir: /repo/companies/acme/teams/research/operators/lead/
      parentManifest: /repo/companies/acme/teams/research/ASSEMBLY.md
      appliesTo: [ws://operators/lead-researcher]
    output:
      - /repo/companies/acme/teams/research/operators/lead/ASSEMBLY.md (created,
        view, mode inherited)
---

# Author an `ASSEMBLY.md` (workspace root or view) for AIP-24

Use this skill when the user asks to **draft, extend, or revise** an
`assembly.workspace/v1` manifest under [AIP-24](/docs/aip-24). The skill
produces a valid manifest (workspace-root or view) for one of the four
collaboration modes — **advisory**, **voting**, **peer**, **hierarchy** — with
the right member roster, synthesis rules, locked-trait floor, audit policy, and
cross-AIP refs, ready for `defineAssemblyWorkspace` to load.

An `ASSEMBLY.md` manifest is the machine-readable contract for an
[AIP-24](/docs/aip-24) multi-agent collective — its identity, which mode it
operates in, who its members are (referenced as [AIP-25](/docs/aip-25)
personas), how their outputs combine, what the safety floor is, how artifacts
are persisted. The same doctype is used in two modes: a **workspace root** at
the assembly root (no `extends:`), and a **view** in any consumer folder (with
`extends:` pointing at a parent). Authoring either is the same flow, with one
branch on step 1.

**Critical:** AIP-24 delegates ALL persona-level concerns (system prompt, voice
register, persona fragments) to [AIP-25](/docs/aip-25). Do NOT inline persona
content in `ASSEMBLY.md` — declare member refs, then let AIP-25 own the persona
shape.

## When to use

- "Set up a new council / voting board / peer panel / hierarchy — write its
  `ASSEMBLY.md` from scratch."
- "Add a per-operator view that tightens the locked-trait floor or swaps a
  member's persona."
- "Bind an [AIP-7](/docs/aip-7) governance policy and an [AIP-20](/docs/aip-20)
  work workspace to this assembly."
- "Configure the synthesis rules for the assembly's mode."
- "Add a sentinel pre-filter to an existing advisory council."

## When NOT to use

- The user wants to **author a persona** (system prompt, voice, fragments) —
  that's [AIP-25](/docs/aip-25)'s `author-persona` skill.
- The user wants to **change the AIP-24 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **swap an assembly's mode mid-chain** — modes are one-way
  across the `extends:` chain. Author a NEW workspace-root manifest if a
  different mode is required.
- The user wants to **drop a parent's locked trait** — locked traits are
  union-only across descendants. The HARD refusal
  `assembly_locked_trait_removed` makes this impossible without re-rooting.

## Process

Follow these steps in order. Composition and one-way switches are the central
mechanics; steps 1-2 set up the right mode, steps 3-11 fill in the body, step 12
validates.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `ASSEMBLY.md` upstream that this manifest should
  adapt?** If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / work workspace / skill)? If yes → view (set `appliesTo`); if no →
  workspace root.

Workspace-root mode declares the BASE shape. View mode adapts the base for one
or more consumers. There is no third mode — the schema rejects manifests that
mix workspace-root and view properties (e.g. `appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, set `extends:`, understand the four one-way switches

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `ASSEMBLY.md`. The host resolves it bottom-up; recursion
is allowed.

```yaml
extends: ../../<parent-folder>/ASSEMBLY.md
```

Before writing the body, **read the parent and trace the four one-way switches
up the chain**:

- **`mode`** — once set at any ancestor, descendants MUST keep the same value.
  If the user wants a different mode, refuse and explain that they should author
  a new workspace-root manifest. Trying to switch trips `assembly_mode_change`
  (HARD).
- **`audit.consultations.enabled` / `audit.overlays.enabled`** — once `true` at
  any ancestor, descendants MUST keep `true` (or omit, inheriting `true`).
  Setting either to `false` trips `assembly_audit_disable` (HARD).
- **`audit.signing`** — once `required` at any ancestor, descendants MUST keep
  `required`. Downgrading to `optional` or `none` trips
  `assembly_signing_downgrade` (HARD).
- **`lockedTraits`** — once a trait is present at any ancestor, descendants MUST
  include it. Removing trips `assembly_locked_trait_removed` (HARD). Children
  MAY add new traits.

If the chain has any of these locked, plan for them: the new view inherits the
constraint and CANNOT relax it.

### 3. Identity (workspace name, title, description, version)

Fill in the workspace identity:

```yaml
schema: assembly.workspace/v1
name: <kebab-case-id>
title: <Human Readable Assembly Name>
description: |
  One paragraph: what this assembly does, who it serves, why this
  mode is the right pattern.
version: 1.0.0
```

`name` MUST be kebab-case and unique within its registry. `version` is the
WORKSPACE shape version — bump it on member-roster / synthesis-rule /
locked-trait / audit-policy changes. It's independent of the assembly's runtime
content version.

### 4. Pick the mode

The mode is the discriminating field. Pick by the question the assembly answers:

| Question                                                | Mode        |
| ------------------------------------------------------- | ----------- |
| "Is the agent's behavior drifting? Should it modulate?" | `advisory`  |
| "Should this proposal be approved?"                     | `voting`    |
| "What do these critics think when they argue?"          | `peer`      |
| "How does severity roll up the management chain?"       | `hierarchy` |

If the user asks for "a council", it's almost always `advisory`. If they ask for
"a board" or "approval body", it's `voting`. If they ask for "critique", it's
usually `peer`. If they ask for "reporting", it's `hierarchy`.

For a view, the mode is INHERITED from the parent. Do NOT set `mode:` to a
different value — the skill MUST refuse with the explanation that mode is
one-way across the `extends:` chain.

### 5. Members — pick personas and assign role config

Members are the bridge between the assembly and [AIP-25](/docs/aip-25). Each
member is a persona ref with assembly-specific role config layered on top.

```yaml
members:
  - persona: ws://personas/<slug> # AIP-25 ref (REQUIRED)
    id: <kebab-role-id> # required, stable role id
    role: <Human Label> # required
    # MODE-SPECIFIC FIELDS:
    phase: session # advisory only
    weight: 2.0 # voting only
    voteClass: [budget] # voting only
    parent: <member-id> # hierarchy only
    timeout_ms: 30000
    triggers: [sample]
    gatherInput:
      strategy: working-memory
```

Mode-appropriate field rules:

- **advisory**: `phase` SHOULD be set (`session` / `standing` / `sentinel` are
  the built-ins; custom is permitted). Avoid `weight`, `voteClass`, `parent` —
  they have no meaning.
- **voting**: `weight` SHOULD be set (default 1.0); `voteClass` MAY be set
  (default = all classes). Avoid `phase`, `parent`.
- **peer**: none of the mode fields are required.
- **hierarchy**: `parent` SHOULD be set on every non-root member. The host
  detects cycles. Avoid `phase`, `weight`, `voteClass`.

If the user has personas in mind by name, build the refs from the persona
registry's slug convention. If they don't have personas yet, surface this — the
personas MUST exist before the assembly can load
(`assembly_member_persona_unresolvable` HARD on missing refs). Suggest using
[AIP-25](/docs/aip-25)'s `author-persona` skill first.

### 6. Synthesis rules — match the mode's idiomatic rules

Synthesis rules combine member outputs into a single result. Pick rules typical
of the mode:

**Advisory** — typical rule stack:

```yaml
synthesis:
  rules:
    - id: <safety>-wins
      kind: terminal
      appliesTo: [<safety-member-id>]
      params: { triggerSeverity: 9, priority: 100 }
    - id: <critic>-priority
      kind: priority
      appliesTo: [<critic-member-id>]
      params: { triggerKind: <pattern>, priority: 80 }
    - id: severity-eight-unilateral
      kind: aggregate
      appliesTo: "*"
      params: { minSeverity: 8, priority: 70 }
    - id: moderate-aggregation
      kind: aggregate
      appliesTo: "*"
      params: { minSeverity: 5, maxSeverity: 7, topN: 2 }
```

**Voting** — typical rule stack:

```yaml
synthesis:
  rules:
    - id: <veto-member>-veto
      kind: terminal
      appliesTo: [<veto-member-id>]
      params: { triggerVote: no }
    - id: quorum
      kind: quorum
      appliesTo: "*"
      params: { threshold: 0.66 }
    - id: tie-break
      kind: majority
      appliesTo: "*"
      params: { tieBreaker: chair-vote, chair: <chair-id> }
```

**Peer** — typical (degenerate) rule:

```yaml
synthesis:
  rules:
    - id: collect-messages
      kind: aggregate
      appliesTo: "*"
      params: { topology: fully-connected, maxRounds: 3 }
```

**Hierarchy** — typical rule per non-leaf node:

```yaml
synthesis:
  rules:
    - id: aggregate-up
      kind: escalate-on-severity
      appliesTo: "*"
      params: { severityFn: max, evidenceFn: union }
```

Add a `riskLevels` mapping if the mode uses severity (advisory, hierarchy):

```yaml
synthesis:
  riskLevels:
    - { range: [0, 3], label: ok }
    - { range: [4, 6], label: watch }
    - { range: [7, 8], label: intervene }
    - { range: [9, 10], label: escalate }
```

The four labels are the built-ins; ranges MUST be monotonic and non-overlapping.

### 7. Locked traits — define the safety floor

`lockedTraits` is the assembly's non-negotiables — substrings (or regexes /
semantic patterns) that NO output may contain.

```yaml
lockedTraits:
  - warmth
  - honesty
  - refuse harm
matchMode: substring # default; rarely changed
```

For a workspace-root, pick traits that, if eroded, would make the underlying
agent a different agent rather than a slightly-tuned one. Simone's six
(`warmth`, `honest`, `voice register`, `refuse harm`, `kindness`,
`core persona`) are a reasonable starter for an advisory council on a
companion-shaped agent.

For a view, **REPEAT all of the parent's locked traits** in the array, then add
new ones. The merge is a UNION across the chain, but a child that omits an
ancestor's trait trips `assembly_locked_trait_removed` (HARD). Repeating is the
safer authoring posture — explicit consent to keeping the floor.

Avoid `matchMode: semantic` unless the host advertises support; the substring
fallback is permissive (`assembly_locked_trait_match_mode_unsupported` warning).

### 8. Audit policy — consultations, overlays, signing

```yaml
audit:
  consultations:
    enabled: true # ONE-WAY: cannot disable in descendants
    retention: forever
  overlays:
    enabled: true # ONE-WAY: cannot disable in descendants
    maxActive: 10
    defaultTtl: P14D # ISO 8601 duration
  signing: optional # ONE-WAY on downgrade if 'required' at ancestor
```

For workspace-root: `enabled: true` is the safe default — the audit trail is the
spec's third-party-verifiability posture, and disabling it later is
HARD-refused. Set `signing: required` only when the host implements signing
(`assembly_signing_unsupported` HARD if not).

For views: omit fields you don't need to override. Do NOT set `enabled: false`
(HARD refusal). Do NOT downgrade `signing` (HARD refusal).

### 9. Cross-AIP bindings (identity, governance, work, executor)

```yaml
identity: ws://identities/<slug> # AIP-23
governance: <path-or-ref> # AIP-7
work: ws://workspaces/<slug> # AIP-20
executor: ws://operators/<slug> # AIP-9
```

`executor` is the runtime that executes the assembly. For single-agent shaped
assemblies (Simone Council), it's the agent's own operator. For org-shaped
assemblies (voting board, hierarchy), it's typically a clerk operator.

`identity` is the base identity the assembly modulates (advisory) or attributes
to (voting / peer / hierarchy). For a Simone-shaped council, it's
`ws://identities/simone`.

`governance` and `work` are optional but conventional. Bind to a governance
policy when signing or approval gates apply; bind to a work workspace when the
assembly's artifacts attach to work items.

A workspace whose binding does not resolve at load time refuses with
`assembly_xref_unresolvable` (HARD).

### 10. Display / UX defaults

```yaml
display:
  defaultGrouping: phase # advisory: 'phase'; others: 'role' or 'severity'
defaults:
  triggerHeuristic: every-n-messages
```

Pick `defaultGrouping` by what makes sense for the mode:

- `phase` — advisory (group by session / standing / sentinel)
- `role` — voting / peer (each member has a labeled role)
- `severity` — hierarchy (group by severity level)

For `defaults.triggerHeuristic`, pick by mode:

- `every-n-messages` — advisory (Simone Council on conversation flow)
- `manual` — voting (proposals submitted explicitly)
- `on-mode-change` — peer (kicks in when a campaign state changes)
- `manual` — hierarchy (review cycles)

### 11. Body prose

The frontmatter ends; write the body in markdown. Conventional sections:

- `## Purpose` — what this assembly is for, who it serves.
- `## Mode rationale` — why advisory (or voting / peer / hierarchy) is the right
  pattern. (Eliminate the other three.)
- `## Member roster` — human-readable rendering of the members, their phases
  (advisory) / weights (voting) / topology (peer) / tree (hierarchy).
- `## Synthesis rationale` — why these rules in this order.
- `## Threat model` — what the locked-trait floor defends against.
- `## When to extend vs replace` — guidance for downstream view authors.

The body is free-form prose. The contract lives in the frontmatter.

### 12. Validate

Before declaring the manifest done:

1. **Schema-validate** against
   [`./ASSEMBLY.schema.json`](../../ASSEMBLY.schema.json). All required fields
   present? `mode` is one of the four enum values? Member ids are unique?
2. **If view: dry-run the merge.** Walk the chain in your head: what is the
   effective `mode` (must match the parent's)? What is the effective
   `lockedTraits` (must INCLUDE every parent trait)? What is the effective
   `audit.{consultations,overlays}.enabled` (must be `true` if any ancestor sets
   it true)? What is `audit.signing` (must be `required` if any ancestor sets it
   required)?
3. **Check no one-way switch is relaxed.** Surface a diff vs the parent's
   effective config. Any field that's a one-way switch relaxation is a HARD
   refusal — fix before persisting.
4. **Validate cross-AIP refs.** Every `members[].persona`, `identity`,
   `governance`, `work`, `executor`, `appliesTo` element MUST resolve in the
   host's registries.
5. **Sanity-check synthesis.** Are the rule `appliesTo` member ids present in
   the merged `members[]`? Are the rule `kind` values registered with the host's
   rule registry? Is there at most one `terminal` rule with overlapping
   `appliesTo` per phase? (Two trip the `assembly_synthesis_terminal_chain`
   warning.)
6. **Run the host's `validate(assemblyRoot)` helper** if the host exposes one.
   Report any failures with file + field path.

If validation passes, write the manifest to disk. Otherwise, fix the issues and
re-validate.

## Output format

A single `ASSEMBLY.md` file at `workspaceDir/ASSEMBLY.md`. The content:

```markdown
---
<frontmatter, validated against ASSEMBLY.schema.json>
---

# <title>

## Purpose

...

## Mode rationale

...

## Member roster

...

## Synthesis rationale

...

## Threat model

...

## When to extend vs replace

...
```

The frontmatter is the contract; the body is free-form context for human
reviewers.

## Common pitfalls

- **Mixing mode-specific fields.** A member with both `phase` and `weight` is
  suspicious — most modes use only one set. The schema permits it, but the host
  SHOULD warn. If you're authoring an advisory member, drop `weight` /
  `voteClass` / `parent`.
- **Forgetting to repeat parent's locked traits.** The merge is a UNION;
  children MUST repeat ancestor entries or trip `assembly_locked_trait_removed`.
  Authors who think "the parent already has it" are wrong — the validator runs
  the array literally.
- **Setting `mode` in a view.** Views inherit `mode`. Setting it to the SAME
  value is redundant; setting it to a DIFFERENT value is HARD-refused. Skip
  `mode` entirely in views.
- **Inlining persona content.** Resist the temptation to write the persona's
  system prompt in `ASSEMBLY.md`. That's [AIP-25](/docs/aip-25)'s job. Reference
  the persona by `ws://` URI and let AIP-25 own the prompt.
- **Inflating `audit.overlays.maxActive`.** A high cap (100+) makes the agent's
  instructions fan out into many simultaneous overlays. Most advisory councils
  want 6 or fewer.
- **Using `matchMode: semantic` blindly.** Hosts that don't implement semantic
  match silently fall back to substring; the warning surfaces but the floor is
  looser than the author thought. Stick with `substring` unless the host
  advertises semantic.
- **Picking a mode for the wrong question.** Advisory is for "should the agent
  modulate?". Voting is for "should this be approved?". Peer is for "what do
  critics think when they argue?". Hierarchy is for "how does severity roll
  up?". Picking the wrong one means the synthesis rules don't fit the artifacts
  the consumer expects.

## See also

- [AIP-24 — agentassembly/v1 spec](/docs/aip-24)
- [AIP-25 — agentpersona/v1](/docs/aip-25) — the unit of identity each member
  references
- [AIP-23 — agentidentity/v1](/docs/aip-23) — base identity advisory overlays
  modulate
- [AIP-7 — governance, approval, audit](/docs/aip-7) — one-way-switch
  convention; signing posture
- [AIP-20 — agentwork/v2](/docs/aip-20) — work workspace the assembly attaches
  to
- [AIP-9 — agentoperators/v1](/docs/aip-9) — runtime executor
- [`./ADAPTER.md`](../../ADAPTER.md) — implementer's guide
- [`./ASSEMBLY.schema.json`](../../ASSEMBLY.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](../../EXAMPLES.md) — reference manifests for all four modes
