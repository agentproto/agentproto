# ADAPTER.md — implementing AIP-9 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, activate, and dispatch to** AIP-9
[`OPERATOR.md`](/docs/aip-9) files. It is normative for the parts marked MUST
and informative for the parts marked SHOULD.

The audience is a runtime author — someone exposing `defineOperator` to operator
authors. Operator authors themselves should read [`./SKILL.md`](./SKILL.md), not
this file.

## Contract overview

A conforming host implements five responsibilities, in this order when an
OPERATOR.md folder is registered:

1. **Parse the manifest** — read `OPERATOR.md`, validate against
   [`./OPERATOR.schema.json`](./OPERATOR.schema.json), surface errors.
2. **Load the entry** — `import` (or language-equivalent) the file referenced by
   `entry`. The entry's default export is a value produced by
   `defineOperator(...)`.
3. **Resolve attachments** — walk `skills[]` against the [AIP-3](/docs/aip-3)
   catalog, `tools[]` against the [AIP-14](/docs/aip-14) catalog, MCP servers
   against their respective endpoints, and `governance.policies[]` against the
   [AIP-7](/docs/aip-7) policy registry. Missing refs MUST refuse registration.
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
   [AIP-9 § Operator shape](/docs/aip-9#operator-shape). Every field listed
   there MUST be honoured at runtime.
2. **Synthesise the system prompt** from `profile.role`, `profile.voice`,
   `profile.boundaries`, plus prose injected by each loaded skill. The synthesis
   order is normative:
   `role → voice → boundaries → skill prompts (in load order) → governance reminder`.
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

## Profile application

When the host activates an operator, it MUST:

1. Build the system prompt deterministically from the manifest's `profile` +
   each loaded skill's prompt fragment.
2. Cache the synthesised prompt keyed by
   `(operatorId, version, skill-set hash)`. Re-synthesise only on manifest or
   skill version change.
3. Expose the synthesised prompt to debug surfaces (the operator's "show me your
   system prompt" capability is first-class for inspection, not a hidden host
   secret).

The host MUST NOT silently inject host-specific prompt blocks the manifest
doesn't reference. Hosts that need to add platform-level text (rate-limit
reminders, etc.) SHOULD do so via a documented `platform` block that authors can
opt out of.

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

Behaviours per `memory.kind`:

| kind               | `read()` returns                           | `write()` persists                     |
| ------------------ | ------------------------------------------ | -------------------------------------- |
| `none`             | always empty                               | no-op (host MUST log a warning)        |
| `thread`           | current conversation only                  | scoped to the current `conversationId` |
| `operator-context` | this operator's history across all threads | per-operator namespace                 |
| `external`         | host delegates to `memory.external.uri`    | same                                   |

Memory writes MUST go through the `policy` gate:

- `append-only` — every `write()` succeeds; `forget()` is denied.
- `redactable` — `write()` and `forget()` both succeed; the host records every
  `forget` in the audit log.
- `summarising` — the host runs a periodic compaction pass that collapses old
  entries into rolling summaries. The author body doesn't see this happening;
  reads return the compacted form.

`memory.share_with[]` grants **read** access only. The granted operator's
`read()` returns entries from the granting operator's namespace tagged with the
grant. Writes never cross the boundary.

## Governance enforcement

The operator's `governance` binding is consulted by:

- The runtime, BEFORE every gated tool call.
- The runtime, BEFORE every memory write that affects shared state.
- The runtime, on every state transition (so the audit log is comprehensive).

Resolution per gated action:

1. Read `governance.policies[]` and walk each policy in declaration order.
2. The first policy that matches the action's `(class, scope, capability)`
   triple wins.
3. The matching policy returns one of `allow` / `deny` / `prompt(<approver>)`.
   The host enforces the verdict; on `prompt`, the operator transitions to
   `suspended` and waits.

Unknown policy refs MUST refuse the action. Silent fallthrough is a security
bug.

`autonomy` overrides:

| autonomy     | Host behaviour                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `autonomous` | Run gated tools per their own approval class; `policies[]` apply normally.                         |
| `supervised` | Every privileged action (anything not `mutates: []`) prompts, regardless of tool-level `approval`. |
| `gated`      | Operator does NOT run a turn without an explicit per-turn `dispatchApproval` from a human.         |

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

- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-3 — SKILL.md](/docs/aip-3) — skills loaded into operators
- [AIP-14 — TOOL.md](/docs/aip-14) — tools loaded into operators
- [AIP-15 — WORKFLOW.md](/docs/aip-15) — what dispatches to operators
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — file-tree representation
- [`./OPERATOR.schema.json`](./OPERATOR.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
