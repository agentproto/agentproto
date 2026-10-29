# ADAPTER.md — implementing AIP-9 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, activate, and dispatch to** AIP-9
[`OPERATOR.md`](/docs/aip-9) files. It is normative for the parts marked MUST
and informative for the parts marked SHOULD.

The audience is a runtime author — someone exposing `defineOperator` to operator
authors. Operator authors themselves should read [`./SKILL.md`](./SKILL.md), not
this file.

## Contract overview

An operator is an agent holding a role in an organization. It is organizational
and independent of how it runs: the same file runs as a per-request persona in
the host's shared in-process shell (`runtime.kind: in-process`) or as a harness
session (`runtime.kind: agent-cli`). Either way an operator **always resolves
into one effective [AIP-42](/docs/aip-42) agent**, and the agent is the only
runnable definition.

A conforming host implements five responsibilities, in this order when an
OPERATOR.md folder is registered:

1. **Parse the manifest** — read `OPERATOR.md`, validate against
   [`./OPERATOR.schema.json`](./OPERATOR.schema.json), surface errors.
2. **Load the entry** — `import` (or language-equivalent) the file referenced by
   `entry`. The entry's default export is a value produced by
   `defineOperator(...)`.
3. **Resolve attachments** — resolve the operator with `resolveOperator` (see
   [Resolution](#resolution)): the base agent, identity, persona, role chain,
   skills ([AIP-3](/docs/aip-3)), tools ([AIP-14](/docs/aip-14)), MCP servers
   against their endpoints, and the bound policy ([AIP-38](/docs/aip-38))
   against the policy registry. Missing refs MUST refuse registration.
4. **Negotiate capabilities** — check that every capability required by the
   loaded skills + tools is present in the operator's declared `capabilities[]`.
   Surface `unmet-capability` at registration; never at first dispatch.
5. **Activate** — wire the operator into the host's dispatch surface so any
   conforming workflow ([AIP-15](/docs/aip-15)) or human can dispatch to it by
   `id`.

The signature `defineOperator` exposes is the boundary between the host and the
author. The host MAY internally translate to its own agent type after the call,
but `defineOperator` is what the author calls.

## `defineOperator` — the entry-point function

### Required behaviour

A host that implements `defineOperator` MUST:

1. **Accept the `OperatorDefinition` shape** documented in
   [AIP-9 § The file](/docs/aip-9#the-file). Every field listed there MUST be
   honoured at runtime.
2. **Resolve the operator** with the pure function `resolveOperator`, which
   builds the system prompt in the normative merge order of
   [AIP-9 § Merge order](/docs/aip-9#merge-order):
   `base agent → identity → persona → role → slot bindings → operator body → host sections`.
   This determinism is what makes operators portable.
3. **Pass `context` through** to every tool / skill body invoked during a turn,
   with at least:
   - `operatorId` (string) — the operator's `id`.
   - `runId` (string) — stable across the operator's current turn.
   - `userId` (string \| undefined) — the human caller, if any.
   - `conversationId` (string \| undefined) — request grouping.
   - `capabilities` (string[]) — the operator's declared capabilities.
   - `governance` — opaque handle the operator + its tools use to consult AIP-7
     policies (e.g. `await context.governance.check(action))`.
   - `abortSignal` (AbortSignal) — host signals cancellation here.
4. **Emit lifecycle events** per the [AIP-9 lifecycle](/docs/aip-9#lifecycle):
   `idle → invoked → running → (suspended | completed | interrupted) → resumed → running`.
   Every state transition MUST write an audit-event per AIP-7.
5. **Convert thrown errors into the standard envelope** (see below).

### Optional behaviour

A host MAY:

- Re-export `defineOperator` under host-idiomatic aliases (`createOperator`,
  `agent`, `registerOperator`). The canonical name MUST be present.
- Accept long-form profile prose as a templated string and interpolate it at
  synthesis time; tracking the rendered prompt back to its source fragments
  SHOULD be possible (for debug surfaces).
- Expose host-specific fields via `metadata`. Authors stash hints there under
  namespaced keys; the host reads them. Other hosts MUST tolerate unknown
  `metadata.<host>.…` keys.

## Dispatch contract

Any conforming workflow ([AIP-15](/docs/aip-15)) or human caller MUST be able to
dispatch to **any conforming operator** by id, with no per-operator-class
adapter.

The host's dispatch surface MUST accept:

```ts
type DispatchInput = {
  operatorId: string
  message: {
    role: "user" | "system" | "operator"
    content: string
    from?: string
  }
  context?: Partial<TurnContext>
  // optional resume token for picking up after a suspend
  resumeToken?: string
}
```

The host's dispatch surface MUST return:

```ts
type DispatchResult =
  | { ok: true; state: "completed"; outputs: unknown; events: LifecycleEvent[] }
  | {
      ok: true
      state: "suspended"
      resumeToken: string
      reason: "approval" | "input" | "policy"
      events: LifecycleEvent[]
    }
  | {
      ok: false
      state: "interrupted"
      error: ErrorEnvelope
      events: LifecycleEvent[]
    }
```

Workflows reading this contract can dispatch to any operator without asking what
_type_ of agent it is — the shell is uniform.

## Resolution

`resolveOperator(operator, sources) -> AgentEntry` is **pure**: no I/O beyond
loading the templates the operator references, deterministic for the same inputs,
cacheable. It is the one normative resolution; every host calls the same
function. The host's **turn composer** is separate and host specific.

When the host activates an operator, it MUST:

1. Build the effective agent with `resolveOperator`, in the merge order of
   AIP-9: base agent (`extends`), identity ([AIP-23](/docs/aip-23)), persona
   ([AIP-25](/docs/aip-25)), role ([AIP-47](/docs/aip-47), after its own
   `extends` chain), slot bindings, the operator's own body and inline
   overrides, then the host definition sections ([AIP-42](/docs/aip-42) rule 3).
2. Union and dedupe `boundaries` from the agent, the persona and the operator,
   plus the role's `antiPatterns`.
3. Cache the result keyed by `(operatorId, version, digest of inputs)`, where
   the digest covers role, persona, identity, policy and slot bindings.
   Re-resolve only when an input changes. A long-lived session whose digest no
   longer matches its operator's current resolution runs stale instructions; the
   host SHOULD flag it.
4. Expose the resolved prompt to debug surfaces (the operator's "show me your
   system prompt" capability is first-class for inspection, not a hidden host
   secret).

### The turn composer

What changes every turn is not part of the definition and stays out of the cached
resolution. The host's turn composer adds it after `resolveOperator`: live
state ([AIP-23](/docs/aip-23)), the [AIP-72](/docs/aip-72) memory projection
digest for the session's node, [AIP-12](/docs/aip-12) playbook overlays,
participation and mention rules, the approvals brief and the per-request tool
pick. It MAY be nearly empty (a host whose sessions are long-lived harness
processes) or rich (a host that rebuilds the prompt every request). It MUST NOT
contradict the resolved definition.

The host MUST NOT silently inject host-specific prompt blocks the manifest
doesn't reference. Hosts that need to add platform-level text (rate-limit
reminders, etc.) SHOULD do so via a documented `platform` block that authors can
opt out of.

## Role binding

`role: { ref, bind?, with? }` names the [AIP-47](/docs/aip-47) role held and fills
its slots. The host MUST check at load time that every `bind` key names a slot
the role declares, that every required slot is bound, and that each value matches
the slot's declared type. A role is intent, never permission: binding a role MUST
NOT change the operator's effective policy.

While `role` is optional (one minor version), a host without `role` resolves the
role from `metadata.roleSlug`, then from `profile.role` only when that value is a
role slug that resolves, and emits a `role_fallback` warning that names the
source. A host MUST NOT guess a role from free text and MUST NOT fall back to a
default role: it emits `role_missing` and runs the operator without one.

## Runtime binding

`runtime` carries portable configuration only. With `kind: agent-cli` the host
runs the resolved agent as an [AIP-46](/docs/aip-46) session on the
[AIP-45](/docs/aip-45) harness named by `ref`, and the operator's `config` is
layer 3 of the session config. The host MUST validate `config.mode`,
`config.options` and `config.continuation` against the manifest before spawn.
The session preset, the posture and the auth profile are host configuration and
are never read from `runtime`. `runtime.session` is deprecated: AIP-46 and the
host own session lifetime.

## Skill resolution

`skills[]` resolution is normative:

1. For each entry, locate the skill in the host's AIP-3 catalog by `id`. If
   `source` is set, fetch from the URL (cached locally per host policy).
2. Verify the skill's provenance. The host MAY require a signed manifest, a
   hash-pinned `source`, or both. Untrusted skills MUST NOT be silently loaded.
3. Merge the skill's tool registrations into the operator's tool set. Tool ids
   collide → host policy decides (default: first-load wins; warn loudly).
4. Append the skill's prompt fragment to the operator's system prompt.

Skill load failures are registration errors. Skills that fail at runtime (a
referenced tool is missing) MUST surface as `unmet-capability` errors during
dispatch, not silent degradation.

## Tool resolution

The operator's tool set is the union of the base agent's tools, the role's tools
(intent), the tools bound to slots and the operator's own tools, filtered by the
effective [AIP-38](/docs/aip-38) policy (the operator's `policy` composed with the
policy of the session's node chain):

- A tool the **role** declares and the policy does not grant is **dropped**, with
  an `intent_unsatisfied` warning. The role's `defaultPolicy` is advisory.
- A tool the **agent or the operator** declares, or a slot binds, and the policy
  does not grant **refuses registration** ([AIP-42](/docs/aip-42) rule 4).

`tools[]` entries resolve against the host's [AIP-14](/docs/aip-14) tool catalog
OR an MCP server endpoint:

- **Catalog tools** — locate by `id`, apply any per-operator `scope` narrowing,
  attach to the operator's tool set.
- **MCP server tools** — connect at registration, list available tools, filter
  by `allow[]` if specified, expose each one through the same AIP-14 contract
  (the host adapts MCP's tool descriptor to AIP-14 shape).

`scope` may **narrow** a tool's declared `mutates` / `requires` but never widen.
The host MUST refuse a widening attempt.

## Memory layer hooks

The host's memory implementation is private; the **interface** is normative. The
host MUST expose, per operator turn:

```ts
interface MemoryHandle {
  read(query?: {
    thread?: string
    before?: string
    limit?: number
  }): Promise<MemoryEntry[]>
  write(entry: {
    content: string
    tags?: string[]
    threadId?: string
  }): Promise<void>
  forget(filter: { id?: string; before?: string }): Promise<number>
}
```

An operator's memory belongs to the operator, not to a session. The resolved
agent's items carry the [AIP-72](/docs/aip-72) anchor `operator:<slug>`, which
marks ownership and does not widen visibility: an item the operator owns is
visible in a session only if the session's node projection also includes the
item's node. The operator uses the [AIP-42](/docs/aip-42) `memory` block;
legacy `memory.kind` values map as follows.

| Earlier `memory.kind` | AGENT `memory`                       | `read()` returns                           |
| --------------------- | ------------------------------------ | ------------------------------------------ |
| `none`                | `enabled: false`                     | always empty; `write()` is a no-op         |
| `thread`              | `scope: per-thread`                  | current conversation only                  |
| `operator-context`    | default (items anchored on the operator) | this operator's history across all threads |
| `external`            | `store: <external.uri>`              | host delegates to the store                |

Memory writes MUST go through the `policy` gate:

- `append-only` — every `write()` succeeds; `forget()` is denied.
- `redactable` — `write()` and `forget()` both succeed; the host records every
  `forget` in the audit log.
- `summarising` — the host runs a periodic compaction pass that collapses old
  entries into rolling summaries. The author body doesn't see this happening;
  reads return the compacted form.

`memory.share_with[]` is deprecated toward [AIP-38](/docs/aip-38) read grants on
the memory store. A host that has not moved keeps honouring it, as a **read**
grant only: the granted operator's `read()` returns entries from the granting
operator's namespace tagged with the grant. Writes never cross the boundary.

## Governance enforcement

The operator's bound `policy` ([AIP-38](/docs/aip-38)), or the legacy
`governance` binding, is consulted by:

- The runtime, BEFORE every gated tool call.
- The runtime, BEFORE every memory write that affects shared state.
- The runtime, on every state transition (so the audit log is comprehensive).

Resolution per gated action:

1. Read the effective policy (or `governance.policies[]` in the legacy form) and
   walk each policy in declaration order.
2. The first policy that matches the action's `(class, scope, capability)`
   triple wins.
3. The matching policy returns one of `allow` / `deny` / `prompt(<approver>)`.
   The host enforces the verdict; on `prompt`, the operator transitions to
   `suspended` and waits.

Unknown policy refs MUST refuse the action. Silent fallthrough is a security
bug.

`autonomy` is the [AIP-42](/docs/aip-42) integer (0 always asks, 10 acts freely).
The legacy `governance.autonomy` enum maps to it: `gated` is 0, `supervised` is 5,
`autonomous` is 10.

| autonomy         | Host behaviour                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| high (up to 10)  | Run gated tools per their own approval class; the policy applies normally.                         |
| middle (about 5) | Every privileged action (anything not `mutates: []`) prompts, regardless of tool-level `approval`. |
| 0                | Operator does NOT run a turn without an explicit per-turn `dispatchApproval` from a human.         |

An operator at 0 MUST NOT be proactive: `participation.mode` is `mention-only`
or `silent`.

## Conversation participation

Operators that join shared threads MUST implement:

- **Mention handling** — receive `@<id>` mentions and respond.
- **Pass** — emit a structured `pass` event when `pass_when` evaluates true.
  Pass is **first-class behaviour, not a failure mode**; the audit log records
  passes the same as turns.
- **Reactions** — when `participation.reactions: true`, the operator MAY emit
  lightweight signals (👍 ✅ 🚧 ⏳) without generating a full turn.
- **Visibility** — public, private-to-admin, or scoped per the conversation's
  visibility rules; the host enforces, the operator body never sees rejected
  messages.

The host MUST rate-limit `proactive` participation. Default cap: one proactive
turn per minute per operator per thread.

## Capability negotiation

Capabilities flow in two directions:

- **Operator declares** what it CAN do (`capabilities[]`).
- **Runtime offers** what it makes available (a host-level capability surface).

A capability is usable iff both sides agree. Gaps surface during **workflow
planning** (before the operator runs) as `unmet-capability` errors, with the
missing capability and the absent side cited.

## Error envelope

All errors leave the host as:

```ts
type OperatorResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        retryable?: boolean
        cause?: unknown
      }
    }
```

Codes follow the [AIP-9 vocabulary](/docs/aip-9#errors) plus the shared codes
from AIP-14 / AIP-15:

- `unmet-capability` — operator can't perform the requested action.
- `policy-denied` — AIP-7 policy refused.
- `interrupted` — turn aborted (cancel signal, timeout).
- `skill-load-failed` — a referenced skill failed to load.
- `tool-resolution-failed` — a referenced tool isn't in the catalog.
- `memory-poisoned` — a memory validation step rejected a write.

Hosts that pipe errors to a tracing backend SHOULD emit `code` as a span
attribute keyed `operator.error.code`.

## Loader rules

The entry file MUST be safely importable as a side-effect-free module:

- **No I/O at module load.** All I/O happens inside operator turns.
- **No reliance on a running host singleton.** The entry MUST work when imported
  in isolation — for testing, prompt export, doc generation. Host context
  arrives via dispatch.
- **Default export is the `defineOperator(...)` return value.** Named-export
  equivalents MAY be supported but the canonical shape is single-default-export.

## Multi-language hosts

Same naming pattern as TOOL.md / WORKFLOW.md adapters:

| Language                | Function name               | Memory binding      |
| ----------------------- | --------------------------- | ------------------- |
| TypeScript / JavaScript | `defineOperator`            | object literal      |
| Python                  | `define_operator`           | dataclass / dict    |
| Go                      | `DefineOperator`            | struct              |
| Rust                    | `define_operator` (free fn) | struct              |
| Java / Kotlin           | `defineOperator` (static)   | record / data class |

The manifest is the same across languages; only the entry's host runtime
changes.

## Registration test

A conforming host SHOULD provide a `validate(manifestPath)` helper that:

1. Parses the manifest.
2. Validates against `OPERATOR.schema.json`.
3. Loads the entry; verifies `defineOperator(...)` returned a value.
4. Resolves all skill / tool / policy references.
5. Negotiates capabilities and surfaces unmet ones.
6. Synthesises the system prompt and prints it (no LLM call) so the author can
   sanity-check the output.
7. Reports the first failure with file + field path.

This is the standard "is this operator installable?" handshake.

## What this guide does NOT cover

- The host's persistence backend for memory and run state.
- The host's invocation surface (chat UI, REST, queue, voice WS).
- The host's UI for governance approval prompts.
- Multi-tenant isolation, billing, quotas — all runtime-policy concerns.
- Operator-to-operator delegation routing — see EXAMPLES.md pattern 7 for the
  **author-side** shape; the routing implementation stays out of the spec on
  purpose.

## See also

- [AIP-9 — OPERATOR (operator/v1)](/docs/aip-9)
- [AIP-47 — ROLE.md](/docs/aip-47) — the role an operator holds
- [AIP-42 — AGENT.md](/docs/aip-42) — what an operator resolves into
- [AIP-3 — SKILL.md](/docs/aip-3) — skills loaded into operators
- [AIP-14 — TOOL.md](/docs/aip-14) — tools loaded into operators
- [AIP-15 — WORKFLOW.md](/docs/aip-15) — what dispatches to operators
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-6 — company/v1](/docs/aip-6) — file-tree representation
- [`./OPERATOR.schema.json`](./OPERATOR.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
