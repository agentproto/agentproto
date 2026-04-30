# ADAPTER.md — implementing AIP-7 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **emit, store, and verify** AIP-7
[`agentgovernance/v1`](/docs/aip-7) artifacts: signatures, audit entries, and
policies. It is normative for the parts marked MUST and informative for the
parts marked SHOULD.

The audience is a host author — someone exposing `defineApproval`,
`defineAudit`, and `definePolicy` to authors and operators. Authors themselves
should read [`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements five responsibilities:

1. **Load the workspace manifest** — read `GOVERNANCE.md` at the workspace root,
   validate against the workspace `$def` in
   [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json), resolve any
   `extends:` chain, expose both the merged effective config and the resolution
   chain. Enforce **one-way switches** at merge time. See
   [Loading GOVERNANCE.md](#loading-governancemd).
2. **Parse and validate** every governance file (signature, audit event, policy)
   against [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json), surface
   errors with file + field path.
3. **Append** audit entries to the per-scope `audit-log.jsonl`, computing and
   verifying the hash chain on every write.
4. **Enforce** policies whenever a matching mutation is attempted, producing a
   decision the runtime obeys. The active policy registry comes from the merged
   `GOVERNANCE.md`, not from filesystem walking.
5. **Verify** signatures and chain integrity on demand, with results
   reproducible by any third-party verifier reading the same files.

The four canonical signatures `defineGovernanceWorkspace`, `defineApproval`,
`defineAudit`, `definePolicy` are the boundary between the host and the author.
The host MAY internally translate to its own types, but the canonical names MUST
be present.

## Loading `GOVERNANCE.md`

The workspace manifest is the host's first read on every governance scope load
and on every consumer (operator/company/skill) activation. The host exposes the
merged effective config to policy evaluation, approval collection, and audit
append in the active consumer's context.

### Resolution algorithm

When a host reads a `GOVERNANCE.md`:

1. **Parse the frontmatter** as YAML. Validate against the `workspace` `$def` in
   [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json). On failure, surface
   `governance_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `governance_extends_missing` as a
     WARNING, use the local manifest only, mark the chain as broken, proceed.
   - If the parent has already appeared in the visited set: emit
     `governance_extends_cycle` as a WARNING, break the chain at the cycle
     point, proceed.
   - If the chain depth would exceed eight: emit
     `governance_extends_depth_exceeded` as a WARNING, break at the eighth
     ancestor, proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below. Child wins on overrides EXCEPT for one-way switches.
5. **Enforce one-way switches.** Walk the merged result against the chain and
   check:
   - If any ancestor declares `audit.appendOnly: true` and a descendant declares
     `audit.appendOnly: false`: emit `governance_append_only_relaxation` and
     **REFUSE the merge** (hard failure, NOT a warning).
   - If any ancestor declares `signing.required: true` and a descendant declares
     `signing.required: false`: emit `governance_signing_downgrade` and **REFUSE
     the merge** (hard failure).
6. **Validate `appliesTo` resolvability.** For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `governance_appliesto_unresolvable` if any binding fails to resolve.
7. **Validate keyring drift.** If a child rebinds `signing.keyring` to a path
   containing keys not present in the parent's keyring, emit
   `governance_keyring_drift` as a WARNING. Hosts MAY upgrade this to a hard
   refusal via runtime policy in production deployments.

The host MUST NOT execute any code in `GOVERNANCE.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                         | Strategy            | Notes                                                                                       |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`     | override            | Child's identity wins. Both exposed via the resolution chain.                               |
| `extends`                                     | local-only          | Not inherited.                                                                              |
| `appliesTo`                                   | local-only          | Not inherited. Each view declares its own scope.                                            |
| `autonomy.level`                              | override            | Child can lower the ceiling but SHOULD NOT raise it (see "Conflict cases").                 |
| `autonomy.defaultApproval`                    | override            | Child can rebind.                                                                           |
| `autonomy.approvalEscalation`                 | override            | Child can rebind.                                                                           |
| `signing.algo`, `signing.keyring`             | override            | Child can rebind. Keyring widening surfaces `governance_keyring_drift`.                     |
| **`signing.required`**                        | **ONE-WAY SWITCH**  | Parent `true` → child MUST be `true`. Hard refusal: `governance_signing_downgrade`.         |
| `audit.retention`                             | override            | Child can shorten or extend retention.                                                      |
| `audit.hashAlgo`                              | override            | Child can rebind.                                                                           |
| **`audit.appendOnly`**                        | **ONE-WAY SWITCH**  | Parent `true` → child MUST be `true`. Hard refusal: `governance_append_only_relaxation`.    |
| `audit.storage`, `audit.headPointerSign`      | override            | Child can rebind.                                                                           |
| `policies`                                    | merge-by-id         | Same `id` → child replaces parent. New ids → appended.                                      |
| `policies[].severity`                         | child wins          | A child MAY soften a policy's severity unless governance forbids it (see "Conflict cases"). |
| `approvers`                                   | merge-by-id         | Same `id` → child replaces parent. New ids → appended.                                      |
| `executor`, `escalateTo`, `work`, `knowledge` | override            | Child can rebind. Resolved at activation, not at load.                                      |
| `display.*`                                   | leaf-field override |                                                                                             |
| `metadata`                                    | deep-merge          | Recursive merge; vendor namespaces accumulate.                                              |

### Cross-AIP ref resolution

| Ref                     | AIP                    | Resolver                                                                                                                      |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ws://operators/<slug>` | [AIP-9](/docs/aip-9)   | Look up the operator workspace; verify it exists and the host can activate it. Used by `executor` and `escalateTo`.           |
| `ws://companies/<slug>` | [AIP-6](/docs/aip-6)   | Look up the company workspace. Valid in `appliesTo`.                                                                          |
| `ws://skills/<slug>`    | [AIP-3](/docs/aip-3)   | Look up the skill manifest. Valid in `appliesTo`.                                                                             |
| `work: <ref>`           | [AIP-13](/docs/aip-13) | Resolve to a `WORK.md` workspace. Audit events with a work-binding emit work-item updates in the bound workspace.             |
| `knowledge: <ref>`      | [AIP-10](/docs/aip-10) | Resolve to a `KNOWLEDGE.md` workspace. Schema and source mutations in the bound wiki flow through this scope's approval gate. |
| `extends: <path>`       | AIP-7                  | Resolve as a relative path to another `GOVERNANCE.md`.                                                                        |
| `policies[].ref`        | AIP-7                  | Resolve as a relative path to a `POLICY.md`. The host parses the policy with `definePolicy`.                                  |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer. This is a hard failure during manifest load.

`executor` and `escalateTo` enforcement: these MAY be unresolvable at
manifest-load time (operators are activated lazily). The host SHOULD record the
binding and surface a runtime warning when activation actually attempts to use
them.

### View activation

When an [AIP-9](/docs/aip-9) operator (or [AIP-6](/docs/aip-6) company, or
[AIP-3](/docs/aip-3) skill) loads, the host SHOULD:

1. Look for a `GOVERNANCE.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above.
3. Pass the merged effective config to the consumer's runtime context: policy
   evaluation uses the merged `policies` registry; approval collection uses the
   merged `approvers`; audit append uses the merged `audit.*` and `signing.*`.
   The merged `autonomy` ceiling bounds the consumer's runtime autonomy.
4. Expose the resolution chain on a debug surface keyed by the consumer's id
   (e.g. `defineGovernanceWorkspace().resolved.chain`) so reviewers can audit
   which manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`GOVERNANCE.md` directly. Consumers without their own view inherit the base
posture explicitly via the merge algorithm — not implicitly.

### Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedGovernanceWorkspace = {
  effective: GovernanceWorkspace // merged config
  chain: Array<{
    // resolution chain (root → leaf)
    path: string // absolute path to the manifest
    doctype: "governance.workspace/v1"
    name: string
    version: string
  }>
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "governance_extends_missing"
      | "governance_extends_cycle"
      | "governance_extends_depth_exceeded"
      | "governance_keyring_drift"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

Hard refusals (`governance_append_only_relaxation`,
`governance_signing_downgrade`, `governance_appliesto_unresolvable`) do NOT
appear in `warnings` — they abort `ResolvedGovernanceWorkspace` construction
entirely and surface as load errors.

### Hard refusal cases

The following merge outcomes MUST be refused, not degraded:

| Code                                | Trigger                                                                                     | Why hard                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance_append_only_relaxation` | Any ancestor sets `audit.appendOnly: true`; some descendant sets `audit.appendOnly: false`. | Append-only is AIP-7's defining safety property. A view that silently relaxes it would let an operator skip the chain. The whole point of one-way switches. |
| `governance_signing_downgrade`      | Any ancestor sets `signing.required: true`; some descendant sets `signing.required: false`. | Required signatures are how third-party verifiers trust the chain. A view that downgrades would let unsigned events into the chain.                         |
| `governance_appliesto_unresolvable` | A view's `appliesTo` references a consumer (operator/company/skill) that does not exist.    | A view bound to nothing is semantically broken; failing to refuse it leaves a phantom posture floating.                                                     |
| `governance_workspace_invalid`      | Frontmatter fails schema validation.                                                        | Same rule as every other doctype — invalid manifests don't load.                                                                                            |

### Conflict cases

Concrete parent/child examples to illustrate the merge rules. Each is a minimal
pair, not a full manifest.

**1. Append-only relaxation — HARD REFUSAL.**

Parent (`<scope>/GOVERNANCE.md`):

```yaml
audit:
  appendOnly: true
```

Child (`operators/junior-eng/GOVERNANCE.md`):

```yaml
extends: ../../GOVERNANCE.md
audit:
  appendOnly: false
```

Result: the host refuses the merge with `governance_append_only_relaxation`
pointing at the child. The child view fails to load. The fix is to remove the
`audit.appendOnly: false` override (the child inherits `true` automatically) or
— if the business case is real — to author a separate workspace, not a child
view.

**2. Signing downgrade — HARD REFUSAL.**

Parent: `signing: { required: true }`. Child: `signing: { required: false }`.
Result: `governance_signing_downgrade`, refused.

**3. Autonomy ceiling lowered by child.**

Parent: `autonomy: { level: 2 }`. Child: `autonomy: { level: 0 }`. Effective:
`autonomy: { level: 0 }`. The child tightens the ceiling for its consumer (e.g.
a junior engineer's operator drops to read-only). This is the canonical
one-way-direction pattern: posture ratchets up, never down.

**4. Policy severity softened by child — soft case.**

Parent:

```yaml
policies:
  - id: write-protected-paths
    ref: ../policies/write-protected/POLICY.md
    appliesTo: workspace.write
    severity: error
```

Child:

```yaml
extends: ../../GOVERNANCE.md
policies:
  - id: write-protected-paths
    ref: ../policies/write-protected/POLICY.md
    appliesTo: workspace.write
    severity: warn
```

Effective: `severity: warn`. The host MUST allow the override unless a parent's
policy explicitly forbids softening (the meta-policy pattern: a workspace's own
approval gate may be configured to refuse view-level severity downgrades for
specific ids).

**5. Approver narrowed by child.**

Parent: `approvers` includes `cfo` and `cto`. Child redeclares `approvers` with
only `cfo`. Effective: only `cfo` (merge-by-id — ids not present in the child
are inherited from the parent). To _remove_ a parent approver, the child must
declare a same-id entry with `canApprove: []`; the host treats an empty
`canApprove` as a revocation.

**6. Keyring drift.**

Parent: `signing: { keyring: ./.well-known/governance-keys.json }`. Child
rebinds: `signing: { keyring: ./.well-known/junior-keys.json }`, where the new
keyring contains a key not present in the parent's keyring. Effective: child's
keyring wins; the host emits `governance_keyring_drift` as a warning. Production
deployments MAY upgrade this to a hard refusal via runtime policy.

### Canonical signatures

The host exposes four function signatures the author and the operator call:

```ts
// Workspace manifest — root or view.
defineGovernanceWorkspace({
  schema: "governance.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                    // relative path to parent GOVERNANCE.md
  appliesTo?: string[]                // ws:// refs or relative paths
  autonomy?: { level?: 0 | 1 | 2 | 3; defaultApproval?: string; approvalEscalation?: { from: string; to: string } }
  signing?: { algo?: "ed25519" | "ecdsa-p256" | "rsa-pss-sha256"; keyring?: string; required?: boolean }
  audit?: { retention?: string; hashAlgo?: "sha256" | "sha512" | "blake3"; appendOnly?: boolean; storage?: string; headPointerSign?: boolean }
  policies?: Array<{ id: string; ref: string; appliesTo?: string; severity?: "error" | "warn" | "info"; params?: Record<string, unknown> }>
  approvers?: Array<{ id: string; role?: string; canApprove?: string[]; quorum?: string }>
  executor?: string                   // ws://operators/<slug>
  escalateTo?: string                 // ws://operators/<slug>
  work?: string                       // ws:// or path
  knowledge?: string                  // ws:// or path
  display?: { defaultDashboard?: string; showRetentionWarnings?: boolean }
  metadata?: Record<string, unknown>
}): ResolvedGovernanceWorkspace
```

Hosts MAY alias `defineGovernanceWorkspace` as `defineWorkspace`,
`registerGovernance`, or `defineGovernance`. The canonical name MUST be present.

`defineApproval`, `defineAudit`, `definePolicy` are unchanged from earlier
drafts; their signatures remain the boundary between the host and author for the
per-event/per-rule layers.

## `defineApproval` — record an approval

A host that implements `defineApproval` MUST:

1. **Accept the `ApprovalDefinition` shape** documented in
   [AIP-7 § signature](/docs/aip-7). Fields: `artifact`, `decision`, `signer`,
   `signedAt`, optional `policy`, `signature`, `metadata`.
2. **Reject `decision: "reject"` without a `reason`.** Reasons are what make
   rejections actionable for downstream approvers.
3. **Compute the canonical signing payload** as the JCS-canonicalised JSON of
   `{ artifact, decision, signer, signedAt, policy }` (excluding
   `signature.value`). The signature is over that exact byte sequence.
4. **Verify the signature on read** if a `signature.value` is present. Mismatch
   MUST fail validation; the host MUST NOT attach an invalid signature to a
   mutation.
5. **Persist the file** at the canonical path
   `<scope>/signatures/<signer.id>-<signedAt>.signature.json`. Filename MUST be
   deterministic from the body so duplicates collapse.

Hosts MAY:

- Re-export under aliases (`createApproval`, `signApproval`). Canonical name
  MUST exist.
- Accept multiple key formats (DID, JWK, PEM); canonicalise to a single format
  inside the audit chain so verifiers don't branch on key encoding.
- Auto-attach a `policy.ref` when the approval was triggered by a named policy.

## `defineAudit` — append an audit entry

A host that implements `defineAudit` MUST:

1. **Accept the `AuditEntryDefinition` shape**: `actor`, `action`, `subject`,
   optional `input`, `output`, `policy`, `signatures`, `metadata`.
2. **Compute `seq` and `prevHash` from the chain head.** The host MUST hold an
   exclusive append-lock on the target `audit-log.jsonl` while computing —
   concurrent appends MUST serialise.
3. **Compute `hash`** as `SHA-256(JCS(entry-without-hash))`, represented as
   lowercase hex. Algorithm SHOULD be configurable; the default `SHA-256` MUST
   be supported.
4. **Append exactly one line** to `audit-log.jsonl`, terminated by `\n`. No
   trailing whitespace. No JSON arrays — the file is newline-delimited JSON, not
   a JSON document.
5. **Reject any write that modifies an existing line.** The audit log is
   append-only by spec; the host's storage layer MUST refuse in-place edits and
   SHOULD raise an alarm if a write attempt targets an offset other than EOF.
   See [Append-only semantics](#append-only-semantics).

### Append-only semantics

This is the central invariant of AIP-7. Any host claiming AIP-7 conformance
MUST:

- **Reject mutations to existing entries.** Stored bytes for any line `< EOF`
  MUST NOT change after the line is written. Hosts that store the log on a
  filesystem MUST open `audit-log.jsonl` in append-only mode (`O_APPEND` on
  POSIX) and SHOULD set filesystem-level append-only flags (`chattr +a` on Linux
  ext\*) on production stores.
- **Detect tampering at read time.** When loading a chain, the host MUST
  recompute every entry's `hash` and verify `prevHash` against the previous
  entry's `hash`. Any mismatch MUST surface as a `chain.broken` error with the
  offending `seq`.
- **Refuse truncation as a recovery path.** If an entry is corrupted beyond
  repair, the operator authors a _new_ entry with `action: "audit.note"`
  documenting the corruption and continues the chain — they MUST NOT delete or
  rewrite the bad line.
- **Surface the head pointer.** Hosts SHOULD periodically publish the current
  `seq + hash` as a head-pointer attestation that external verifiers can pin
  against. This guards against silent truncation.
- **Reject out-of-order seq.** A new entry's `seq` MUST be exactly
  `previous.seq + 1`; gaps and duplicates MUST be refused.
- **Reject backdated `ts`.** A new entry's `ts` MUST be `>=` the previous
  entry's `ts`. Equal is allowed (sub-millisecond ordering); earlier is not.

Hosts MAY:

- Store the audit log in a database alongside the file, provided both stores
  stay in sync and the canonical form remains the JSONL file (the file is the
  spec artifact; the DB is an index).
- Mirror the chain to a tamper-evident log (transparency log, blockchain
  anchor). The mirroring metadata lives under `metadata.<host>.*` and MUST NOT
  change `hash`.

## `definePolicy` — declare an autonomy rule

A host that implements `definePolicy` MUST:

1. **Accept the `PolicyDefinition` shape**: `slug`, `match`, `decision`,
   optional `signers`, `quorum`, `autonomy`, `budget`, `metadata`.
2. **Validate the matcher**: `match.action` MUST be a recognised action class
   (the host's vocabulary). `match.subject` is matched as a literal id or a glob
   (path glob if it starts with `/` or `workspace:`, id otherwise).
3. **Resolve `signers[]`** at evaluation time, not at registration. Roles can
   change membership; the policy reads the current set.
4. **Reject conflicting autonomy + decision combinations.** Example:
   `decision: allow` with `autonomy: 0` is meaningless — the host MUST refuse to
   register such policies.
5. **Reject unbounded budgets in production**: a policy with `decision: allow`
   and no `budget` is permissible only if the matcher is sufficiently narrow.
   Hosts SHOULD warn at registration when a wildcard matcher pairs with
   `decision: allow` and no budget.

## Policy evaluation pipeline

When a mutation is attempted, the host runs the pipeline in this order:

1. **Collect candidates.** Find every policy whose `match` clause matches the
   mutation's `(action, subject, risk_level)`. Multiple policies MAY match.
2. **Order by specificity.** More specific matchers win. Order: exact
   `subject` > glob `subject` > unbounded `subject`; higher `risk_level_min` >
   lower; explicit `policy.priority` (if the host supports it) overrides.
3. **Take the strictest decision.** When two matching policies disagree, pick
   the strictest of `deny` > `escalate` > `require-approval` > `allow`. The
   host's runtime policy can tighten further but never loosen.
4. **Apply the autonomy ceiling.** If the runtime's autonomy level exceeds the
   policy's `autonomy`, escalate to the next-higher principal (or the policy's
   `signers[]` for `require-approval`).
5. **Apply budget.** If `budget` is exhausted in the current window, treat the
   decision as `require-approval` regardless of the base.
6. **Emit an audit entry.** Whatever the outcome, the host MUST emit an
   `audit-event` with `policy.ref: <slug>`, `policy.decision: <resolved>`, and
   the matched mutation as `subject`.

## Approval enforcement

When a policy resolves to `require-approval`:

1. The host pauses the mutation and emits an "approval-needed" event to the
   host's approval surface (UI, chat, email).
2. Approvers signed under any of the policy's `signers[]` roles MAY produce
   signatures. Each signature is recorded via `defineApproval` and persisted
   under `signatures/`.
3. When `quorum` signatures matching `decision: "approve"` are collected, the
   host releases the mutation. Reject signatures short-circuit; the host MUST
   stop collection on the first reject and abort the mutation.
4. The releasing audit entry's `signatures[]` field MUST list paths to all
   collected signature files.

The prompt UI is out of scope. Hosts SHOULD pass the resolved policy slug, the
matched action + subject, and the canonical signing payload to the prompt so the
user makes an informed decision.

## Autonomy levels

The host MUST recognise the 0–4 ladder:

| Level | Meaning          | Default policy decision                         |
| ----- | ---------------- | ----------------------------------------------- |
| 0     | Fully manual     | every action prompts                            |
| 1     | Agent suggests   | human commits all mutations                     |
| 2     | Bounded auto     | mutations matching low-risk policies auto-allow |
| 3     | Reviewed auto    | all mutations auto-allow; human reviews after   |
| 4     | Fully autonomous | no human gate                                   |

The host's runtime autonomy is a single integer per scope. Each policy declares
the **maximum** autonomy at which it stays permissive; above that, the policy
escalates regardless of its base `decision`. This makes scope-wide autonomy
changes a one-knob move without per-policy edits.

## Error envelope

All governance errors leave the host as:

```ts
type GovernanceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; path?: string; cause?: unknown }
    }
```

Standard `code` vocabulary:

| Code                                | Meaning                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.invalid`                    | A file failed JSON Schema validation.                                                                                                                           |
| `signature.invalid`                 | A signature didn't verify against its key.                                                                                                                      |
| `signature.unknown_key`             | The signing key isn't in the host's keyring.                                                                                                                    |
| `chain.broken`                      | An audit entry's `prevHash` doesn't match.                                                                                                                      |
| `chain.seq_gap`                     | An audit entry's `seq` skipped or repeated.                                                                                                                     |
| `chain.tampered`                    | An existing entry's recomputed hash doesn't match.                                                                                                              |
| `policy.not_found`                  | A `policy:<ref>` couldn't be resolved.                                                                                                                          |
| `policy.denied`                     | A policy resolved to `deny`.                                                                                                                                    |
| `policy.budget_exceeded`            | A policy's budget cap was reached.                                                                                                                              |
| `approval.quorum_unmet`             | Not enough approve signatures collected.                                                                                                                        |
| `approval.rejected`                 | A signer rejected; mutation aborted.                                                                                                                            |
| `audit.append_only`                 | A non-append write to the log was attempted.                                                                                                                    |
| `governance_workspace_invalid`      | `GOVERNANCE.md` frontmatter fails schema validation. Returns the failing field path.                                                                            |
| `governance_extends_missing`        | A view's `extends:` points to a non-existent file. Soft warning; runtime degrades to local-only.                                                                |
| `governance_extends_cycle`          | An `extends:` chain visits the same manifest twice. Soft warning; runtime breaks at the cycle point.                                                            |
| `governance_extends_depth_exceeded` | Chain depth exceeds eight. Soft warning; runtime breaks at the eighth ancestor.                                                                                 |
| `governance_appliesto_unresolvable` | A view's `appliesTo` references a consumer (operator/company/skill) that does not exist. **HARD failure**; the view is refused.                                 |
| `governance_append_only_relaxation` | A descendant view downgrades `audit.appendOnly: true → false`. **HARD failure**; the merge is refused. The defining safety property of AIP-7.                   |
| `governance_signing_downgrade`      | A descendant view downgrades `signing.required: true → false`. **HARD failure**; the merge is refused.                                                          |
| `governance_keyring_drift`          | A child rebinds `signing.keyring` to a path containing keys not in the parent's keyring. Soft warning by default; production hosts MAY upgrade to hard refusal. |

`path` SHOULD point to the failing file and field (`audit-log.jsonl#L42:hash`).

## Third-party verifiability

A host's audit chain MUST be verifiable by an independent verifier reading only
the workspace files. The host MUST NOT require the verifier to call back into
the host. Practically:

- **Canonical JSON.** Every signed payload uses
  [JSON Canonicalisation Scheme (JCS, RFC 8785)](https://www.rfc-editor.org/rfc/rfc8785).
  Sorted keys, no insignificant whitespace, normalised numbers.
- **Algorithm tags.** Hashes carry their algorithm in metadata
  (`hash.alg: sha256`). Signatures carry `signature.alg`. Verifiers branch on
  these without guessing.
- **Public keys discoverable in-tree.** The host MUST publish the public keys it
  uses to sign in a workspace-resident keyring file
  (`.well-known/governance-keys.json` or equivalent). Verifiers fetch keys from
  there, not from the host's runtime API.
- **No hidden state.** Every fact a verifier needs MUST be in the governance
  files. Host-internal indices, caches, and DB rows are out-of-band; if a
  verifier can't see it, it can't matter.
- **Reference verifier published.** The host SHOULD publish a reference verifier
  (CLI or library) in at least one language so conformance is demonstrable.

A pass from any spec-compliant verifier on a captured workspace folder is the
conformance test. Hosts SHOULD CI this.

## Signing requirements

- **Default algorithm: Ed25519.** Hosts MUST support it. Hosts MAY add others
  (RSA-PSS, ECDSA P-256, Sigstore-style transparency-log signatures).
- **Key rotation.** The keyring MAY contain expired keys, marked with
  `expiresAt`. The verifier MUST accept signatures dated before `expiresAt` and
  MUST reject signatures dated after.
- **Revocation.** Revoked keys are listed in
  `.well-known/governance-revoked.json`. A signature whose key is revoked MUST
  fail validation, even if the signature itself is cryptographically valid.

## Append-only storage configuration

Hosts SHOULD document the deployment configuration that enforces append-only at
the storage layer:

- POSIX filesystem: `O_APPEND` on writes; `chattr +a` on the file.
- Object storage: write-once buckets with object-lock and a retention policy
  that exceeds the audit retention window.
- Database: append-only table with no `UPDATE` / `DELETE` grants on the role the
  host uses to write entries.

Hosts that cannot enforce append-only at the storage layer MUST declare the gap
in their conformance report. "Convention only" is not AIP-7 conformance.

## Loader rules

- **Validation is read-time.** Every governance file MUST be validated against
  the schema on read. The host MUST NOT trust cached state from prior writes.
- **Hash recomputation on chain load.** When loading a chain for evaluation, the
  host walks the chain head-to-tail and recomputes every hash. Lazy loading is
  permitted only if the host caches a pinned head and re-verifies on cache miss.
- **No I/O at policy load.** Policies are pure data; loading a POLICY.md MUST
  NOT make network calls. Signer-role resolution happens at evaluation time, not
  load time.

## Multi-language hosts

| Language                | Function names                                                                    | Schema dialect          |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineGovernanceWorkspace`, `defineApproval`, `defineAudit`, `definePolicy`      | JSON Schema             |
| Python                  | `define_governance_workspace`, `define_approval`, `define_audit`, `define_policy` | JSON Schema or pydantic |
| Go                      | `DefineGovernanceWorkspace`, `DefineApproval`, `DefineAudit`, `DefinePolicy`      | struct tags             |
| Rust                    | `define_governance_workspace`, `define_approval`, `define_audit`, `define_policy` | JSON Schema or schemars |

The hash and signature algorithms are the same across all languages — they're
parsed from the file, not from the host's code.

## Registration test

A conforming host SHOULD provide a `validate(path)` helper that:

1. Locates `GOVERNANCE.md` at the workspace root, validates it against the
   workspace `$def`, resolves the `extends:` chain (if any), and verifies
   one-way switches across the chain.
2. Walks the workspace finding every governance file (signature, audit-event,
   policy).
3. Validates each against `GOVERNANCE.schema.json`.
4. Verifies every signature against the keyring resolved from the merged
   manifest's `signing.keyring`.
5. For every audit log: verifies `seq` continuity, `prevHash` linkage, and
   `hash` recomputation. If the merged manifest declares
   `audit.appendOnly: true`, also verifies that no in-place edits are
   detectable.
6. Resolves every `policy.ref` against discovered policies; reports unresolved
   refs. Resolves every `policies[].ref` from the merged `GOVERNANCE.md` against
   discovered POLICY.md files.
7. For every per-context view it can locate (operators, companies, skills),
   resolves the `extends:` chain and validates the merged effective config —
   including the one-way invariant check.
8. Reports the first failure with file + field path.

This is the standard "is this workspace conformant?" handshake.

## What this guide does NOT cover

- The host's persistence backend choice (filesystem vs DB).
- The host's approval UI surface (chat, dashboard, mobile).
- Quota and rate-limiting outside the policy `budget` field.
- Multi-tenant isolation; key custody; HSM integration.
- The on-the-wire format of approval-needed events.

These are runtime-policy concerns and stay out of the spec on purpose.

## See also

- [AIP-7 — agentgovernance/v1 spec](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9) — `executor` / `escalateTo` resolver
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — `knowledge:` binding, sibling
  KNOWLEDGE.md pattern
- [AIP-13 — agentwork/v1](/docs/aip-13) — `work:` binding, sibling WORK.md
  pattern
- [AIP-14 — TOOL.md](/docs/aip-14) — tool-side approval gates
- [AIP-15 — WORKFLOW.md](/docs/aip-15) — workflow-side approval steps
- [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json) — manifest validator
- [`./skills/author-governance/SKILL.md`](./skills/author-governance/SKILL.md) —
  author signature/audit/policy
- [`./skills/author-governance-workspace/SKILL.md`](./skills/author-governance-workspace/SKILL.md)
  — author the GOVERNANCE.md manifest
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference governance files
