# ADAPTER.md — implementing AIP-41 (Routine) in a host runtime

This document is the implementer's guide for any runtime that wants to
**load, schedule, and run** [AIP-41](/docs/aip-41) `routine/v1` manifests.
It is normative for the parts marked MUST and informative for the parts marked
SHOULD.

A Routine decouples *when* (the schedule) from *what* (the target action,
workflow, or tool). The host owns the scheduler; the manifest owns the intent.

---

## Filesystem layout

Routines live under a `routines/` directory in any consuming workspace
(operator, corpus, company, or standalone registry):

```
<workspace-root>/
└── routines/
    ├── daily-distill/
    │   └── ROUTINE.md
    ├── weekly-report/
    │   └── ROUTINE.md
    └── ...
```

Each routine is a directory whose name matches the routine's `id` field,
containing exactly one `ROUTINE.md` file. The host MUST reject a
`ROUTINE.md` whose `id` does not match its parent directory name (case-insensitive,
with `-` / `_` normalised).

---

## Manifest shape

The frontmatter is validated against
[`./ROUTINE.schema.json`](./ROUTINE.schema.json). Minimum required fields:

```yaml
---
schema: routine/v1
id: daily-distill
description: |
  Distils yesterday's conversations into the corpus every morning at 07:00 local.
schedule:
  cron: "0 7 * * *"
  timezone: "Europe/Paris"
target:
  kind: workflow
  ref: "@agentproto/workflows/corpus-distill"
---
```

The `schema` field MUST be the literal string `"routine/v1"`.

### Schedule block

The `schedule` block declares *when* the routine fires:

| Field | Required | Description |
|---|---|---|
| `cron` | yes (or `interval`) | Standard 5-field cron expression. |
| `interval` | yes (or `cron`) | ISO-8601 duration, e.g. `PT6H` (every 6 hours). |
| `timezone` | no | IANA timezone. Defaults to UTC. |
| `not_before` | no | ISO-8601 instant; routine will not fire before this time. |
| `not_after` | no | ISO-8601 instant; routine expires after this time. |
| `jitter_seconds` | no | Random delay (0 – N seconds) added per fire to spread load. |

Exactly one of `cron` or `interval` MUST be present.

### Target block

The `target` block declares *what* fires:

| `kind` | `ref` shape | Notes |
|---|---|---|
| `workflow` | AIP-15 WORKFLOW.md ref | Compiles and runs the workflow. |
| `action` | AIP-39 ACTION.md ref | Invokes the action with `params`. |
| `tool` | AIP-14 tool id | Calls the tool directly with `args`. |
| `agent` | AIP-42 AGENT.md ref | Starts a one-shot agent session. |

```yaml
target:
  kind: action
  ref: "@corpus/actions/run-distill"
  params:
    lens: "marketing"
    engine: "claude-code"
```

### Optional blocks

**`retry`** — retry on failure:

```yaml
retry:
  attempts: 3
  backoff: exponential
  initial_delay_seconds: 30
  max_delay_seconds: 300
```

**`on_failure`** — routing after retries exhaust:

```yaml
on_failure:
  notify:
    - kind: tool
      ref: "notify-operator"
      params: { channel: "ops-alerts" }
```

**`history`** — run history retention:

```yaml
history:
  retain_runs: 50
  retain_days: 30
```

**`fires_events`** — AIP-37 lifecycle events emitted by this routine:

```yaml
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
```

Defaults to these three. Hosts SHOULD emit them into the AIP-37 event bus so
downstream automations can react.

**`enabled`** — set to `false` to register without firing (staging):

```yaml
enabled: false
```

---

## Loading a routine

The host MUST walk `routines/` directories on workspace load and:

1. **Detect** every `<id>/ROUTINE.md` file.
2. **Read and parse** the YAML frontmatter.
3. **Validate** against `ROUTINE.schema.json`. On failure, surface
   `routine_invalid { id, field, message }` as an error and skip — a bad
   manifest MUST NOT silently register.
4. **Verify id consistency** — `frontmatter.id` MUST equal the directory name
   (after normalisation). Mismatch → `routine_id_mismatch`.
5. **Register** the routine in the in-memory registry, keyed by `id`.

The host MUST NOT execute the target at load time. Loading is read-only.

---

## Scheduling

The host maintains a scheduler (cron or interval-based) that:

1. Computes the next fire time from `schedule.cron` / `schedule.interval` +
   `schedule.timezone`.
2. Applies `schedule.not_before` / `schedule.not_after` guards.
3. Adds up to `schedule.jitter_seconds` random delay before triggering.
4. Skips routines whose `enabled` field is `false`.

The scheduler MUST be stateless across restarts: the next fire time is always
re-computed from wall clock + cron expression. The host MUST NOT store "last run"
in the manifest file — use `history` or an external store.

---

## Firing a routine

When the scheduler fires a routine:

1. **Emit** `routine-triggered` into the AIP-37 event bus (if `fires_events`
   includes it).
2. **Resolve the target** — look up the ref in the relevant registry (AIP-15
   for workflows, AIP-39 for actions, AIP-14 for tools, AIP-42 for agents).
   If unresolvable, emit `routine-target-unresolvable` and go to the failure
   path.
3. **Run the target** with the `params` / `args` from the manifest, under the
   `identity` principal if specified.
4. On success → **emit** `routine-completed`.
5. On failure → apply the `retry` block, then → **emit** `routine-failed`,
   then → invoke `on_failure` handlers.

The host MUST record each fire in the run history (in-memory or external store)
with `{ routineId, firedAt, status, durationMs, error? }`.

---

## Identity + permissions

If the manifest includes an `identity:` block (AIP-23 ref), the host MUST run
the target *as* that principal — resolving credentials via AIP-19 if needed.
Without `identity:`, the host runs under its own service account.

The host SHOULD check that the resolved identity has permission to invoke the
target (AIP-7 governance gate) before firing. A permission failure is treated
as a target-unresolvable failure (goes to retry + `on_failure`).

---

## Event bus integration (AIP-37)

Routines are a primary *producer* of AIP-37 lifecycle events. Every fire MUST
emit at minimum:

| Event name | When |
|---|---|
| `routine-triggered` | At the start of a fire (before target invocation). |
| `routine-completed` | After a successful target run. |
| `routine-failed` | After all retries have exhausted without success. |

The `fires_events` field on the manifest MAY extend this list with custom event
names specific to the target (e.g. `corpus-distill-started`). The host MUST
emit only the events listed in `fires_events`.

---

## Error codes

| Code | Meaning |
|---|---|
| `routine_invalid` | Manifest fails schema validation. |
| `routine_id_mismatch` | `frontmatter.id` ≠ directory name. |
| `routine_target_unresolvable` | `target.ref` does not resolve in the registry. |
| `routine_permission_denied` | Identity lacks permission to invoke the target. |
| `routine_expired` | Fire time is past `schedule.not_after`. |
| `routine_disabled` | Routine `enabled: false` — scheduled but will not fire. |

---

## Canonical TypeScript signatures

```ts
interface RoutineHandle {
  id: string
  description: string
  schedule: ScheduleBlock
  target: TargetBlock
  retry?: RetryBlock
  onFailure?: OnFailureBlock
  history?: HistoryBlock
  firesEvents: string[]
  enabled: boolean
  identity?: IdentityRef
}

interface RoutineRegistry {
  load(routinesDir: string): Promise<RoutineHandle[]>
  get(id: string): RoutineHandle | undefined
  all(): RoutineHandle[]
}

interface RoutineRunner {
  fire(routine: RoutineHandle): Promise<RoutineRunResult>
}

interface RoutineRunResult {
  routineId: string
  firedAt: string     // ISO-8601
  status: "completed" | "failed"
  durationMs: number
  error?: unknown
}
```

---

## Conformance checklist

A conforming implementation MUST:

- [ ] Validate every `ROUTINE.md` against `ROUTINE.schema.json` on load.
- [ ] Reject manifests whose `id` ≠ directory name.
- [ ] Never execute the target at load time.
- [ ] Compute next fire time from cron/interval without persisting "last run" in the manifest.
- [ ] Emit `routine-triggered` / `routine-completed` / `routine-failed` events.
- [ ] Apply `retry` before invoking `on_failure`.
- [ ] Skip `enabled: false` routines in the scheduler.
- [ ] Guard on `not_before` / `not_after` before firing.

---

## See also

- [AIP-41 — agentroutine/v1 spec](/docs/aip-41)
- [AIP-37 — lifecycle events](/docs/aip-37)
- [AIP-15 — workflow manifests](/docs/aip-15)
- [AIP-39 — action manifests](/docs/aip-39)
- [AIP-14 — tool contracts](/docs/aip-14)
- [AIP-23 — identity](/docs/aip-23)
- [`./ROUTINE.schema.json`](./ROUTINE.schema.json)
