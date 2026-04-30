# EXAMPLES.md — governance reference patterns

Reference governance files exemplifying common AIP-7 patterns. Each example is a
self-contained artifact a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Simple single-signer approval](#1-simple-single-signer-approval)
2. [Multi-signer quorum approval](#2-multi-signer-quorum-approval)
3. [Audit chain for a deploy](#3-audit-chain-for-a-deploy)
4. [Policy gating workspace mutations](#4-policy-gating-workspace-mutations)
5. [Policy with budget cap](#5-policy-with-budget-cap)
6. [Autonomy-level escalation](#6-autonomy-level-escalation)
7. [Third-party verifier pattern](#7-third-party-verifier-pattern)
8. [Workspace root — strict org-wide GOVERNANCE.md](#8-workspace-root--strict-org-wide-governancemd)
9. [Per-operator view — junior engineer lens](#9-per-operator-view--junior-engineer-lens)
10. [Per-company composition — Acme tenancy](#10-per-company-composition--acme-tenancy)
11. [Multi-level chain — org → team → operator](#11-multi-level-chain--org--team--operator)

---

## 1. Simple single-signer approval

The cleanest pattern. A founder approves a contract draft. One file, one
decision, one signer, signed with Ed25519.

Path:
`artifacts/contract-2026-acme-renewal/signatures/jeremy-2026-04-28T10-12-00Z.signature.json`

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "signature",
  "artifact": "contract-2026-acme-renewal",
  "decision": "approve",
  "reason": "Reviewed terms, scope, and downstream obligations.",
  "signer": {
    "id": "jeremy@agentik.net",
    "role": "founder",
    "displayName": "Jeremy André"
  },
  "signedAt": "2026-04-28T10:12:00.000Z",
  "policy": { "ref": "contract-send" },
  "signature": {
    "alg": "Ed25519",
    "value": "Mxh4q-...redacted-base64url...8gA",
    "publicKeyRef": "did:key:z6MkiPxTQEYhMDVMXr3p4n6CXoXmRgF1bD6Wj6"
  },
  "metadata": {}
}
```

The host's adapter computes the signing payload as the JCS canonicalisation of
`{ artifact, decision, signer, signedAt, policy }` (without `signature.value`).
The Ed25519 signature is over that exact byte sequence. A third-party verifier
reproduces the canonicalisation and checks the signature against the public key
resolved from `publicKeyRef`.

---

## 2. Multi-signer quorum approval

A production deploy requires both a CFO sign-off (financial scope) and a
security lead sign-off (capability scope). The policy declares `quorum: 2`. Two
signature files attach to the same audit entry.

`signatures/cfo-2026-04-28T11-02-15Z.signature.json`:

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "signature",
  "artifact": "deploy-prod-2026-04-28-002",
  "decision": "approve",
  "reason": "Cost projection within Q2 budget envelope.",
  "signer": {
    "id": "morgan@example.com",
    "role": "cfo",
    "displayName": "Morgan Lee"
  },
  "signedAt": "2026-04-28T11:02:15.000Z",
  "policy": { "ref": "production-deploy" },
  "signature": {
    "alg": "Ed25519",
    "value": "Lp9r3T-...redacted...A2fQ",
    "publicKeyRef": "did:key:z6MkqM3a5b7c..."
  }
}
```

`signatures/security-2026-04-28T11-04-02Z.signature.json`:

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "signature",
  "artifact": "deploy-prod-2026-04-28-002",
  "decision": "approve",
  "reason": "No new external endpoints; capability set unchanged.",
  "signer": {
    "id": "alex@example.com",
    "role": "security",
    "displayName": "Alex Patel"
  },
  "signedAt": "2026-04-28T11:04:02.000Z",
  "policy": { "ref": "production-deploy" },
  "signature": {
    "alg": "Ed25519",
    "value": "Qn2v8z-...redacted...K4hP",
    "publicKeyRef": "did:key:z6MkpZ8f1g2h..."
  }
}
```

The policy `production-deploy` (see §4) specifies
`signers: [{ role: cfo }, { role: security }]` and `quorum: 2`. The host
releases the deploy only when both signatures are collected. The releasing audit
entry's `signatures[]` field references both files.

---

## 3. Audit chain for a deploy

A complete chain for one deploy: schedule → policy resolution → approvals →
execution → completion. Each entry chains to the previous via `prevHash`. The
chain is stored at `workspace/audit/audit-log.jsonl` (one entry per line; shown
formatted here for readability — real lines are unindented).

```jsonl
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":40,"ts":"2026-04-28T11:00:00.000Z","actor":{"id":"agent:simone","role":"operator"},"action":"deploy.scheduled","subject":{"kind":"deploy","ref":"deploy-prod-2026-04-28-002"},"input":{"environment":"production","commit":"a1b2c3d"},"prevHash":"e5f6...prior-hash...0a","hash":"7c1d...computed...3b","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":41,"ts":"2026-04-28T11:01:30.000Z","actor":{"id":"host:governance","role":"system"},"action":"policy.resolved","subject":{"kind":"deploy","ref":"deploy-prod-2026-04-28-002"},"policy":{"ref":"production-deploy","decision":"require-approval"},"prevHash":"7c1d...3b","hash":"9a4e...computed...d2","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":42,"ts":"2026-04-28T11:02:15.000Z","actor":{"id":"morgan@example.com","role":"cfo"},"action":"signature.recorded","subject":{"kind":"signature","path":"./signatures/cfo-2026-04-28T11-02-15Z.signature.json"},"policy":{"ref":"production-deploy","decision":"approve"},"signatures":["./signatures/cfo-2026-04-28T11-02-15Z.signature.json"],"prevHash":"9a4e...d2","hash":"b8c1...computed...e7","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":43,"ts":"2026-04-28T11:04:02.000Z","actor":{"id":"alex@example.com","role":"security"},"action":"signature.recorded","subject":{"kind":"signature","path":"./signatures/security-2026-04-28T11-04-02Z.signature.json"},"policy":{"ref":"production-deploy","decision":"approve"},"signatures":["./signatures/security-2026-04-28T11-04-02Z.signature.json"],"prevHash":"b8c1...e7","hash":"4d2a...computed...f9","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":44,"ts":"2026-04-28T11:04:03.000Z","actor":{"id":"host:governance","role":"system"},"action":"approval.released","subject":{"kind":"deploy","ref":"deploy-prod-2026-04-28-002"},"policy":{"ref":"production-deploy","decision":"approve"},"signatures":["./signatures/cfo-2026-04-28T11-02-15Z.signature.json","./signatures/security-2026-04-28T11-04-02Z.signature.json"],"prevHash":"4d2a...f9","hash":"6e8b...computed...a1","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":45,"ts":"2026-04-28T11:05:00.000Z","actor":{"id":"agent:simone","role":"operator"},"action":"deploy.started","subject":{"kind":"deploy","ref":"deploy-prod-2026-04-28-002"},"input":{"environment":"production","commit":"a1b2c3d"},"prevHash":"6e8b...a1","hash":"3f7c...computed...b4","hashAlg":"sha256"}
{"$schema":"agentgovernance/v1","doctype":"audit-event","seq":46,"ts":"2026-04-28T11:08:42.000Z","actor":{"id":"agent:simone","role":"operator"},"action":"deploy.completed","subject":{"kind":"deploy","ref":"deploy-prod-2026-04-28-002"},"output":{"status":"green","durationMs":222000},"prevHash":"3f7c...b4","hash":"a5d9...computed...c8","hashAlg":"sha256"}
```

A verifier reading this chain:

1. Walks head-to-tail, recomputes every `hash`, checks each `prevHash` matches
   the previous entry's `hash`.
2. Resolves every `policy.ref` to a discovered POLICY.md.
3. For every entry naming `signatures[]`, verifies each signature file's Ed25519
   signature against the public key in the workspace keyring.
4. Reports green if all checks pass.

No host-runtime dependency; the chain stands alone.

---

## 4. Policy gating workspace mutations

A policy that gates writes anywhere under `/finance/**` to require CFO approval,
regardless of which agent or tool initiated the write.

Path: `policies/finance-write/POLICY.md`

```md
---
schema: agentgovernance/v1
doctype: policy
slug: finance-write
version: 1.0.0
match:
  action: workspace.write
  subject: workspace:/finance/**
  risk_level_min: 1
decision: require-approval
signers:
  - role: cfo
quorum: 1
autonomy: 2
metadata:
  owner: morgan@example.com
---

## Rationale

Writes under `/finance/` represent committed financial state — budgets, spend
plans, contractual obligations. The CFO must approve every mutation regardless
of which agent or tool triggered it.

## Audit linkage

Every match emits an `audit-event` with `policy.ref: finance-write` and
`policy.decision: approve` once a CFO signature is collected. The releasing
entry's `signatures[]` field cites the signature file.

## Examples

- `agent:simone` runs `append-to-notes` with `filename: /finance/q2-budget.md` →
  policy fires → CFO is paged → approval signature → write proceeds.
- `agent:guilde-ops` runs `workspace-edit-file` on `/finance/forecast.md` →
  policy fires regardless of the calling tool's own approval class.
```

The matcher uses a path glob; `workspace:/finance/**` matches any descendant.
The `risk_level_min: 1` excludes pure read previews (level 0). `autonomy: 2`
means at autonomy level 3+ the policy escalates to the next-up principal
regardless of the base `require-approval`.

---

## 5. Policy with budget cap

A policy that allows the agent to spend up to $500 / day on external ad
placements, but switches to require-approval once the cap is reached.

Path: `policies/ad-spend-daily/POLICY.md`

```md
---
schema: agentgovernance/v1
doctype: policy
slug: ad-spend-daily
version: 1.0.0
match:
  action: tool.call
  subject: meta-ads-create-campaign
  risk_level_min: 2
decision: allow
signers:
  - role: marketing-lead
quorum: 1
autonomy: 3
budget:
  max_per_day: 20
  max_amount_cents: 50000
  currency: USD
metadata:
  owner: marketing@example.com
---

## Rationale

The marketing agent runs continuous ad-spend optimisation. We want fast
iteration during business hours but never blow past the daily budget without a
human in the loop.

## Behaviour

- Per matching call, the host attributes the placement amount to the policy's
  daily budget window.
- Once `max_amount_cents` (50000 cents = $500) is consumed in the current day,
  the policy's effective decision flips to `require-approval` and `signers[]`
  are paged.
- The window resets on UTC midnight.
- `max_per_day: 20` is a secondary cap on call count to defend against runaway
  loops even if individual amounts are small.

## Audit linkage

Each match emits an `audit-event` with `policy.ref: ad-spend-daily`,
`policy.decision: allow` (under cap) or `require-approval` (over cap). The
auditor sums approved amounts per day per policy to verify the cap held.
```

---

## 6. Autonomy-level escalation

A policy that's permissive at autonomy 3 but escalates at higher autonomy.
Demonstrates how a single host-level autonomy knob re-routes governance without
per-policy edits.

Path: `policies/note-sync/POLICY.md`

```md
---
schema: agentgovernance/v1
doctype: policy
slug: note-sync
version: 1.0.0
match:
  action: tool.call
  subject: append-to-notes
  risk_level_min: 1
decision: allow
autonomy: 3
metadata:
  owner: ops@example.com
---

## Rationale

`append-to-notes` is a low-risk workspace mutation. At normal autonomy levels
(≤3) we let the agent commit freely. At fully autonomous mode (4) we require
human review post-hoc to keep a sample of mutations in the loop.

## Behaviour

- At runtime autonomy 0–3 → policy returns `allow`.
- At runtime autonomy 4 → policy escalates per the
  [adapter pipeline](./ADAPTER.md#policy-evaluation-pipeline). The host pages
  the next-higher principal (the workspace owner) for a post-hoc review
  signature. The mutation MAY proceed before the signature; the audit chain
  records the deferred-approval state.

## Edge case

If the host's autonomy level changes mid-flight (operator dials it down),
in-flight calls keep the autonomy in effect at start. New calls evaluate against
the new level.
```

This pattern lets a workspace's owner dial autonomy with a single configuration
change and trust every policy to respond. No per-policy edits.

---

## 7. Third-party verifier pattern

How an external auditor — running no host code — verifies a workspace's
governance state. The workspace ships these files:

```
workspace/
  audit/
    audit-log.jsonl              # the chain
  signatures/                    # collected approvals
    *.signature.json
  policies/
    <slug>/POLICY.md
  .well-known/
    governance-keys.json         # public keys
    governance-revoked.json      # revoked keys
    head-pointer.json            # pinned chain head (optional)
```

`.well-known/governance-keys.json`:

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "keyring",
  "keys": [
    {
      "id": "did:key:z6MkiPxTQEYhMDVMXr3p4n6CXoXmRgF1bD6Wj6",
      "alg": "Ed25519",
      "publicKey": "MCowBQYDK2VwAyEA-redacted-base64-",
      "subject": { "id": "jeremy@agentik.net", "role": "founder" },
      "validFrom": "2026-01-01T00:00:00.000Z",
      "expiresAt": "2027-01-01T00:00:00.000Z"
    },
    {
      "id": "did:key:z6MkqM3a5b7c...",
      "alg": "Ed25519",
      "publicKey": "MCowBQYDK2VwAyEA-redacted-base64-",
      "subject": { "id": "morgan@example.com", "role": "cfo" },
      "validFrom": "2026-01-01T00:00:00.000Z",
      "expiresAt": "2027-01-01T00:00:00.000Z"
    }
  ]
}
```

`.well-known/head-pointer.json` (optional, periodically signed):

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "head-pointer",
  "chain": "audit/audit-log.jsonl",
  "headSeq": 46,
  "headHash": "a5d9...c8",
  "pinnedAt": "2026-04-28T11:09:00.000Z",
  "signer": { "id": "host:governance", "role": "system" },
  "signature": {
    "alg": "Ed25519",
    "value": "Vp7m...base64...3xR",
    "publicKeyRef": "did:key:z6Mk-host-key..."
  }
}
```

The verifier's algorithm:

```text
1. Load .well-known/governance-keys.json. Build a key id → public key map.
   Reject any key whose validFrom > now or expiresAt < now.
2. Load .well-known/governance-revoked.json. Mark revoked keys as invalid.
3. Walk audit-log.jsonl head-to-tail:
   a. For each line, validate against GOVERNANCE.schema.json (auditEvent branch).
   b. Recompute SHA-256(JCS(entry without `hash`)) → expected hash.
      Reject if it differs from `entry.hash`.
   c. If first line, expect `prevHash == "GENESIS"`. Else expect
      `prevHash == previous.hash`.
   d. Expect `seq == previous.seq + 1` (or 0 for first line).
   e. Expect `ts >= previous.ts`.
4. For each entry whose `signatures[]` is non-empty, load each
   referenced signature.json, validate the schema, recompute the
   signing payload (JCS of {artifact, decision, signer, signedAt,
   policy}), verify the Ed25519 signature against the resolved
   public key.
5. For each entry with `policy.ref`, load the named POLICY.md and
   verify (a) the schema, (b) the matcher would have fired on this
   entry's (action, subject), (c) the recorded `decision` is one
   the policy could produce.
6. If `head-pointer.json` exists, verify its signature and check
   `headSeq` / `headHash` match the chain's last entry.
7. Report PASS or list failures with file + field path.
```

A reference verifier in TypeScript:

```ts
import { verifyChain } from "@agentproto/governance-verifier"

const result = await verifyChain("./workspace")

if (!result.ok) {
  for (const failure of result.failures) {
    console.error(failure.code, failure.path, failure.message)
  }
  process.exit(1)
}
console.log("PASS — chain integrity, signatures, and policies verified.")
```

The verifier makes no network calls. The workspace folder is the single input.
This is what makes AIP-7 third-party-verifiable and distinguishes it from
vendor-locked audit trails.

---

## 8. Workspace root — strict org-wide GOVERNANCE.md

The base posture for a whole organization. Locks `audit.appendOnly` and
`signing.required`, declares the policy registry, declares approvers, binds the
company-wide knowledge wiki and work tracking workspaces. Every descendant view
inherits from this — and may only ratchet posture _up_, never down.

Path: `<org-scope>/GOVERNANCE.md`

```yaml
---
schema: governance.workspace/v1
name: agentik-org
title: Agentik organization governance
description: |
  Org-wide governance posture. Every operator, company tenancy, and
  skill bundle in this monorepo extends this manifest. Locks the audit
  chain to append-only and requires every audit event to carry a
  verifiable signature; descendants may NOT relax either invariant.
version: 1.0.0

autonomy:
  level: 1
  defaultApproval: on-mutate
  approvalEscalation:
    from: operator
    to: founder

signing:
  algo: ed25519
  keyring: ./.well-known/governance-keys.json
  required: true

audit:
  retention: forever
  hashAlgo: sha256
  appendOnly: true
  storage: file://./audit/audit-log.jsonl
  headPointerSign: true

policies:
  - id: write-protected-paths
    ref: ./policies/write-protected/POLICY.md
    appliesTo: workspace.write
    severity: error
  - id: external-network
    ref: ./policies/external-network/POLICY.md
    appliesTo: tool.call
    severity: warn
  - id: production-deploy
    ref: ./policies/production-deploy/POLICY.md
    appliesTo: deploy.scheduled
    severity: error

approvers:
  - id: founder
    role: ws://operators/founder
    canApprove: [workspace.write, deploy.scheduled, mutates, irreversible]
    quorum: "1"
  - id: cfo
    role: morgan@example.com
    canApprove: [workspace.write, deploy.scheduled]
    quorum: "1"
  - id: security
    role: alex@example.com
    canApprove: [tool.call, deploy.scheduled]
    quorum: "1"

executor: ws://operators/governance
escalateTo: ws://operators/founder
work: ws://workspaces/org/WORK.md
knowledge: ws://wikis/org/KNOWLEDGE.md

display:
  defaultDashboard: governance-overview
  showRetentionWarnings: true

metadata:
  agentik:
    owner: jeremy@agentik.net
    reviewCadence: quarterly
---

# Agentik org governance

## Purpose

This manifest is the registry-of-policies for every consumer in the
monorepo: every operator, every company tenancy, every skill. The
posture declared here is the FLOOR — descendants may tighten it
(narrower keyring, lower autonomy, stricter approval class) but MUST
NOT relax `audit.appendOnly` or `signing.required`.

## Threat model

The hard invariants are append-only audit and required signatures.
A view that relaxes either fails to load with `governance_append_only_relaxation`
or `governance_signing_downgrade`. This is enforced at merge time —
no runtime check is required, the host refuses the view at activation.

## When to extend vs replace

If a consumer needs a *stricter* posture (lower autonomy, narrower
keyring, additional policies), extend this manifest. If a consumer
genuinely needs DIFFERENT posture (e.g. a sandboxed scratch workspace
that should not produce signed audit), DO NOT extend — the one-way
switches will refuse the merge. Author a separate workspace root with
its own audit chain.
```

**When to use.** This is the canonical pattern for any organization that runs
more than one operator or one company tenancy under shared governance. The locks
are deliberate — they're what make every descendant view auditable by the same
external verifier.

---

## 9. Per-operator view — junior engineer lens

A view bound to the junior-engineer operator. Drops autonomy to read-only,
narrows the keyring to a junior-only subset, but INHERITS
`audit.appendOnly: true` and `signing.required: true` from the parent. The view
does NOT redeclare those one-way fields — it relies on inheritance.

Path: `operators/junior-eng/GOVERNANCE.md`

```yaml
---
schema: governance.workspace/v1
name: junior-eng-view
title: Junior engineer governance lens
description: |
  Tight-leash governance posture for the junior-engineer operator.
  Read-only autonomy, narrow keyring, the same append-only audit
  chain as the org root (one-way switches inherited and unchangeable).
version: 1.0.0

extends: ../../GOVERNANCE.md
appliesTo:
  - ws://operators/junior-eng

autonomy:
  level: 0                           # read-only — drops from org's level: 1
  defaultApproval: always

signing:
  keyring: ./.well-known/junior-keys.json   # narrower keyring; emits
                                            # governance_keyring_drift if
                                            # the new keyring contains
                                            # keys not in the parent's
  # required is INHERITED as true — NOT redeclared.

# audit.appendOnly is INHERITED as true — NOT redeclared.
# Attempting to set audit.appendOnly: false here would HARD-REFUSE
# with governance_append_only_relaxation.

policies:
  - id: external-network
    ref: ../../policies/external-network/POLICY.md
    appliesTo: tool.call
    severity: error                  # softens 'warn' from parent UP to
                                     # 'error' — ratchet, not relaxation

executor: ws://operators/junior-eng
escalateTo: ws://operators/senior-eng

metadata:
  agentik:
    onboardingStage: weeks-1-4
---

# Junior engineer governance lens

## Purpose

Strict-by-default posture during the first 4 weeks of onboarding.
The junior operator can read freely but cannot mutate without explicit
approval from the senior engineer escalation route.

## What's inherited from the org

- `audit.appendOnly: true` — locked by the parent, cannot be relaxed.
- `signing.required: true` — locked, cannot be downgraded.
- `audit.retention: forever`, `audit.hashAlgo: sha256`.
- All policies from the org registry except those redeclared above.
- All approvers from the org (`founder`, `cfo`, `security`).

## What's overridden

- `autonomy.level`: 1 → 0 (ratchet down).
- `autonomy.defaultApproval`: `on-mutate` → `always`.
- `signing.keyring`: org keyring → junior keyring (emits
  `governance_keyring_drift` if the junior keyring contains keys not
  in the org keyring; the host warns and the workspace owner reviews).
- `policies.external-network.severity`: warn → error (ratchet up).
- `escalateTo`: founder → senior-eng (specific escalation path for this
  operator).
```

**When to use.** Onboarding flows, time-bounded restricted access, or any
operator that needs a tighter ceiling than the org default. Demonstrates the
one-way switch by NOT redeclaring `appendOnly` / `required` — inheritance
carries them, refusal would fire if the view tried to override either to
`false`.

---

## 10. Per-company composition — Acme tenancy

A view bound to the Acme company workspace ([AIP-6](/docs/aip-6)). Adds
company-specific approvers, binds Acme's own work-tracking and knowledge
workspaces, and enforces a stricter approval class on deploys. Inherits the
org-wide posture (including the locked invariants) and ratchets up where the
contract demands.

Path: `companies/acme/GOVERNANCE.md`

```yaml
---
schema: governance.workspace/v1
name: acme-tenancy
title: Acme company tenancy governance
description: |
  Per-tenant governance posture for the Acme deployment. Adds Acme's
  contractual approvers, binds Acme's work and knowledge workspaces,
  enforces stricter deploy approval. Inherits the locked org-wide
  audit + signing invariants.
version: 1.2.0

extends: ../../GOVERNANCE.md
appliesTo:
  - ws://companies/acme

autonomy:
  level: 1                           # match parent
  defaultApproval: policy:acme-deploy-class

approvers:
  - id: acme-procurement
    role: procurement@acme.example.com
    canApprove: [deploy.scheduled, workspace.write]
    quorum: "2-of-3"
  - id: acme-cto
    role: cto@acme.example.com
    canApprove: [deploy.scheduled, irreversible]
    quorum: "1"

policies:
  - id: production-deploy
    ref: ./policies/acme-production-deploy/POLICY.md
    appliesTo: deploy.scheduled
    severity: error                  # replaces parent's production-deploy
                                     # by id; the new POLICY.md adds
                                     # Acme-specific quorum
  - id: acme-data-residency
    ref: ./policies/data-residency/POLICY.md
    appliesTo: workspace.write
    severity: error
    params:
      allowedRegions: [eu-west, eu-central]

work: ws://workspaces/acme/WORK.md          # AIP-13 binding — Acme's
                                            # own work tracker
knowledge: ws://wikis/acme/KNOWLEDGE.md     # AIP-10 binding — Acme's
                                            # own wiki
executor: ws://operators/acme-ops
escalateTo: ws://operators/founder

metadata:
  agentik:
    contractRef: msa-2026-acme
    soc2: true
---

# Acme tenancy governance

## Purpose

Acme's contract requires (a) named approvers from Acme's own staff for
deploys, (b) data residency in EU regions, (c) a SOC 2 audit trail. All
three are encoded above. The org's append-only and signing-required
invariants carry through unchanged — Acme's contract assumes them.

## Cross-AIP bindings

- `work: ws://workspaces/acme/WORK.md` — every audit event in this
  scope produces a corresponding work-item update in Acme's
  [AIP-13](/docs/aip-13) workspace, so Acme's PMs see the trail in
  their own tooling.
- `knowledge: ws://wikis/acme/KNOWLEDGE.md` — schema and source
  mutations in Acme's [AIP-10](/docs/aip-10) wiki flow through this
  manifest's approval gate. Acme's curator operator cannot rewrite the
  wiki schema without an `acme-procurement` 2-of-3 quorum.

## What's added on top of the org

- Two company-specific approvers (`acme-procurement`, `acme-cto`).
- A `production-deploy` policy that replaces the org's by id (Acme's
  POLICY.md requires both `acme-procurement` quorum AND `security`
  inherited from the org).
- A new `acme-data-residency` policy bound to workspace writes.
- Bindings to Acme's work and knowledge workspaces.
```

**When to use.** Multi-tenant deployments where each tenant's contract dictates
posture. The pattern is "inherit the floor from the provider, ratchet up to meet
the customer's contract, bind the customer's [AIP-13](/docs/aip-13) and
[AIP-10](/docs/aip-10) workspaces so audit + work + knowledge all live in the
customer's tooling".

---

## 11. Multi-level chain — org → team → operator

Three levels deep. Demonstrates merge precedence and the append-only invariant
respected at each level. Each level only declares what it NEEDS to override;
everything else inherits.

### Level 1 — `<org>/GOVERNANCE.md` (root)

Same as [Example 8](#8-workspace-root--strict-org-wide-governancemd):
`audit.appendOnly: true`, `signing.required: true`, `autonomy.level: 1`, the
full policy and approver registry.

### Level 2 — `<org>/teams/finance/GOVERNANCE.md` (team view)

```yaml
---
schema: governance.workspace/v1
name: finance-team
title: Finance team governance lens
description: |
  Team-level lens for the finance org. Ratchets approval class up to
  always-require for any workspace.write under /finance/, adds a CFO
  approver path, narrows query autonomy. Inherits org-wide append-only
  and signing-required.
version: 1.0.0
extends: ../../GOVERNANCE.md
appliesTo:
  - ws://companies/internal-finance

autonomy:
  level: 1 # match org
  defaultApproval: always # ratchet up from on-mutate

policies:
  - id: finance-write
    ref: ../../policies/finance-write/POLICY.md
    appliesTo: workspace.write
    severity: error
    params:
      pathPrefix: /finance/

approvers:
  - id: cfo
    role: morgan@example.com
    canApprove: [workspace.write, deploy.scheduled, mutates]
    quorum:
      "1" # replaces the org's cfo entry by id
      # to widen canApprove

executor: ws://operators/finance-ops
escalateTo: ws://operators/founder

metadata:
  agentik:
    teamLead: morgan@example.com
---
# Finance team

Inherits everything from the org root. Adds the `finance-write` policy keyed on
path prefix and widens the `cfo` approver's `canApprove` set to include
`mutates`.
```

### Level 3 — `<org>/operators/junior-finance/GOVERNANCE.md` (operator view)

```yaml
---
schema: governance.workspace/v1
name: junior-finance-view
title: Junior finance analyst lens
description: |
  Tightest lens — junior finance analyst. Drops autonomy to read-only,
  removes the analyst's ability to self-approve, requires CFO escalation
  for every mutation. Inherits append-only + signing-required from the
  org TWO levels up; the merge walks org -> finance-team -> here.
version: 1.0.0

extends: ../../teams/finance/GOVERNANCE.md
appliesTo:
  - ws://operators/junior-finance

autonomy:
  level: 0                           # read-only
  defaultApproval: always            # match team

signing:
  keyring: ./.well-known/junior-finance-keys.json

# audit.appendOnly: still true (inherited from org, two levels up)
# signing.required: still true (inherited from org)
# Attempting either downgrade here HARD-REFUSES.

policies:
  - id: finance-write
    ref: ../../policies/finance-write/POLICY.md
    appliesTo: workspace.write
    severity: error                  # match team
    params:
      pathPrefix: /finance/
      requiresEscalation: true       # adds an instance param

escalateTo: ws://operators/cfo

metadata:
  agentik:
    onboardingStage: weeks-1-12
---

# Junior finance analyst

Inherits the chain: org → finance-team → here. The merge consumes
three manifests in order; the `chain` field on the resolved workspace
exposes all three paths.
```

### Resulting effective config

After the host walks the chain (depth 3, no cycles, no missing parents), the
merged effective config the runtime sees:

```yaml
schema: governance.workspace/v1
name: junior-finance-view # leaf wins
version: 1.0.0
autonomy:
  level: 0 # leaf wins (org=1, team=1, leaf=0)
  defaultApproval: always # team wins (org=on-mutate, team=always)
  approvalEscalation: # inherited from org (no override)
    from: operator
    to: founder
signing:
  algo: ed25519 # org default
  keyring: ./.well-known/junior-finance-keys.json # leaf rebind
  required: true # ORG LOCK — cannot be relaxed
audit:
  retention: forever # org
  hashAlgo: sha256 # org
  appendOnly: true # ORG LOCK — cannot be relaxed
  storage: file://./audit/audit-log.jsonl
  headPointerSign: true
policies:
  - id: write-protected-paths # org
    severity: error
  - id: external-network # org
    severity: warn
  - id: production-deploy # org
    severity: error
  - id: finance-write # introduced by team, refined by leaf
    severity: error
    params:
      pathPrefix: /finance/
      requiresEscalation: true # leaf-only param
approvers:
  - id: founder # org
  - id: cfo # team replaced org's by id
  - id: security # org
executor: ws://operators/finance-ops # team override
escalateTo: ws://operators/cfo # leaf override
work: ws://workspaces/org/WORK.md # org
knowledge: ws://wikis/org/KNOWLEDGE.md # org
```

**When to use.** Whenever posture has natural strata — organization-wide floor,
team-wide ratchets, individual-operator overlays. Three is the typical max;
deeper chains usually mean the team needs a refactor.

**Invariant respected.** Neither the team view nor the operator view redeclares
`audit.appendOnly` or `signing.required`. Both inherit from the org root, two
levels up. Any redeclaration to `false` at any level would HARD-REFUSE the merge
— the host walks every ancestor when checking the one-way switches, not just the
immediate parent.

---

## Anti-patterns to avoid

- **Mutating an audit entry after write.** The host MUST refuse; authors MUST
  NOT try. Append a corrective `audit.note` entry.
- **Omitting `prevHash`** (or using `null`). Use the literal string `"GENESIS"`
  for the first entry.
- **Missing `reason` on `decision: "reject"`** — schema rejects. Reasons make
  rejections actionable.
- **Storing private keys in the workspace.** Keys live in the host's key custody
  (HSM, secret manager). Only public keys appear in
  `.well-known/governance-keys.json`.
- **`decision: "allow"` with a wildcard matcher and no `budget`** — unbounded
  auto-approval. Hosts SHOULD warn at registration.
- **Backdated `ts`** — a new entry's `ts` MUST be `>=` the previous entry's.
  Equal is allowed (sub-millisecond ordering); earlier is not.
- **Per-host audit fields outside `metadata.<host>.*`.** Vendor extensions go
  under namespaced metadata; everything else stays cross-host comparable.
- **Trusting the host's verifier output without an independent re-run.** The
  point of AIP-7 is that _any_ compliant verifier on the same files reaches the
  same conclusion. Run two.

## See also

- [AIP-7 — agentgovernance/v1 spec](/docs/aip-7)
- [AIP-14 — TOOL.md](/docs/aip-14) — tool-side `approval: policy:<ref>`
- [AIP-15 — WORKFLOW.md](/docs/aip-15) — workflow-side `kind: "approval"`
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json) — manifest validator
