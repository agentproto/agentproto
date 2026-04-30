---
schema: skills/v1
name: author-governance-workspace
title: Author a GOVERNANCE.md (workspace root or view) for AIP-7
description:
  Walk through writing a governance.workspace/v1 manifest — either the canonical
  root for a new governance scope or a per-context view that extends a parent
  manifest — using the defineGovernanceWorkspace canonical signature. Enforces
  the one-way switches (audit.appendOnly, signing.required) that no descendant
  view may relax.
version: 1.0.0
tags:
  [
    aip-7,
    governance,
    workspace,
    manifest,
    agentproto,
    composition,
    audit,
    signing,
  ]
inputs:
  - name: intent
    type: string
    required: true
    description:
      One sentence describing what the user wants the manifest to capture (e.g.
      "an org-wide governance root", "a per-operator lens that extends the org
      root", "a tenancy view for the Acme company"). The skill picks
      workspace-root vs view based on this and on whether a parent GOVERNANCE.md
      is in scope.
  - name: workspaceDir
    type: string
    required: true
    description:
      Absolute path to the directory where the new GOVERNANCE.md will be
      written. For a workspace root, this is the org/scope root. For a view,
      this is the consumer's folder (e.g. operators/junior-eng, companies/acme).
  - name: parentManifest
    type: string
    required: false
    description:
      Absolute or relative path to the parent GOVERNANCE.md, when authoring a
      view. If omitted, the skill assumes workspace-root mode and refuses to set
      `extends:`.
  - name: appliesTo
    type: array
    required: false
    description:
      List of ws:// refs the new view binds to (operators, companies, skills).
      Required when authoring a view that wants `appliesTo` populated; omitted
      for workspace-root mode.
examples:
  - input:
      intent:
        A new org-wide governance root. Lock append-only audit and required
        signatures; declare the policy registry.
      workspaceDir: /repo/governance
    output:
      - /repo/governance/GOVERNANCE.md (created, workspace root)
  - input:
      intent:
        A junior-engineer operator view that drops autonomy to read-only and
        narrows the keyring. Inherits the org's append-only + signing locks.
      workspaceDir: /repo/operators/junior-eng
      parentManifest: /repo/governance/GOVERNANCE.md
      appliesTo: [ws://operators/junior-eng]
    output:
      - /repo/operators/junior-eng/GOVERNANCE.md (created, view)
  - input:
      intent:
        A per-company tenancy view for Acme. Adds Acme approvers, binds Acme's
        WORK.md and KNOWLEDGE.md.
      workspaceDir: /repo/companies/acme
      parentManifest: /repo/governance/GOVERNANCE.md
      appliesTo: [ws://companies/acme]
    output:
      - /repo/companies/acme/GOVERNANCE.md (created, view)
---

# Author a `GOVERNANCE.md` (workspace root or view) for AIP-7

Use this skill when the user asks to **draft, extend, or revise** a
`governance.workspace/v1` manifest under [AIP-7](/docs/aip-7). The skill
produces a valid manifest (workspace-root or view), with the right cross-AIP
refs, policy registry, approvers, and composition fields, ready for
`defineGovernanceWorkspace` to load.

A workspace manifest is the machine-readable contract for an
[AIP-7](/docs/aip-7) governance scope — autonomy ceiling, default approval
class, signing keyring, audit retention, the registry of policies and approvers.
The same doctype is used in two modes: a **workspace root** at the scope root
(no `extends:`), and a **view** in any operator/company/skill folder (with
`extends:` pointing at a parent). Authoring either is the same flow, with one
branch on step 1 and an EXTRA invariant check on step 11 for views.

## When to use

- "Set up org-wide governance — write its `GOVERNANCE.md` from scratch."
- "Add a per-operator lens on top of the org root — drop autonomy for an
  onboarding flow."
- "Add a per-company tenancy view that binds Acme's work and knowledge
  workspaces."
- "Bind an [AIP-13](/docs/aip-13) work workspace to this scope so audit events
  produce work-item updates."
- "Refactor the registry: move three policies from the org root to a per-team
  view that needs them stricter."

## When NOT to use

- The user wants to **author an individual policy, signature, or audit entry**
  (the per-event/per-rule layer) — that's the
  [`author-governance`](../author-governance/SKILL.md) skill.
- The user wants to **change the AIP-7 spec itself** — manifest shape changes
  are governance, not authoring.
- The user wants to **edit an existing `GOVERNANCE.md` in place without
  considering the chain** — read the parent first, run the merge in your head
  (especially the one-way switches), then edit. Skipping the merge produces
  views that override fields the parent already locks correctly, OR views that
  try to relax invariants and HARD-REFUSE at load.

## Process

Follow these steps in order. Composition is the central mechanism; steps 1–2 set
up the right mode, steps 5–9 fill in the body, steps 10–12 validate with the
one-way switch check.

### 1. Decide: workspace root or view?

Two questions:

- **Is there an existing `GOVERNANCE.md` upstream that this manifest should
  adapt?** If yes → view; if no → workspace root.
- **Does the user want the manifest to bind to a specific consumer** (operator /
  company / skill)? If yes → view (set `appliesTo`); if no → workspace root.

Workspace-root mode declares the BASE posture. View mode adapts the base for one
or more consumers — but only by ratcheting **stricter**. There is no third mode
— the schema rejects manifests that mix workspace-root and view properties (e.g.
`appliesTo` without `extends`).

If the answer is workspace root, skip step 2 and proceed to step 3.

### 2. If view: locate parent, reference via `extends:`, **understand one-way switches**

For a view, the `extends:` field is a RELATIVE path from the new manifest's
directory to the parent `GOVERNANCE.md`. The host resolves it bottom-up;
recursion is allowed (the parent may itself have `extends:`).

```yaml
# Operator view at /repo/operators/junior-eng/GOVERNANCE.md
extends: ../../governance/GOVERNANCE.md
```

Rules:

- Use POSIX path separators in `extends:` even on Windows. Hosts normalize
  before resolving.
- Maximum chain depth is eight. Two-to-three levels is the common case.
- Cycle detection and depth-overflow are runtime warnings, not errors. The host
  degrades gracefully.

**ONE-WAY SWITCHES — read carefully before authoring a view:**

Two fields cannot be relaxed by any descendant of a parent that locks them:

| Field              | Lock direction                                 | Hard refusal code                   |
| ------------------ | ---------------------------------------------- | ----------------------------------- |
| `audit.appendOnly` | Parent `true` → child MUST be `true` (or omit) | `governance_append_only_relaxation` |
| `signing.required` | Parent `true` → child MUST be `true` (or omit) | `governance_signing_downgrade`      |

**Rule of thumb: do NOT redeclare these fields in a view unless you are
intentionally TIGHTENING (changing `false → true`) or matching the parent.** If
you redeclare to a value the parent already provides, that's harmless. If you
redeclare to a _weaker_ value, the host refuses the merge. The view fails to
load entirely — not a warning, not a degraded state. Hard refusal.

The safe pattern is: omit the field in the view, let it inherit. Only override a
one-way field when ratcheting up.

### 3. Identity (`name`, `title`, `description`, `version`)

Every manifest, root or view, declares its identity. These fields are NOT
inherited (each manifest has its own).

```yaml
schema: governance.workspace/v1
name: junior-eng-view # kebab-case, stable
title: Junior engineer governance lens
description: |
  Tight-leash posture for the junior-engineer operator. Read-only
  autonomy, narrow keyring, the same locked append-only audit chain
  as the org root.
version: 1.0.0 # semver of the SHAPE, not content
```

Bump `version` whenever you change `autonomy`, `policies`, `approvers`,
`signing`, or `audit`. Patch bumps for cosmetic edits to `description` or
`metadata`.

### 4. Cross-AIP bindings — `executor`, `escalateTo`, `work`, `knowledge`, `appliesTo`

```yaml
executor: ws://operators/governance # AIP-9 operator that runs governance
escalateTo: ws://operators/founder # AIP-9 operator on escalation
work: ws://workspaces/org/WORK.md # AIP-13 binding
knowledge: ws://wikis/org/KNOWLEDGE.md # AIP-10 binding
appliesTo:
  - ws://operators/junior-eng # AIP-9 (view only)
```

| Field        | Required    | When to set                                                                                                                                                               |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor`   | optional    | Set when a specific [AIP-9](/docs/aip-9) operator runs governance flows (apply policies, collect signatures, append audit entries).                                       |
| `escalateTo` | optional    | Set when `autonomy.approvalEscalation` fires; the host routes to this operator. Distinct from `executor`: executor runs governance, escalation operator decides outcomes. |
| `work`       | optional    | Set to bind an [AIP-13](/docs/aip-13) `WORK.md` workspace. Audit events emitted in this scope produce work-item updates in the bound workspace.                           |
| `knowledge`  | optional    | Set to bind an [AIP-10](/docs/aip-10) `KNOWLEDGE.md` workspace. Schema and source mutations in the wiki flow through this scope's approval gate.                          |
| `appliesTo`  | conditional | REQUIRED in view mode when the view binds to a consumer. MUST NOT be set in workspace-root mode (the schema rejects roots with `appliesTo`).                              |

The host MUST refuse a view whose `appliesTo` references a non-existent consumer
(`governance_appliesto_unresolvable`) — verify the consumer's workspace exists
before declaring the binding.

### 5. Autonomy + approval defaults

```yaml
autonomy:
  level: 1 # 0 = read-only, 1 = suggest, 2 = bounded auto, 3 = irreversible
  defaultApproval: on-mutate # auto | always | on-mutate | policy:<ref>
  approvalEscalation:
    from: operator
    to: founder
```

`autonomy.level` is the CEILING for the scope. Individual policies MAY further
restrict; nothing CAN exceed this ceiling. `autonomy.defaultApproval` is the
fallback approval class when no policy matches the action. `policy:<ref>`
delegates to a named policy in the registry.

A view typically lowers the ceiling (org `level: 1` → operator `level: 0`).
Raising the ceiling in a view is allowed by the schema but reviewers SHOULD push
back — a view that grants more autonomy than its parent is the inverse of the
registry-of-policies pattern.

### 6. Signing + audit — **the one-way switches live here**

```yaml
signing:
  algo: ed25519 # ed25519 | ecdsa-p256 | rsa-pss-sha256
  keyring: ./.well-known/governance-keys.json # path to public-key bundle
  required: true # ONE-WAY SWITCH

audit:
  retention: forever # forever | days:<n>
  hashAlgo: sha256 # sha256 | sha512 | blake3
  appendOnly: true # ONE-WAY SWITCH
  storage: file://./audit/audit-log.jsonl # vendor-neutral URI
  headPointerSign: true # publish signed head-pointer
```

**Workspace-root authoring:** decide whether to lock `appendOnly: true` and
`signing.required: true`. Once locked, every descendant view inherits the lock
and cannot relax it. The vast majority of production governance roots SHOULD
lock both; only sandbox / scratch scopes leave them unlocked.

**View authoring:** OMIT both fields unless intentionally matching the parent or
ratcheting up (`false → true`). NEVER write `appendOnly: false` or
`required: false` in a view that extends a parent with the corresponding lock —
the host HARD-REFUSES the merge.

`audit.retention` and `audit.hashAlgo` are NOT one-way; views can extend or
shorten retention freely (subject to runtime policy).

`signing.keyring` is rebindable but emits `governance_keyring_drift` as a
warning if the new keyring contains keys not present in the parent's keyring.
Workspace-root authors SHOULD review keyring rebindings — drift is the most
common silent privilege escalation.

### 7. Policies registry

```yaml
policies:
  - id: write-protected-paths # stable id, merge key
    ref: ./policies/write-protected/POLICY.md
    appliesTo: workspace.write # AIP-7 action class
    severity: error # error | warn | info
  - id: external-network
    ref: ./policies/external-network/POLICY.md
    appliesTo: tool.call
    severity: warn
```

Rules:

- `id` is kebab-case and stable; it is the merge key.
- `ref` is a workspace-relative path to a `POLICY.md` file. Policies are ALWAYS
  file-referenced, never inlined; this keeps them editable through the same
  governance gate as any artifact.
- `appliesTo` is an [AIP-7](/docs/aip-7) action class (`workspace.write`,
  `tool.call`, `mutates`, `deploy.scheduled`, etc.) or `*` for all actions.
- `severity`: `error` blocks; `warn` surfaces; `info` logs only.

**View authoring:** redeclare a parent policy by id to override its `severity`,
`params`, or `ref`. Add new policies by using a fresh `id`. To REVOKE a parent
policy in a view, redeclare it with `severity: info` and a `ref` pointing at a
no-op POLICY.md (or narrow the `appliesTo` to a non-matching action class).

### 8. Approvers registry

```yaml
approvers:
  - id: founder # kebab-case, merge key
    role: ws://operators/founder # human name OR AIP-9 ref
    canApprove: [workspace.write, deploy.scheduled, mutates]
    quorum: "1" # "1" | "n-of-m"
  - id: cfo
    role: morgan@example.com
    canApprove: [workspace.write, deploy.scheduled]
    quorum: "1"
```

Rules:

- `id` is kebab-case; merge key.
- `role` is either a human-readable name (resolved against the workspace's
  identity map) or a `ws://operators/<slug>` ref to an [AIP-9](/docs/aip-9)
  operator.
- `canApprove` is the set of approval classes this approver is authorized for.
  The host refuses a signature whose action is not in this set.
- `quorum`: `"1"` for single-signer; `"n-of-m"` (e.g. `"2-of-3"`) for quorum
  among a group.

**View authoring:** redeclare by id to widen or narrow `canApprove`. To REVOKE
an approver in a view, redeclare with `canApprove: []` — the host treats an
empty list as a revocation.

### 9. Body prose (purpose, threat model, conventions)

The frontmatter ends; the body is markdown. Conventional sections:

```md
# <title>

## Purpose

What this scope governs, who uses it, what it deliberately excludes.

## Threat model

What the workspace defends against. For a root: append-only + signing-required
as the floor. For a view: what the view ratchets up and why.

## What's inherited / overridden / locked

For views: a short table noting what the view inherits unchanged, what it
overrides, and what it cannot relax (the locked fields).

## When to extend vs replace

For workspace roots: guidance on whether teams should ship a view or author a
separate root. The rule is: a view inherits the locks; a separate root is the
right answer when the consumer genuinely needs DIFFERENT (not just stricter)
posture.
```

Keep the body short. The frontmatter is the contract; prose explains the
choices.

### 10. Validate against `GOVERNANCE.schema.json` (workspace branch)

Validate the new manifest's frontmatter against the workspace `$def` in
[AIP-7's schema](../../GOVERNANCE.schema.json):

```bash
npx ajv validate \
  -s apps/agentik/sites/content/docs/agentproto/resources/aip-7/draft/GOVERNANCE.schema.json \
  -d "<workspaceDir>/GOVERNANCE.md"
```

Common errors:

- `appliesTo` set but `extends` missing → add `extends` (a view binding to a
  consumer must extend a parent).
- `policies[].id` collisions inside one manifest → ids must be unique per
  manifest; merge happens across manifests, not within one.
- `approvers[].id` collisions → same rule.
- `version` not semver → `1.0.0`, not `1` or `v1`.
- `extends` path not ending in `GOVERNANCE.md` → schema enforces the suffix.

Fix every error before declaring success.

### 11. If view: dry-run merge against parent, **CHECK no one-way switch is relaxed**

For a view, run the host's resolution algorithm in dry-run mode and present the
diff between the parent's effective config and the merged config. The user
reviews:

- **Hard-refusal check FIRST** — does the merged result violate any one-way
  switch? If yes, the merge fails entirely, and the view cannot be authored as
  written. Walk every ancestor, not just the immediate parent: a level-3 view
  that relaxes a lock the level-1 root declared is still a relaxation.
- Which fields the view OVERRIDES (and is that intentional?).
- Which fields the view INHERITS (anything missing that should override?).
- Which fields the view ADDS (new policies, new approvers).
- Resolution chain length (under eight, no cycles).
- Keyring drift warning, if any.

Surface the diff in this shape:

```md
## Merge diff: junior-eng-view (vs parent agentik-org)

ONE-WAY SWITCH CHECK: PASS

- audit.appendOnly: true (inherited from agentik-org, NOT redeclared) ✓
- signing.required: true (inherited from agentik-org, NOT redeclared) ✓

Inherited (no change):

- audit.retention, audit.hashAlgo, audit.storage, audit.headPointerSign
- signing.algo
- policies: write-protected-paths, production-deploy
- approvers: founder, cfo, security
- work, knowledge

Overridden:

- autonomy.level: 1 → 0 (ratchet down)
- autonomy.defaultApproval: on-mutate → always
- signing.keyring: ./.well-known/governance-keys.json →
  ./.well-known/junior-keys.json ⚠ governance_keyring_drift — junior keyring
  contains 1 key not in org keyring
- escalateTo: founder → senior-eng

Added:

- policies.external-network.severity: warn → error (ratchet up by id)
- appliesTo: [ws://operators/junior-eng]

Resolution chain: 2 levels (agentik-org → junior-eng-view) Hard refusals: none
Warnings: 1 (governance_keyring_drift)
```

If the diff includes a one-way switch relaxation, EDIT THE VIEW: remove the
offending field so it inherits. Do not attempt to "work around" the refusal —
the lock is intentional.

If the diff includes an unintentional override, edit the view to remove it
(deletion of a field reverts to parent's value via the merge).

### 12. (Optional) Stage the manifest through the workspace's own approval gate

Editing `GOVERNANCE.md` is itself a governed action. If the workspace declares a
meta-policy on `governance.workspace/v1` writes, route the new manifest through
that gate before landing it on disk. Skipping the gate creates an audit gap
exactly where governance needs the strongest record.

## Final checklist

Before declaring done:

- [ ] `schema: governance.workspace/v1` is set.
- [ ] `name`, `title`, `description`, `version` are present.
- [ ] If view: `extends:` is a valid relative path to an existing
      `GOVERNANCE.md` ending in `/GOVERNANCE.md`.
- [ ] If view: `appliesTo:` references existing consumers.
- [ ] If workspace root: `extends:` and `appliesTo:` are absent.
- [ ] **If view: `audit.appendOnly` and `signing.required` are EITHER omitted
      (inherited) OR set to a value at least as strict as every ancestor's.**
      This is the one-way switch check.
- [ ] `autonomy.level` is in `[0, 1, 2, 3]` and within the parent's ceiling (a
      view typically lowers, not raises).
- [ ] `policies[].id` and `approvers[].id` are unique within this manifest.
- [ ] `policies[].ref` paths point at existing POLICY.md files.
- [ ] `signing.keyring` change reviewed for drift; if the new keyring widens the
      signer set, the change itself routed through approval.
- [ ] Cross-AIP refs (`executor`, `escalateTo`, `work`, `knowledge`) resolve at
      runtime (they MAY be unresolvable at load time but MUST resolve on first
      use).
- [ ] `metadata.<vendor>.*` is namespaced.
- [ ] Frontmatter validates against the workspace `$def` in
      `GOVERNANCE.schema.json`.
- [ ] Body is short and prose-only.
- [ ] If view: dry-run merge diff was reviewed and accepted by the user; one-way
      switch check passed.

## Output

Reply to the user with:

1. The path of the manifest written.
2. **Mode** (workspace root vs view).
3. **Resolution chain** (for a view): root → … → leaf, one path per level, with
   the version of each manifest.
4. **Effective config summary** — the merged shape, in particular the active
   policies, approvers, autonomy ceiling, and lock state of `audit.appendOnly` /
   `signing.required`.
5. **Bindings** — `executor`, `escalateTo`, `work`, `knowledge`, `appliesTo`,
   each with a one-line note on what it does.
6. **One-way switch verification** — explicit confirmation that no ancestor's
   locked invariant was relaxed.
7. **Validation result** — schema clean, dry-run merge clean, hard refusals
   (always zero, otherwise the manifest didn't land), soft warnings (e.g.
   `governance_keyring_drift`).
8. **Open assumptions** — fields you guessed (`autonomy.defaultApproval`,
   severities, retention) that the user might want to override.

Do NOT mutate the parent manifest, the workspace root, or any existing view as a
side-effect. Authoring a new manifest is a LEAF operation — touch only the file
you are creating.

## See also

- [AIP-7 — agentgovernance/v1 spec](/docs/aip-7)
- [AIP-3 — SKILL.md](/docs/aip-3)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — sibling KNOWLEDGE.md pattern
- [AIP-13 — agentwork/v1](/docs/aip-13) — sibling WORK.md pattern
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide for hosts
  (workspace loading, merge strategy, one-way switch enforcement)
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference manifests (workspace
  root, per-operator view, per-company view, multi-level chain)
- [`../../GOVERNANCE.schema.json`](../../GOVERNANCE.schema.json) — frontmatter
  validator (workspace branch)
- [`../author-governance/SKILL.md`](../author-governance/SKILL.md) — sister
  skill for authoring signature/audit/policy artifacts on top of a workspace
