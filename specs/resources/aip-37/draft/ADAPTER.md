# ADAPTER.md — implementing AIP-37 (Lifecycle Events) in a host runtime

This document is the implementer's guide for any runtime that wants to
**emit and subscribe to** [AIP-37](/docs/aip-37) lifecycle events.
It is normative for the parts marked MUST and informative for the parts
marked SHOULD.

AIP-37 defines a **named event taxonomy** for agent runtime lifecycle
transitions. It does NOT define a transport (HTTP, WebSocket, pub/sub are
all valid). It defines the event names, when they fire, and what payload
they carry.

---

## Purpose

Lifecycle events decouple producers (routines, storage, corpus, workflows)
from consumers (schedulers, monitoring, reactive automations). A storage
backend says `commit.on: per-turn` and the event bus routes the `turn-end`
event to the commit step — no direct coupling.

---

## Standard event vocabulary

### Session / turn events

| Event name | When | Key payload fields |
|---|---|---|
| `workspace-open` | Workspace first accessed in a session. | `workspaceId`, `sessionId` |
| `workspace-close` | Workspace session ends. | `workspaceId`, `sessionId` |
| `turn-start` | Agent turn begins (user prompt received). | `turnId`, `conversationId` |
| `turn-end` | Agent turn completes (response fully emitted). | `turnId`, `conversationId`, `durationMs` |
| `conversation-start` | New conversation session begins. | `conversationId`, `operatorId` |
| `conversation-end` | Conversation session ends. | `conversationId`, `durationMs` |

### Write events

| Event name | When | Key payload fields |
|---|---|---|
| `each-write` | Any file write in the workspace. | `path`, `workspaceId` |
| `per-turn` | Alias for `turn-end` (write context). | (same as turn-end) |
| `per-conversation` | Alias for `conversation-end` (write context). | (same as conversation-end) |

### Routine events (see AIP-41)

| Event name | When | Key payload fields |
|---|---|---|
| `routine-triggered` | Routine fires (before target invocation). | `routineId`, `firedAt` |
| `routine-completed` | Routine target ran successfully. | `routineId`, `durationMs` |
| `routine-failed` | Routine failed after all retries. | `routineId`, `error` |

### Storage events (see AIP-35)

| Event name | When | Key payload fields |
|---|---|---|
| `storage-pull-started` | Pull from remote begins. | `storageId`, `provider` |
| `storage-pull-completed` | Pull succeeded. | `storageId`, `ref` |
| `storage-pull-failed` | Pull failed. | `storageId`, `error` |
| `storage-commit-completed` | Local commit succeeded. | `storageId`, `ref` |
| `storage-push-completed` | Push to remote succeeded. | `storageId`, `ref`, `prUrl?` |

### Corpus / distill events (see AIP-10, AIP-51)

| Event name | When | Key payload fields |
|---|---|---|
| `corpus-distill-started` | Distill run begins. | `corpusId`, `sourceId`, `lensId?` |
| `corpus-distill-completed` | Distill run finished. | `corpusId`, `entryCount`, `engine` |
| `corpus-synthesis-rebuilt` | Synthesis artifact rebuilt (AIP-51). | `corpusId`, `lensId`, `atomCount` |

---

## Event envelope

All events share a common envelope:

```ts
interface LifecycleEvent {
  /** The AIP-37 event name. */
  name: string

  /** ISO-8601 instant of emission. */
  emittedAt: string

  /** The runtime that emitted the event. */
  source: {
    kind: "routine" | "storage" | "corpus" | "session" | "workflow" | "host"
    id: string
  }

  /** Event-specific payload (open shape). */
  payload: Record<string, unknown>
}
```

---

## Event bus contract

The host MUST provide an event bus with at minimum:

```ts
interface LifecycleEventBus {
  /** Emit an event to all subscribers. */
  emit(event: LifecycleEvent): void

  /** Subscribe to events by name (exact match or glob `"*"`). */
  on(eventName: string | "*", handler: (event: LifecycleEvent) => void): Unsubscribe
}

type Unsubscribe = () => void
```

### Delivery guarantees

The day-1 bus is **best-effort, in-process, synchronous**: handlers are called
inline during `emit()`. This is sufficient for local lifecycle wiring (storage
sync triggers, routine schedulers).

Hosts that need durability (at-least-once delivery, persistence across restarts)
SHOULD layer a durable transport (Redis pub/sub, a message queue) on top of the
in-process bus, but this is NOT required for conformance.

### Alias resolution

The names `each-write`, `per-turn`, `per-conversation`, `per-commit` are
**aliases** that the host MUST resolve to the canonical event:

| Alias | Canonical event |
|---|---|
| `per-turn` | `turn-end` |
| `per-conversation` | `conversation-end` |
| `per-commit` | `storage-commit-completed` |
| `each-write` | `each-write` (canonical; no alias needed) |

A consumer that subscribes to `per-turn` receives `turn-end` events. The host
resolves aliases at subscription time.

---

## How producers use the bus

```ts
// At turn end:
bus.emit({
  name: "turn-end",
  emittedAt: new Date().toISOString(),
  source: { kind: "session", id: conversationId },
  payload: { turnId, conversationId, durationMs },
})
```

---

## How consumers use the bus

AIP-35 storage backends:

```ts
bus.on("workspace-open", () => storage.pull({ cwd }))
bus.on("turn-end",       () => storage.commit({ cwd, message: "agent: turn" }))
bus.on("per-conversation", () => storage.push({ cwd }))
```

AIP-41 routines register their `fires_events` list and the scheduler subscribes
to the routine's output events to drive downstream automations.

---

## Conformance checklist

A conforming implementation MUST:

- [ ] Implement `emit()` and `on()` on the event bus.
- [ ] Emit `turn-start` and `turn-end` around every agent turn.
- [ ] Emit `workspace-open` when a workspace is first accessed in a session.
- [ ] Resolve aliases (`per-turn` → `turn-end`, etc.) at subscription time.
- [ ] Never block `emit()` on a slow handler — handlers MUST be called
  synchronously OR the bus MUST queue and drain async without blocking the caller.

---

## See also

- [AIP-37 — lifecycle events spec](/docs/aip-37)
- [AIP-35 — storage (uses lifecycle triggers)](/docs/aip-35)
- [AIP-41 — routines (fires and consumes events)](/docs/aip-41)
- [AIP-10 — corpus (emits distill events)](/docs/aip-10)
