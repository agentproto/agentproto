---
schema: skills/v1
name: author-governance
title: Author governance artifacts (AIP-7)
description:
  Walk through authoring AIP-7 governance files — approvals, append-only audit
  entries, and policy rules — for any agent runtime.
version: 1.0.0
tags: [aip-7, governance, approval, audit, policy, agentproto]
inputs:
  - name: doctype
    type: string
    required: true
    description:
      Which artifact to author. One of "approval", "audit-entry", "policy".
  - name: subject
    type: string
    required: true
    description:
      What is being governed (artifact slug, mutation kind, autonomy scope). The
      skill turns this into the file body.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a workspace folder. If omitted, the skill places files
      under conventional paths (`<scope>/signatures/`, `<scope>/audit/`,
      `<scope>/policies/`).
examples:
  - input:
      doctype: approval
      subject: contract-2026-acme-renewal
    output:
      - artifacts/contract-2026-acme-renewal/signatures/jeremy-2026-04-28T10-12-00Z.signature.json
  - input:
      doctype: policy
      subject: notes-write
    output:
      - policies/notes-write/POLICY.md
---

# Author governance artifacts (AIP-7)

Use this skill when the user asks to **record an approval**, **append to the
audit log**, or **declare an autonomy policy**. The skill produces valid
[AIP-7 governance/v1](/docs/aip-7) files: a `signature.json` (one approval
event), a JSONL line in `audit-log.jsonl` (append-only), or a `POLICY.md`
(declarative rule).

## When to use

- "Record that legal approved contract X."
- "Log that the deploy step ran with input Y and output Z."
- "Declare a policy: every workspace mutation under /finance needs CFO
  approval."
- "Bind an audit chain to an artifact so external auditors can verify history."

## When NOT to use

- The user wants to **call** an existing tool or workflow that already governs
  itself — no authoring needed; the host emits the audit entry automatically.
- The user wants a **runtime decision** ("can agent X do Y right now") — that's
  the host's policy evaluator, not a new file.
- The user wants to **edit** a past audit entry — that's a spec violation. Audit
  is append-only. Append a corrective entry; never mutate.

## Three doctypes — pick one before drafting

| Doctype       | Path                                                   | Body                        | Purpose                                                                   |
| ------------- | ------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------- |
| `signature`   | `<scope>/signatures/<signer>-<isoDate>.signature.json` | JSON object                 | One approval event. Composes; many signatures may attach to one artifact. |
| `audit-event` | `<scope>/audit/audit-log.jsonl`                        | One JSON object per line    | Append-only hash-chained log line.                                        |
| `policy`      | `<scope>/policies/<slug>/POLICY.md`                    | Markdown + YAML frontmatter | Declarative autonomy rule the host's policy evaluator consumes.           |

`<scope>` is the workspace folder being governed: a single artifact folder, a
feature folder, a guild root, or the workspace root. Choose the narrowest scope
that covers the audience for the artifact.

## Process — approval

### 1. Identify the artifact

Pick the artifact slug being approved. The signature lives in a sibling
`signatures/` folder so an auditor walking the artifact's parent finds the
approval chain without traversing the workspace.

### 2. Decide signer + algorithm

- `signer.id`: stable identifier of the signing principal (user id, service
  account, agent id). Use the same identifier scheme the host uses elsewhere —
  slug, not numeric DB id.
- `signer.role`: the role under which the signer acts (`legal`, `cfo`,
  `operator`, `agent:simone`). The host's policy resolver reads this.
- `signature.alg`: cryptographic algorithm. RECOMMENDED `Ed25519`. The spec is
  algorithm-agnostic; the host's verifier MUST support `Ed25519` at minimum.
- `signature.value`: base64url-encoded signature bytes over the canonical JSON
  of `{ artifact, decision, signer, signedAt }`.

### 3. Record the decision

Decisions: `approve` | `reject` | `abstain`. Reject MUST carry a `reason`;
abstain MAY. Approve MAY carry a `reason` (recommended for multi-signer
approvals so other signers can read context).

### 4. Bind to a policy (optional but encouraged)

If the approval was triggered by a named [policy](#process--policy), record
`policy.ref: <slug>`. The host's audit chain follows
`signature → policy → governed mutation` so a verifier can check that the
policy's required signers all signed.

### 5. Compose the file

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "signature",
  "artifact": "<artifact-slug-or-path>",
  "decision": "approve",
  "reason": "Reviewed scope, terms, and downstream effects.",
  "signer": {
    "id": "jeremy@agentik.net",
    "role": "founder",
    "displayName": "Jeremy André"
  },
  "signedAt": "2026-04-28T10:12:00.000Z",
  "policy": { "ref": "contract-send" },
  "signature": {
    "alg": "Ed25519",
    "value": "<base64url>",
    "publicKeyRef": "did:key:z6Mki…"
  },
  "metadata": {}
}
```

The host's adapter validates against
[`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json) before accepting.

## Process — audit entry

### 1. Find the chain head

Audit entries form a hash-chain. Read the **last line** of the target
`audit-log.jsonl` and capture its `hash` — that becomes the new entry's
`prevHash`. If the file is empty, `prevHash` is the literal string `"GENESIS"`.

### 2. Pick the next sequence number

`seq` is monotonic per chain. Read the previous entry's `seq` and add 1. If the
chain is empty, start at 0.

### 3. Compose the body

```json
{
  "$schema": "agentgovernance/v1",
  "doctype": "audit-event",
  "seq": 42,
  "ts": "2026-04-28T10:12:00.000Z",
  "actor": { "id": "agent:simone", "role": "operator" },
  "action": "tool.call",
  "subject": { "kind": "tool", "ref": "send-email-brevo" },
  "input": { "to": "ops@example.com", "subject": "..." },
  "output": { "messageId": "msg_123" },
  "policy": { "ref": "external-send", "decision": "approve" },
  "signatures": ["./signatures/jeremy-2026-04-28T10-11-50Z.signature.json"],
  "prevHash": "f4e7…",
  "hash": "<computed>"
}
```

### 4. Compute the hash

Compute `hash` over the canonical JSON of every other field (sorted keys, no
whitespace). The recommended algorithm is `SHA-256`. The host's adapter
recomputes on read and rejects mismatches.

### 5. Append, never mutate

Append the entry as a single line of JSON to `audit-log.jsonl`. Do NOT rewrite,
reorder, or delete prior lines. The host MUST reject any write that modifies an
existing line — see [`./ADAPTER.md`](./ADAPTER.md#append-only-semantics).

### 6. Redact, don't omit

If `input` or `output` contains secrets (api keys, PII), redact at write time:

- Replace the value with `{ "$redacted": true, "reason": "<why>" }`.
- Keep the field key — omitting fields breaks chain integrity for downstream
  comparators.

## Process — policy

### 1. Pick a slug

Kebab-case, descriptive of the kind of mutation gated: `notes-write`,
`external-send`, `contract-send`, `production-deploy`.

### 2. Decide the gate matchers

Policies match against an attempted mutation. The matcher fields:

- `match.action`: action class — `tool.call`, `workflow.start`,
  `workspace.write`, `mutation.commit`, `mutation.publish`. Use the vocabulary
  the host emits in audit entries.
- `match.subject`: optional — narrow to a particular tool id, workflow id, or
  path glob (`workspace:/finance/**`).
- `match.risk_level_min`: minimum risk to gate. A policy with
  `risk_level_min: 2` only fires for irreversible-ish mutations.

### 3. Decide the decision

The policy decides what the host does when the matcher fires:

- `decision: allow` — auto-approve. Audit still records, no human prompt.
- `decision: deny` — refuse. The mutation never runs.
- `decision: require-approval` — pause for one or more signatures matching
  `signers[]` before proceeding.
- `decision: escalate` — defer to a higher-autonomy policy or the next-up
  principal.

### 4. Add budget caps (optional)

`budget` constrains the policy's reach over time:

- `budget.max_per_hour: 5` — at most 5 matching mutations / hour.
- `budget.max_amount_cents: 50000` — at most $500 worth of charges per period.

When the budget is exhausted, the host treats further matches as
`require-approval` regardless of the base decision.

### 5. Set autonomy level

`autonomy` is a 0–4 scale calibrated to the host's autonomy ladder:

- 0 — fully manual; every step prompts.
- 1 — agent suggests; human commits.
- 2 — agent commits low-risk; human approves mutations.
- 3 — agent commits all; human reviews after.
- 4 — fully autonomous; no human gate.

A policy declares the **maximum** autonomy at which it remains permissive. If
the host's runtime autonomy is higher, the policy escalates.

### 6. Compose POLICY.md

```md
---
schema: agentgovernance/v1
doctype: policy
slug: external-send
version: 1.0.0
match:
  action: tool.call
  subject: send-email-brevo
  risk_level_min: 2
decision: require-approval
signers:
  - role: legal
  - role: founder
quorum: 1
autonomy: 2
budget:
  max_per_hour: 10
metadata: {}
---

## Rationale

Why this policy exists, what it protects, who owns it.

## Audit linkage

Every match records an `audit-event` with `policy.ref: external-send`. Auditors
verifying the chain MUST find a matching `signature.json` under
`<scope>/signatures/` for each approve.

## Examples

Examples of mutations this policy fires on, with expected outcomes.
```

### 7. Validate

```bash
npx ajv validate -s ./GOVERNANCE.schema.json -d ./POLICY.md
```

(Use the `policy` branch of the schema. Same tool validates the other doctypes
by selecting the matching branch.)

## Composition rules

- A **policy** MAY name signers; a **signature** MAY back-link to a policy. The
  audit chain is what binds them — both refer to the same `audit-event` line.
- A **workflow approval step** ([AIP-15](/docs/aip-15)) emits an audit entry
  whose `policy.ref` resolves to a policy authored here. The host's adapter
  wires the two together.
- A **tool with `approval: policy:<ref>`** ([AIP-14](/docs/aip-14)) resolves
  `<ref>` against this folder. Unknown refs MUST refuse the call.

## Output

Produce one of:

- `<scope>/signatures/<signer>-<isoDate>.signature.json`
- one new line appended to `<scope>/audit/audit-log.jsonl`
- `<scope>/policies/<slug>/POLICY.md`

Reply to the user with:

1. The exact file path written (or, for audit entries, the line number that was
   appended and its `seq`).
2. **For approvals** — the artifact slug + decision + signer role so they can
   verify before commit.
3. **For audit entries** — the `prevHash` you read and the `hash` you wrote, so
   they can spot-check the chain extends correctly.
4. **For policies** — the matcher summary (`action` + `subject` +
   `risk_level_min`) + the decision + signer roles, so they can confirm the
   policy gates what they intended.
5. **Open assumptions** — defaults you guessed (algorithm, autonomy level,
   budget caps) the user might want to override.

Do NOT run the policy evaluator yourself, sign with a real private key, or
invoke the verifier. Authoring ends with the file written — signing and
verification happen in the host runtime per [`./ADAPTER.md`](./ADAPTER.md).

## See also

- [AIP-7 — governance/v1 spec](/docs/aip-7)
- [AIP-14 — tool authoring](/docs/aip-14) — `approval: policy:<ref>`
- [AIP-15 — workflow authoring](/docs/aip-15) — `kind: "approval"` steps
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference governance files for common
  patterns (single-signer, multi-signer, deploy chain, budget cap, autonomy
  escalation, third-party verifier)
- [`./GOVERNANCE.schema.json`](./GOVERNANCE.schema.json) — manifest validator
  covering all three doctypes
