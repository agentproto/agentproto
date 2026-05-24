# AIP-48 — Adapter implementation guide

Each of the seven ports in `agentruntimes/v1` is an interface that an adapter
implements. The reference kernel `@agentproto/agent-runtime` ships one
adapter per port; this guide is for authors of additional adapters.

## General rules

- An adapter MUST expose a string `kind` and (where applicable) a declared
  set of `capabilities`. The kernel dispatches polymorphically off the
  interface, never `switch`-ing on `kind`.
- An adapter MUST be constructable with a single config object — the
  contents of its manifest block (e.g. `substrate.path` is passed verbatim
  to a `FileSubstrate` constructor).
- An adapter MUST tolerate missing optional manifest fields with sensible
  defaults.
- Adapters SHOULD NOT throw on transient failures — log + degrade if a
  partial result is meaningful, throw only when the runtime cannot
  continue.

## Substrate adapters

```ts
interface Substrate {
  readonly kind: string
  readonly capabilities: ReadonlySet<SubstrateCapability>
  append(turn: TurnInput): Promise<Turn>
  read(since?: TurnId): Promise<readonly Turn[]>  // oldest first
}
```

A Substrate is **append-only**. Implementations MAY garbage-collect
historical turns, but `read` SHOULD return a consistent window each call.

`TurnId` values are opaque to the kernel; the substrate decides their form
(content hash for `file`, UUID for `guilde-mcp`). When `since` is provided,
the substrate returns turns strictly newer than that id; when `since` is
unknown to the substrate (drift, GC, restart), behaviour SHOULD fall back to
"return everything you have."

Capabilities to declare honestly:

- `mentions` — substrate text payloads support @-syntax for human-readable
  participant references.
- `reactions` — turns can carry emoji reactions.
- `visibility` — turns have per-turn scope (public / private / role).
- `identity` — turn authors are distinguishable beyond participantId
  (operator vs user vs system).
- `multi-writer` — multiple processes can append concurrently without
  losing turns.
- `ordered` — `read()` always returns a globally consistent ordering.

## Dispatcher adapters

```ts
interface Dispatcher {
  readonly kind: string
  selectNext(input: { recentTurns; participants }): Promise<ParticipantId[]>
}
```

Pure function. Same input → same output (you can run an `llm-router`
dispatcher and that's fine, but caching is the implementation's choice).

Required behaviour:
- MUST NOT select the author of `recentTurns[recentTurns.length - 1]`
  (self-skip).
- MAY return multiple participants for fan-out — the kernel runs them all in
  the same cycle.
- Returning `[]` is normal — the runtime goes idle, lifecycle.onIdle fires.

The reference `mention` dispatcher matches Guilde's server-side parser
byte-for-byte: literal `@<displayName>` substring (case-sensitive) plus
`@<firstName>` with a word boundary for multi-word names (case-insensitive).
Any adapter that intends to interoperate with a Guilde substrate MUST match
this behaviour or substrate-side and dispatcher-side parsing will disagree.

## Participant adapters (executors)

```ts
interface ParticipantExecutor {
  readonly kind: string
  executeTurn(input: ParticipantExecuteInput): Promise<ParticipantExecuteOutput>
}
```

An executor receives the descriptor + recent turns + trigger turn + state +
optional abort signal. It returns content + optional meta + optional state
update.

Implementations:
- MUST honour the `signal` and abort cleanly. The kernel may abort a cycle
  if the runtime is shutting down.
- SHOULD return short, conversational content unless the trigger asks for
  detailed output — the substrate may be polled often, and verbose
  responses inflate the journal.
- MAY decline to respond by throwing — the kernel logs and continues with
  the next selected participant.

The reference `agent-cli` executor spawns an AIP-45 binary with the prompt
on stdin and parses optional JSON output. For richer streaming, future
executors can wrap `@agentproto/driver-agent-cli` and surface ACP events.

## State adapters

```ts
interface StateStore {
  readonly kind: string
  read(participantId: ParticipantId): Promise<Readonly<Record<string, unknown>>>
  write(participantId, state): Promise<void>
}
```

State is per-participant durable scratch — anything a participant wants to
remember across turns. Read on missing returns `{}`. Writes are full
overwrites (the participant is responsible for any merging before writing).

Sanitise `participantId` for backend safety — the reference `fs` adapter
strips path-traversal characters to keep IDs filesystem-safe.

## Lifecycle adapters

```ts
interface Lifecycle {
  onTurnEnd?(turn): Promise<void> | void
  onMention?(target, byTurn): Promise<void> | void
  onIdle?(): Promise<void> | void
}
```

All callbacks are optional. The kernel `await`s each (swallowing errors so
the loop survives) and treats absence as "do nothing." Use lifecycle for:

- Notifications (Slack ping when a turn lands).
- Replays into another substrate (mirror to a journal).
- Telemetry (turn duration, dispatcher latency).

Avoid blocking lifecycle calls — they're in the hot path. If a lifecycle
adapter needs network I/O, prefer fire-and-forget (`void (async () => …)()`).

## Effector bindings

Effectors are *declared* in the manifest and *resolved* by the participant
executor. The kernel does not enforce restrictions itself — an executor that
ignores `EffectorBinding.tools` is misbehaving but the kernel won't catch
it.

For the reference `agent-cli` executor, effectors are surfaced as part of
the assembled prompt header (e.g. "Allowed tools: Read, Grep, Bash"). For
in-process executors, effectors should be plumbed into the executor's
underlying tool selector.

## Provisioning adapters

```ts
interface ProvisioningPort {
  readonly kind: string
  // ...adapter-specific
}
```

Provisioning is the bridge between the manifest's declarative references
(roles, hooks, effector configs) and what's actually present on disk or
reachable over the network.

Reference path: `agentproto install runtime-profile/<slug>` ships static
file trees with per-file merge strategies (`overwrite`, `preserve`,
`merge-json-deep`, `append`) and a setup ledger so re-runs detect drift.

Future strategies:
- `guilde-sync` — pull the user's per-guild profile from a Guilde HTTP
  endpoint after `agentproto auth login`. Personalisation lives server-side.
- `mcp-self-action` — agents call an MCP tool that triggers
  `agentproto install` on the connected CLI session. Agent-initiated
  provisioning.

## Adding a new adapter

1. Pick the port. If your idea doesn't fit one of the seven, propose an
   eighth (very rare — most new functionality is a new adapter for an
   existing port).
2. Implement the interface. Add capabilities only if you really support
   them.
3. Register in your runtime's adapter registry. Reference registries live
   in `@agentproto/cli`'s `run-swarm` verb today.
4. Add a manifest example to `EXAMPLES.md`.
5. Write at least one cross-substrate / cross-dispatcher test if the
   adapter interacts with another port's data shape.
