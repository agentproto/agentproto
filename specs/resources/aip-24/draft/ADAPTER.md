# ADAPTER.md — implementing AIP-24 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and run** [AIP-24](/docs/aip-24)
`agentassembly/v1` workspaces. It is normative for the parts marked MUST and
informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing
`defineAssemblyWorkspace` to manifest authors, resolving member persona refs to
[AIP-25](/docs/aip-25) personas, running the mode-specific synthesis pipeline,
and persisting consultations and overlay artifacts. Manifest authors themselves
should read
[`./skills/author-assembly-workspace/SKILL.md`](./skills/author-assembly-workspace/SKILL.md),
not this file.

## Contract overview

A conforming host implements **five responsibilities**:

1. **Load the workspace manifest** — read `ASSEMBLY.md` at the assembly root (or
   in a consumer folder for a view), validate against
   [`./ASSEMBLY.schema.json`](./ASSEMBLY.schema.json), resolve any `extends:`
   chain, expose both the merged effective config and the resolution chain.
2. **Validate workspace-level invariants** — the four one-way switches (`mode`,
   `audit.consultations.enabled` / `audit.overlays.enabled`, `audit.signing`,
   `lockedTraits` entries) MUST be checked across the resolved chain; violations
   are HARD refusals.
3. **Resolve `extends:`** — walk the chain bottom-up, merge per the strategy
   table, expose warnings on malformed chains, refuse views with unresolvable
   `appliesTo` bindings.
4. **Register members** — for each entry in `members[]`, resolve the persona ref
   through [AIP-25](/docs/aip-25), layer the assembly-role config (phase /
   weight / voteClass / parent) on top, refuse unresolvable persona refs and
   member-id collisions.
5. **Run the mode-specific synthesis pipeline** — gather inputs in parallel,
   invoke members in parallel, persist consultations, apply synthesis rules in
   declaration order, lock-check outputs, persist mode-specific artifacts, emit
   the final result.

The signature `defineAssemblyWorkspace` is the boundary between the host and the
manifest author.

## Loading `ASSEMBLY.md`

The workspace manifest is the host's first read on every assembly load and on
every consumer (operator/company/work-workspace) activation.

### Resolution algorithm

When a host reads an `ASSEMBLY.md`:

1. **Parse the frontmatter** as YAML. Validate against the schema in
   [`./ASSEMBLY.schema.json`](./ASSEMBLY.schema.json). On failure, surface
   `assembly_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `assembly_extends_missing` as a
     WARNING (not an error), use the local manifest only, mark the chain as
     broken, and proceed.
   - If the parent has already appeared in the visited set: emit
     `assembly_extends_cycle` as a WARNING, break the chain at the cycle point,
     use the partial chain, and proceed.
   - If the chain depth would exceed eight: emit
     `assembly_extends_depth_exceeded` as a WARNING, break the chain at the
     eighth ancestor, use the partial chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below.
5. **Check the four one-way switches across the resolved chain.** For each
   one-way switch (`mode`, `audit.consultations.enabled` /
   `audit.overlays.enabled`, `audit.signing`, `lockedTraits` entries), walk the
   resolution chain and verify no descendant relaxes the ancestor's value. If
   the chain violates an invariant, refuse with the corresponding HARD code
   (`assembly_mode_change`, `assembly_audit_disable`,
   `assembly_signing_downgrade`, `assembly_locked_trait_removed`). Unlike chain
   warnings, these are HARD failures: the view is rejected.
6. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `assembly_appliesto_unresolvable` if any binding fails to resolve.
7. **Register members** by walking the merged `members[]` array. See
   [Member registration](#member-registration).
8. **Validate cross-AIP refs** — `identity`, `governance`, `work`, `executor`.
   Each unresolvable ref surfaces `assembly_xref_unresolvable` (HARD for
   `identity`/`governance`/ `work`/`executor`).

The host MUST NOT execute any code in `ASSEMBLY.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                                                             | Strategy                          | Notes                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`                                                         | override                          | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                                                                  |
| `extends`                                                                                         | local-only                        | Not inherited.                                                                                                                                                                                 |
| `appliesTo`                                                                                       | local-only                        | Not inherited. Each view declares its own scope.                                                                                                                                               |
| `mode`                                                                                            | child wins (one-way)              | Once set at any ancestor, descendants MUST NOT change to a different mode. HARD: `assembly_mode_change`.                                                                                       |
| `members`                                                                                         | merge-by-id                       | Effective key is `members[].id`. Child entry with same id → child replaces parent's; new ids appended. Within a single layer, duplicate ids refuse with `assembly_member_id_collision` (HARD). |
| `members[].persona`                                                                               | override                          | A child MAY swap the persona ref for a given role. The new ref MUST resolve.                                                                                                                   |
| `members[].phase` / `weight` / `voteClass` / `parent` / `triggers` / `timeout_ms` / `gatherInput` | leaf-field override               | Each role-config field overrides independently.                                                                                                                                                |
| `synthesis.rules`                                                                                 | merge-by-id                       | Same rule id → child replaces parent's. New ids appended.                                                                                                                                      |
| `synthesis.riskLevels`                                                                            | override                          | Whole-array override; child's risk-level mapping replaces parent's.                                                                                                                            |
| `lockedTraits`                                                                                    | UNION                             | Additive only. Child MUST NOT remove parent's entries. HARD: `assembly_locked_trait_removed`.                                                                                                  |
| `matchMode`                                                                                       | override                          | Child MAY tighten (substring → regex → semantic).                                                                                                                                              |
| `audit.consultations.enabled` / `audit.overlays.enabled`                                          | child wins (one-way)              | Once `true` at any ancestor, descendants MUST NOT set `false`. HARD: `assembly_audit_disable`.                                                                                                 |
| `audit.consultations.retention` / `audit.overlays.maxActive` / `audit.overlays.defaultTtl`        | leaf-field override               |                                                                                                                                                                                                |
| `audit.signing`                                                                                   | child wins (one-way on downgrade) | Once `required` at any ancestor, descendants MUST NOT downgrade to `optional` or `none`. HARD: `assembly_signing_downgrade`.                                                                   |
| `identity`, `governance`, `work`, `executor`                                                      | override                          | Child can rebind. Subject to one-way switches (signing) and governance gating.                                                                                                                 |
| `defaults.*`                                                                                      | leaf-field override               | `triggerHeuristic`, `triggerInterval_ms` each override independently.                                                                                                                          |
| `display.*`                                                                                       | leaf-field override               |                                                                                                                                                                                                |
| `metadata`                                                                                        | deep-merge                        | Recursive merge; vendor namespaces accumulate.                                                                                                                                                 |

## Member registration

For each entry in the merged `members[]`, the host MUST:

1. **Validate id uniqueness within the merged manifest.** The merge algorithm
   deduplicates parent / child by id (child wins); but a single layer with two
   entries sharing the same id is ill-formed. Refuse with
   `assembly_member_id_collision` (HARD).
2. **Resolve the persona ref.** `members[].persona` is a `ws://personas/<slug>`
   URI. Resolve through the host's persona registry under
   [AIP-25](/docs/aip-25). Unresolvable refs refuse with
   `assembly_member_persona_unresolvable` (HARD). Cross-tenant resolution is
   forbidden — the persona ref MUST resolve in the same tenant scope as the
   manifest file.
3. **Layer assembly-role config.** The persona declares its identity (system
   prompt, voice register, persona fragments); the assembly's `members[]` entry
   overlays the role-specific configuration (phase / weight / voteClass / parent
   / triggers / timeout_ms / gatherInput). The host's runtime constructs a
   "member instance" object combining both: the persona for the model
   invocation, the role config for the orchestrator.
4. **Validate mode-appropriate fields.** Per `mode`:
   - `advisory` — `phase` SHOULD be present; SHOULD use one of `session` /
     `standing` / `sentinel`. Custom phases are permitted. `weight`,
     `voteClass`, `parent` SHOULD be absent (they have no meaning); the host
     SHOULD warn but accept.
   - `voting` — `weight` SHOULD be present (default 1.0). `voteClass` MAY be
     present (default: votes on all classes). `phase`, `parent` SHOULD be
     absent.
   - `peer` — none of `phase` / `weight` / `voteClass` / `parent` are required.
   - `hierarchy` — `parent` SHOULD be present except for root members (the root
     has no parent). `phase`, `weight`, `voteClass` SHOULD be absent. The host
     MUST detect hierarchy cycles (a → b → a) at member registration time and
     refuse with `assembly_hierarchy_cycle` (HARD).
5. **Expose member registration** through the merged effective config: a debug
   surface keyed by member id returning the resolved persona, the role config,
   and the registration source (which manifest in the chain contributed which
   field).

## Synthesis pipeline

The synthesis pipeline runs once per assembly invocation. The high-level shape
is mode-agnostic; the rule application and artifact persistence are per-mode.

### Advisory pipeline

Canonical for the implemented Council mode. The pipeline mirrors the working
`createCouncilWorkflow` in `packages/agent-framework/src/council/`:

```
invocation: { trigger, phase, userId, threadId, locale }
  ↓
1. phase-filter: keep only members where members[].phase == invocation.phase
  ↓
2. parallel: gather inputs per member (members[].gatherInput.strategy)
  ↓
3. parallel: invoke members (members[].timeout_ms cap each)
  ↓
4. persist consultations (one row per member output)
  ↓
5. synthesise: run synthesis.rules in declaration order
   - rule.kind == 'terminal' and predicate fires → emit fragments,
     mark terminal, skip remaining rules
   - rule.kind == 'priority' and predicate fires → append fragments
   - rule.kind == 'aggregate' → top-N by severity desc, evidence desc
  ↓
6. lock-check: for each candidate fragment, run lockedTraits via
   matchMode. On match: drop fragment, append note to synthesisNotes.
  ↓
7. persist surviving fragments as overlay records (audit.overlays.*)
  ↓
8. prune overlays to audit.overlays.maxActive (oldest evicted first)
  ↓
9. compute riskLevel (max severity → synthesis.riskLevels mapping)
  ↓
emit CouncilGuidance { phase, riskLevel, fragments, mentorOutputs,
                       shouldEscalate, synthesisNotes }
```

### Voting pipeline

```
invocation: { proposal: { id, class, body }, voters: [...] }
  ↓
1. class-filter: keep only members where members[].voteClass includes
   proposal.class (or voteClass omitted = all classes)
  ↓
2. parallel: gather inputs per member (members[].gatherInput.strategy)
  ↓
3. parallel: invoke members (members[].timeout_ms cap each)
   each member returns { vote: yes | no | abstain, rationale, evidence }
  ↓
4. persist consultations (one row per member vote)
  ↓
5. synthesise: run synthesis.rules in declaration order
   - rule.kind == 'quorum' → tally weights of yes votes / total
     non-abstain weights; passes if ratio >= params.threshold
   - rule.kind == 'majority' → quorum with threshold 0.5 + tieBreaker
   - rule.kind == 'unanimity' → passes IFF every voter votes yes
   - rule.kind == 'terminal' → if a voter's output crosses
     params.triggerVote, short-circuit (e.g. one veto blocks)
  ↓
6. lock-check: scan the rationale text of each vote and the
   decision text against lockedTraits. On match: refuse the
   artifact (do not persist the decision); persist a violation row.
  ↓
7. persist decision record (audit.overlays.*) — { decision: pass / fail,
   tally, votes, evidence }
  ↓
emit Decision { decision, rationale, tally, votes, lockViolations }
```

### Peer pipeline

```
invocation: { round, topology }
  ↓
1. topology lookup: who can address whom
   (default: fully connected; advanced: per-member peers list)
  ↓
2. parallel: gather inputs per member
   gatherInput receives the prior round's messages (via 'recent-messages')
  ↓
3. parallel: invoke members (members[].timeout_ms cap each)
   each member returns { message, addressedTo: [...] | "*" }
  ↓
4. persist consultations (one row per member message)
  ↓
5. synthesise: run synthesis.rules in declaration order
   - rule.kind == 'aggregate' (typical) → collect into the message log
   - rule.kind == 'custom' → host-defined topology aggregation
  ↓
6. lock-check: scan each message text against lockedTraits.
   On match: drop the message, persist violation row.
  ↓
7. persist message log entries (audit.overlays.*)
  ↓
8. termination: run params.terminationRule (or cap at params.maxRounds)
  ↓
emit MessageLog { round, entries, lockViolations }
```

### Hierarchy pipeline

```
invocation: { rootRequest }
  ↓
1. tree topology: derive from members[].parent — leaves are members
   with no other member's parent pointing at them
  ↓
2. bottom-up traversal:
   for level from leaves up to root:
     parallel: gather + invoke members at this level
       (non-leaf members receive their children's outputs as input
        via members[].gatherInput.strategy or built-in 'children-outputs')
     persist consultations
     synthesise per-node:
       - rule.kind == 'escalate-on-severity' → max severity, evidence union
       - rule.kind == 'aggregate' → top-N child outputs
       - rule.kind == 'terminal' → if a child's severity crosses
         params.triggerSeverity, propagate verbatim
     lock-check the node's emitted output against lockedTraits.
       On match: refuse the node's output (the parent receives nothing
       from this child; persist violation row).
  ↓
3. emit root output as the assembly's result
  ↓
4. persist rolled-up output (audit.overlays.*)
  ↓
emit HierarchyOutput { rootOutput, perLevelArtifacts, lockViolations }
```

## Locked-trait enforcement

The lock-check is AIP-24's distinctive safety substrate. It runs at
**persistence time** for every candidate artifact. The algorithm depends on
`matchMode`:

### `substring` (default, matches Simone v1)

```
for trait in lockedTraits:
    if trait.lower() in candidate_text.lower():
        return { violated: true, matched: trait }
return { violated: false }
```

Cheap, robust, exact match. Catches `warmth` in "be less warm" or "reduce
warmth"; misses `warm` in `lukewarm` only by coincidence (`warm` is a substring
of `lukewarm`, so it would match — authors should pick traits carefully).

### `regex`

```
for trait in lockedTraits:
    pattern = compile(trait, flags=I)
    if pattern.search(candidate_text):
        return { violated: true, matched: trait }
return { violated: false }
```

Useful when the trait is a phrase whose variants must all be caught.
`warm(th|ly)?` catches `warm`, `warmth`, `warmly`. The host SHOULD compile each
pattern once at manifest load time, not per check.

### `semantic`

```
trait_embeddings = embed(lockedTraits)
candidate_embedding = embed(candidate_text)
for i, trait_emb in enumerate(trait_embeddings):
    if cosine(candidate_embedding, trait_emb) >= threshold:
        return { violated: true, matched: lockedTraits[i] }
return { violated: false }
```

Embedding-based, matches semantic neighborhood. Hosts that don't implement
semantic match MUST fall back to `substring` and emit a load-time warning
(`assembly_locked_trait_match_mode_unsupported`). The fallback is strictly more
permissive in surface area; the additive-only nature of `lockedTraits` ensures
the floor remains at least as tight as the parent's substring posture.

### Persistence-time vs serialization-time

Lock-check runs at **persistence time** — when the host is about to write the
artifact (overlay, decision, message, hierarchy output) to durable storage.
Running at serialization time (when the artifact is constructed from the rule
output) would also work but loses the audit trail: the consultation row is
persisted unchanged regardless of whether the artifact survives lock-check.
Reviewers can see what was attempted, what was rejected, and why.

### Rejection vs warning

The lock-check is a HARD per-artifact refusal. The artifact is not written. The
host MUST persist a violation row (a special kind of consultation row, or a
separate violation log) so reviewers can audit. Hosts SHOULD surface
`assembly_overlay_lock_violation` with the matched trait and the member id whose
output triggered the rejection.

## Audit pipeline

`audit.consultations.enabled: true`:

- Every member invocation produces one consultation row.
- Row contents:
  `{ assemblyName, memberId, mode, phase, output, trigger, lockCheckResult, signature?, createdAt }`.
- Retention per `audit.consultations.retention`. `forever` is the safe default
  for advisory mode (training data, drift detection).

`audit.overlays.enabled: true`:

- Every surviving artifact produces one overlay row (or decision row for voting,
  message log entry for peer, rolled-up output for hierarchy).
- Cap enforced on every write per `audit.overlays.maxActive`. The eviction
  policy is "oldest first" (FIFO) by default; hosts MAY expose an alternate
  priority-based eviction if all artifacts carry priorities.
- TTL eviction runs on every write (lazy) and SHOULD also run on a periodic
  sweep (eager). Expired artifacts are removed; the consultation row that
  produced them is retained.

`audit.signing: required`:

- Every consultation row, every overlay/decision/message/hierarchy artifact MUST
  carry a signature verifiable against the bound `governance` AIP-7 policy.
- The signing key, algorithm, and verification chain are AIP-7 concerns; AIP-24
  declares the posture, AIP-7 owns the cryptography.
- Hosts that don't implement signing MUST refuse to load a manifest with
  `audit.signing: required` (`assembly_signing_unsupported`).

## Cross-AIP ref resolution

| Ref                                          | AIP                                                                                           | Resolver                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `members[].persona` (`ws://personas/<slug>`) | [AIP-25](/docs/aip-25)                                                                        | Look up the persona in the host's persona registry; verify it exists, the host can activate it, and tenant scope matches. |
| `identity` (`ws://identities/<slug>`)        | [AIP-23](/docs/aip-23)                                                                        | Look up the identity workspace.                                                                                           |
| `governance` (path or ref)                   | [AIP-7](/docs/aip-7)                                                                          | Resolve as a relative path to a policy file or a ws:// ref. The signing posture composes with `audit.signing`.            |
| `work` (`ws://workspaces/<slug>`)            | [AIP-20](/docs/aip-20)                                                                        | Look up the work workspace.                                                                                               |
| `executor` (`ws://operators/<slug>`)         | [AIP-9](/docs/aip-9)                                                                          | Look up the operator workspace; verify the host can activate it.                                                          |
| `appliesTo` elements                         | [AIP-9](/docs/aip-9) / [AIP-22](/docs/aip-22) / [AIP-20](/docs/aip-20) / [AIP-3](/docs/aip-3) | Look up the consumer per the URI prefix.                                                                                  |
| `extends` (path)                             | AIP-24                                                                                        | Resolve as a relative path to another `ASSEMBLY.md`.                                                                      |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer (HARD, `assembly_appliesto_unresolvable`).

`identity` / `governance` / `work` / `executor` enforcement: a host MUST refuse
a workspace whose binding does not resolve at load time (HARD,
`assembly_xref_unresolvable`).

`members[].persona` enforcement: a host MUST refuse a workspace whose member
persona refs do not resolve (HARD, `assembly_member_persona_unresolvable`).
Silent degradation to a smaller roster would invalidate every synthesis rule's
`appliesTo` and could change synthesis semantics in ways the manifest author did
not consent to.

## View activation

When an [AIP-9](/docs/aip-9) operator (or an [AIP-22](/docs/aip-22) company
workspace, an [AIP-20](/docs/aip-20) work workspace, or an [AIP-3](/docs/aip-3)
skill) loads, the host SHOULD:

1. Look for an `ASSEMBLY.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above (including the four one-way
   switch checks across the chain).
3. Pass the merged effective config to the consumer's runtime context: trigger
   heuristics, lock-check, audit policy, and member roster all derive from the
   merged manifest.
4. Expose the resolution chain on a debug surface keyed by the consumer's id so
   reviewers can audit which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`ASSEMBLY.md` directly. Consumers without their own view inherit the assembly's
default lens.

## Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedAssemblyWorkspace = {
  effective: AssemblyWorkspace // merged config
  chain: Array<{
    // resolution chain (root → leaf)
    path: string // absolute path to the manifest
    doctype: "assembly.workspace/v1"
    name: string
    version: string
  }>
  members: Array<{
    // resolved member registrations
    id: string
    persona: ResolvedPersona // delegated AIP-25 resolution
    role: string
    phase?: string
    weight?: number
    voteClass?: string[]
    parent?: string
    triggers?: string[]
    timeout_ms: number
    gatherInput: { strategy: string; params: Record<string, unknown> }
    sourceManifest: string // which manifest in the chain wrote this
  }>
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "assembly_extends_missing"
      | "assembly_extends_cycle"
      | "assembly_extends_depth_exceeded"
      | "assembly_locked_trait_match_mode_unsupported"
      | "assembly_synthesis_terminal_chain"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

The merged `effective` is what consumers use; the `chain` is what tooling uses
to explain _where_ a field came from; the `members` array is the
workspace-to-AIP-25 bridge surface; the `warnings` list is empty on a healthy
load.

## Conflict cases

The following examples illustrate the merge rules and HARD refusals with
concrete parent/child manifests. Each is a minimal pair, not a full manifest.
There is one example per mode plus the four hard-refusal cases.

**1. Advisory — locked-trait union (advisory mode chain).**

Parent (`<assembly-root>/ASSEMBLY.md`):

```yaml
schema: assembly.workspace/v1
mode: advisory
lockedTraits: [warmth, honesty]
```

Child (`operators/eng-lead/ASSEMBLY.md`):

```yaml
extends: ../../<assembly-root>/ASSEMBLY.md
appliesTo: [ws://operators/eng-lead]
lockedTraits: [refuse-harm, kindness]
```

Effective `lockedTraits`: `[warmth, honesty, refuse-harm, kindness]` (union).
The host registers the view with all four locked traits; the eng-lead consumer's
overlays are checked against all four.

**2. Voting — proposal-class narrowing.**

Parent declares a board member voting on `[budget, architecture]`:

```yaml
mode: voting
members:
  - persona: ws://personas/cfo
    id: cfo
    role: Chief Financial Officer
    weight: 2.0
    voteClass: [budget, architecture]
```

Child narrows the CFO's vote class to budget only:

```yaml
extends: ../parent/ASSEMBLY.md
members:
  - persona: ws://personas/cfo
    id: cfo
    role: Chief Financial Officer
    weight: 2.0
    voteClass: [budget]
```

Effective: same persona, narrower vote class. The CFO no longer votes on
architecture proposals in this view. The host registers the merged member
record.

**3. Peer — adding a critic to the network.**

Parent (3-peer brand critique):

```yaml
mode: peer
members:
  - { persona: ws://personas/brand, id: brand, role: Brand }
  - { persona: ws://personas/copy, id: copy, role: Copy }
  - { persona: ws://personas/visual, id: visual, role: Visual }
```

Child adds a fourth peer:

```yaml
extends: ../parent/ASSEMBLY.md
members:
  - { persona: ws://personas/legal, id: legal, role: Legal }
```

Effective: four peers, fully-connected by default. Each peer can address any
other; the merged manifest exposes all four.

**4. Hierarchy — re-parenting a member.**

Parent declares a 3-level reporting tree with `manager-a` reporting to
`head-eng`:

```yaml
mode: hierarchy
members:
  - { persona: ws://personas/ceo, id: ceo, role: CEO }
  - {
      persona: ws://personas/head-eng,
      id: head-eng,
      role: Head of Engineering,
      parent: ceo,
    }
  - {
      persona: ws://personas/manager-a,
      id: manager-a,
      role: Manager,
      parent: head-eng,
    }
```

Child re-parents `manager-a` to a different team head:

```yaml
extends: ../parent/ASSEMBLY.md
members:
  - {
      persona: ws://personas/head-product,
      id: head-product,
      role: Head of Product,
      parent: ceo,
    }
  - {
      persona: ws://personas/manager-a,
      id: manager-a,
      role: Manager,
      parent: head-product,
    }
```

Effective: the merge by-id replaces `manager-a`'s parent with `head-product` (a
new member appended in the same view). The host runs cycle detection and accepts
the new tree.

**5. HARD: mode change.**

Parent:

```yaml
mode: advisory
```

Child:

```yaml
extends: ../parent/ASSEMBLY.md
mode: voting
```

Result: the host refuses with `assembly_mode_change` (HARD). The view does NOT
degrade to local-only — switching from advisory to voting would invalidate every
member's `phase` configuration, silently drop the lock-check on overlay
fragments (advisory overlays vs voting decisions are different artifact kinds),
and change the audit semantics. The author MUST author a new workspace-root
manifest if a different mode is required.

**6. HARD: locked-trait removed.**

Parent:

```yaml
lockedTraits: [warmth, honesty]
```

Child:

```yaml
extends: ../parent/ASSEMBLY.md
lockedTraits: [warmth] # removed 'honesty'
```

Result: the host refuses with `assembly_locked_trait_removed` (HARD), naming the
missing trait. The child MUST keep `honesty` in its array (and MAY add new
traits) to load. Removing a trait at the workspace level is not supported; if a
consumer needs a different floor, the consumer authors a new workspace-root
manifest, not a view.

**7. HARD: audit downgrade.**

Parent:

```yaml
audit:
  consultations: { enabled: true }
  overlays: { enabled: true }
```

Child:

```yaml
extends: ../parent/ASSEMBLY.md
audit:
  consultations: { enabled: false }
```

Result: the host refuses with `assembly_audit_disable` (HARD). The chain is
rejected — the view does NOT degrade. The author MUST remove the
`enabled: false` override.

**8. HARD: signing downgrade.**

Parent:

```yaml
audit: { signing: required }
```

Child:

```yaml
extends: ../parent/ASSEMBLY.md
audit: { signing: optional }
```

Result: the host refuses with `assembly_signing_downgrade` (HARD). Once any
ancestor sets `signing: required`, descendants MUST keep `required` (or omit,
inheriting `required`). Authors who want a relaxed signing posture MUST author a
new workspace-root manifest.

## Error envelope

All errors leave the host as:

```ts
type AssemblyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; at?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-24 vocabulary:

| Code                                           | Severity                                               | Meaning                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assembly_workspace_invalid`                   | HARD                                                   | `ASSEMBLY.md` frontmatter fails schema validation. Returns the failing field path.                                                                                                              |
| `assembly_extends_cycle`                       | warn                                                   | `extends:` chain visits the same manifest twice. Runtime breaks the chain at the cycle point.                                                                                                   |
| `assembly_extends_missing`                     | warn                                                   | View's `extends:` points to a non-existent file. Runtime degrades to local-only.                                                                                                                |
| `assembly_extends_depth_exceeded`              | warn                                                   | Chain depth exceeds eight. Runtime breaks at the eighth ancestor.                                                                                                                               |
| `assembly_appliesto_unresolvable`              | HARD                                                   | View's `appliesTo` references a consumer (operator/company/work/skill) that does not exist. View is refused.                                                                                    |
| `assembly_audit_disable`                       | HARD                                                   | Descendant relaxes `audit.consultations.enabled` or `audit.overlays.enabled` from true to false. View is refused.                                                                               |
| `assembly_signing_downgrade`                   | HARD                                                   | Descendant downgrades `audit.signing` from `required`. View is refused.                                                                                                                         |
| `assembly_mode_change`                         | HARD                                                   | Descendant changes `mode` to a different value than an ancestor. View is refused.                                                                                                               |
| `assembly_locked_trait_removed`                | HARD                                                   | Descendant's `lockedTraits` does not include all of an ancestor's entries. View is refused.                                                                                                     |
| `assembly_locked_trait_match_mode_unsupported` | warn                                                   | Manifest declares `matchMode: semantic` but host doesn't support it; host falls back to substring.                                                                                              |
| `assembly_member_persona_unresolvable`         | HARD                                                   | A member's persona ref does not resolve, or resolves outside the manifest's tenant scope. View is refused.                                                                                      |
| `assembly_member_id_collision`                 | HARD                                                   | Two members within a single manifest layer share the same `id`. View is refused.                                                                                                                |
| `assembly_synthesis_rule_invalid`              | HARD                                                   | Synthesis rule's `kind` is not registered with the host's rule registry. View is refused.                                                                                                       |
| `assembly_synthesis_unknown_member`            | HARD                                                   | Synthesis rule's `appliesTo` references a member id not present in the merged `members[]`. View is refused.                                                                                     |
| `assembly_synthesis_terminal_chain`            | warn                                                   | Two or more `terminal` rules with overlapping `appliesTo` and the same phase. Runtime accepts the chain; only the first matching rule fires.                                                    |
| `assembly_overlay_lock_violation`              | HARD (per-artifact)                                    | Candidate artifact (overlay / decision / message / hierarchy output) matched a locked trait at persistence time. Artifact is dropped, never persisted. Consultation row is persisted unchanged. |
| `assembly_hierarchy_cycle`                     | HARD                                                   | Members' `parent:` fields form a cycle. View is refused.                                                                                                                                        |
| `assembly_hierarchy_invalid_parent`            | HARD                                                   | A member's `parent:` does not resolve to an existing member id in the merged roster. View is refused.                                                                                           |
| `assembly_xref_unresolvable`                   | HARD (`identity` / `governance` / `work` / `executor`) | Cross-AIP ref does not resolve.                                                                                                                                                                 |
| `assembly_signing_unsupported`                 | HARD                                                   | Manifest sets `audit.signing: required` but the host does not implement signing.                                                                                                                |

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signature

The host exposes the following function signature:

```ts
// Workspace manifest — root or view.
defineAssemblyWorkspace({
  schema: "assembly.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                       // relative path to parent ASSEMBLY.md
  appliesTo?: string[]                   // ws:// refs or relative paths
  mode: "advisory" | "voting" | "peer" | "hierarchy"
  members?: Array<{
    id: string
    persona: string                      // ws://personas/<slug>
    role: string
    phase?: string
    triggers?: Array<"sample" | "sentinel-match" | "scheduled" | "manual" | "periodic">
    weight?: number
    voteClass?: string[]
    parent?: string
    timeout_ms?: number
    gatherInput?: {
      strategy: string                   // "working-memory" | "recent-messages" | "digest" | "last-message-only" | "custom:<id>"
      params?: Record<string, unknown>
    }
  }>
  synthesis?: {
    rules?: Array<{
      id: string
      kind: string                       // "terminal" | "priority" | "aggregate" | "quorum" | "majority" | "unanimity" | "escalate-on-severity" | <custom>
      appliesTo?: "*" | string[]
      params?: Record<string, unknown>
    }>
    riskLevels?: Array<{
      range: [number, number]
      label: "ok" | "watch" | "intervene" | "escalate"
    }>
  }
  lockedTraits?: string[]
  matchMode?: "substring" | "regex" | "semantic"
  audit?: {
    consultations?: { enabled?: boolean; retention?: string }
    overlays?: { enabled?: boolean; maxActive?: number; defaultTtl?: string }
    signing?: "required" | "optional" | "none"
  }
  identity?: string                       // ws://identities/<slug>
  governance?: string                     // path or ref
  work?: string                           // ws://workspaces/<slug>
  executor?: string                       // ws://operators/<slug>
  defaults?: { triggerHeuristic?: string; triggerInterval_ms?: number }
  display?: { defaultGrouping?: "phase" | "role" | "severity" }
  metadata?: Record<string, unknown>
}): ResolvedAssemblyWorkspace
```

Hosts MAY alias `defineAssemblyWorkspace` as `defineAssembly`,
`registerAssembly`, `defineCollective`. The canonical name MUST be present.

`definePersona` is NOT exposed by AIP-24 — that's [AIP-25](/docs/aip-25)'s
signature. The boundary between the two AIPs is intentional: persona-level
concerns (system prompt, voice register, persona fragments) flow through AIP-25;
assembly-level concerns (role config, synthesis, lock-check) flow through
AIP-24.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name               | Schema dialect          |
| ----------------------- | --------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineAssemblyWorkspace`   | JSON Schema or zod      |
| Python                  | `define_assembly_workspace` | JSON Schema or pydantic |
| Go                      | `DefineAssemblyWorkspace`   | struct tags             |
| Rust                    | `define_assembly_workspace` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the manifest author's language.

## Registration test

A conforming host SHOULD provide a `validate(assemblyRoot)` helper that:

1. Checks `ASSEMBLY.md` is present at the assembly root and validates against
   [`./ASSEMBLY.schema.json`](./ASSEMBLY.schema.json).
2. Resolves the `extends:` chain (if any), walking warnings.
3. Checks the four one-way switches across the chain (HARD refusals): `mode`,
   `audit.{consultations,overlays}.enabled`, `audit.signing`, `lockedTraits`
   entries.
4. Validates `appliesTo` resolvability (HARD on misses).
5. For each entry in the merged `members[]`, resolves the persona ref via
   [AIP-25](/docs/aip-25); validates id uniqueness and mode-appropriate fields;
   for `hierarchy` mode, runs cycle detection on `parent:` refs.
6. Validates every cross-AIP ref (`identity`, `governance`, `work`, `executor`).
7. Validates every synthesis rule's `kind` against the host's rule registry;
   validates every rule's `appliesTo` resolves to known member ids; surfaces
   `assembly_synthesis_terminal_chain` as a warning when applicable.
8. Round-trips parse → resolve → register members → re-serialise to verify the
   loader is deterministic.
9. Runs a dry-run synthesis pipeline against an empty input set, verifying that
   no rule errors, no lock-check throws, and the default risk-level mapping is
   monotonic.
10. Reports the first failure with file + field path.

This is the standard "is this assembly conforming?" handshake. The same helper
MAY be re-used to validate a per-context view by passing the consumer's folder
instead of the assembly root.

## What this guide does NOT cover

- **Persona authoring** — that's [AIP-25](/docs/aip-25)'s skill. AIP-24
  references personas; it does not define them.
- **Identity authoring** — that's [AIP-23](/docs/aip-23). Advisory overlays
  modulate an AIP-23 identity; AIP-24 does not own identity.
- **Cryptographic signing** — that's [AIP-7](/docs/aip-7). `audit.signing`
  selects the posture; AIP-7 owns the keys, algorithms, and verification chain.
- **Trigger heuristic implementation** — `defaults.triggerHeuristic` is a
  manifest declaration; the runtime that actually fires the trigger is
  host-side. Hosts MAY use cron-like schedulers, message-count counters,
  mode-detection ML — all out of scope.
- **The host's UI for rendering consultations / overlays / decisions / message
  logs.** AIP-24 carries the data; rendering is a runtime concern.
- **Multi-tenant isolation, quotas, billing** — runtime concerns far outside the
  spec.

These stay out of the spec on purpose.

## See also

- [AIP-24 — agentassembly/v1 spec](/docs/aip-24)
- [AIP-25 — agentpersona/v1](/docs/aip-25) — the unit of identity each member
  references
- [AIP-23 — agentidentity/v1](/docs/aip-23) — base identity advisory overlays
  modulate
- [AIP-20 — agentwork/v2](/docs/aip-20) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-22 — agentoffice/v1](/docs/aip-22) — sibling Workspace AIP, mirror
  composition mechanic
- [AIP-7 — governance, approval, audit](/docs/aip-7) — one-way-switch convention
- [AIP-9 — agentoperators/v1](/docs/aip-9) — runtime executor
- [`./ASSEMBLY.schema.json`](./ASSEMBLY.schema.json) — frontmatter validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests for all four modes
- [`./skills/author-assembly-workspace/SKILL.md`](./skills/author-assembly-workspace/SKILL.md)
  — agent-side authoring skill
