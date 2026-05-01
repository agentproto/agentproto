# ADAPTER.md — implementing AIP-15 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and execute** AIP-15
[`WORKFLOW.md`](/docs/aip-15) files. It is normative for the parts marked MUST
and informative for the parts marked SHOULD.

The audience is a workflow runtime author — someone exposing `defineWorkflow`
and `defineStep` to workflow authors. Workflow authors themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when a
WORKFLOW.md folder is registered:

1. **Parse the manifest** — read `WORKFLOW.md`, validate against
   [`./WORKFLOW.schema.json`](./WORKFLOW.schema.json), surface errors.
2. **Load the entry** — `import` (or language-equivalent) the file referenced by
   `entry`. The entry's default export is a value produced by
   `defineWorkflow(...).commit()`.
3. **Reconcile** — verify the entry's step graph matches the manifest's
   `steps[]` (ids, kinds, refs). Mismatch is a spec bug.
4. **Register and gate** — wire the workflow into the host's workflow catalog,
   persist suspendable run state, enforce `approval` / `riskLevel` / `timeoutMs`
   / `retry` / compensation at every step boundary.

The two signatures `defineStep` and `defineWorkflow` are the boundary between
the host and the author. The host MAY internally translate to its own workflow
type after `commit()`, but the signatures are what authors call.

## `defineStep` — declare a single step

### Required behaviour

A host that implements `defineStep` MUST:

1. **Accept the `StepDefinition` shape** documented in
   [AIP-15 § The `defineWorkflow` and `defineStep` standard signatures](/docs/aip-15#the-defineworkflow-and-definestep-standard-signatures).
   All eight kinds (`tool`, `branch`, `parallel`, `suspend`, `approval`, `map`,
   `loop`, `subworkflow`) MUST be supported.
2. **Reject unknown kinds at registration**, with a clear error. Hosts MAY add
   proprietary extensions, but they live OUTSIDE the standard signature.
3. **Validate kind-specific fields.** A `kind: "branch"` step MUST have
   `branches[]`. A `kind: "approval"` step MUST have `approvers[]`. Etc. Check
   at registration, not at runtime.
4. **Defer the body's I/O to call time.** `defineStep(...)` MUST NOT execute the
   body during registration; it returns a handle the workflow runner invokes
   later.

### Optional behaviour

A host MAY:

- Re-export `defineStep` under host-idiomatic aliases (`step`, `createStep`).
  The canonical name MUST be present.
- Accept zod, pydantic, or other schema libraries in `outputs` — canonicalise to
  JSON Schema for the manifest before hand-off.

## `defineWorkflow` — assemble a workflow

### Required behaviour

A host that implements `defineWorkflow` MUST:

1. **Accept the `WorkflowDefinition` shape** with the fluent builder methods or
   up-front `steps[]`. Both styles MUST yield the same registered workflow.
2. **Validate the graph at `commit()`**:
   - All `next` references resolve to declared steps OR `$end`.
   - All `$steps.<id>.outputs.<field>` references in `inputs` mappings point to
     steps that complete BEFORE the referencing step in topological order.
   - No cycles outside `kind: "loop"` bodies.
   - Every `compensation: <id>` reference resolves.
3. **Reject at `commit()` if the manifest disagrees** with the entry's graph
   (different step ids, different kinds, different `next` wiring).

### Builder style vs up-front style

Hosts MAY support either or both:

```ts
// Builder style
defineWorkflow({ id, inputSchema, outputSchema, description })
  .step(stepA)
  .branch(stepB)
  .parallel(stepC)
  .commit()

// Up-front style
defineWorkflow({
  id,
  description,
  inputSchema,
  outputSchema,
  steps: [stepA, stepB, stepC],
  start: "stepA",
})
```

Both styles MUST be recognisable by the host's loader. Authors choose; the host
accepts.

## Schema canonicalisation

The manifest's `inputs` / `outputs` and each step's `outputs` are JSON Schema.
The entry MAY use zod / pydantic / etc.; the host canonicalises to JSON Schema
for:

- the audit log,
- catalog APIs,
- any LLM-facing description (most drivers want JSON Schema).

If entry schemas don't match manifest schemas after canonicalisation, `commit()`
MUST refuse.

## Step kinds — required behaviours per kind

### `kind: "tool"`

- Resolve the `tool: <id>` reference against the host's [TOOL.md](/docs/aip-14)
  catalog. If unresolvable, refuse at registration (not at runtime — surface
  early).
- Run the tool through the host's normal tool-call path; the workflow step is
  just a structured caller. Tool-level `mutates` / `requires` / `approval` apply
  ON TOP of step-level policies; the **stricter** wins.

### `kind: "branch"`

- Evaluate each branch's `when` expression in declaration order.
- First true branch wins; subsequent branches are skipped.
- If no branch matches, take `default` (defaults to `$end`).
- Hosts MUST support the [minimum expression grammar](/docs/aip-15#expressions);
  hosts MAY extend.

### `kind: "parallel"`

- Run named child step graphs concurrently.
- Wait for ALL branches to complete before advancing to `next`.
- If any branch errors, the host SHOULD cancel the others (best effort) and
  propagate the first error.
- Sibling-branch outputs are NOT visible across branches; they're visible after
  the join.

### `kind: "suspend"`

- Persist enough run state to resume from this exact step on a matching event
  (any of `resume.on[]`).
- On `resume.timeout_ms`, take `resume.on_timeout` (`cancel` | `continue` |
  `<step-id>`).
- The persistence model is host-defined: in-memory for ephemeral hosts, durable
  store for production. Hosts that can't persist MUST refuse `suspendable: true`
  workflows at registration.

### `kind: "approval"`

- Specialised suspend. The runtime emits an "approval-needed" event to the
  host's approval surface (UI prompt, Slack DM, email — host's choice).
- Resolution event carries
  `{ decision: "approve" | "reject", reason?, approver }`.
- `on_approve` / `on_reject` route to the next step; `on_timeout` works as in
  `suspend`.
- The audit log entry per [AIP-7](/docs/aip-7) MUST capture the approver,
  decision, timestamp, and `reason` — no host-specific fields. This is what
  makes approval logs comparable across systems.

### `kind: "map"`

- Iterate `over: <path>`. Each item gets a sub-graph run with `$item` and
  `$index` bound.
- `parallelism: N` caps concurrent items; 0 = unbounded.
- Aggregate results into an array matching the step's `outputs`.
- Errors in any item: host policy decides — fail-fast (cancel outstanding) or
  collect-all-errors. Document the chosen mode.

### `kind: "loop"`

- Repeat the nested graph while `while: <expr>` evaluates true.
- `max_iterations` is a HARD cap — the host MUST refuse to exceed it even if the
  condition is still true. Surfaces as an error.

### `kind: "subworkflow"`

- Resolve `workflow: <id>` against the host's WORKFLOW.md catalog.
- Map inputs through, run the sub-workflow as a black box, return outputs to
  this step's `outputs`.
- Sub-workflow errors propagate to the parent. Sub-workflow approvals / suspends
  are nested — parent waits.

## Approval enforcement

Same model as [TOOL.md adapter](../aip-14/ADAPTER.md#approval-enforcement): the
manifest declares the **author's** view; the host's policy can tighten but never
loosen.

Resolution per step:

1. Read `step.approval`.
2. If absent, fall back to `workflow.approval` (default `per-step`).
3. Read host policy.
4. Take the **strictest** of all.

`kind: "approval"` steps are **not subject to this resolution** — they always
prompt by definition. The resolution above applies to other kinds (`tool`,
`subworkflow`).

## Compensation

When a step throws and a compensation walk is required, the host:

1. Walks back through completed steps in **reverse declaration order**.
2. For each step with `compensation: <id>`, runs the compensation step. The
   compensation step receives the original step's outputs as input.
3. Compensation steps MAY themselves throw; the host MUST log and continue
   (best-effort cleanup).
4. After the walk, surface the original error to the workflow caller.

Compensation steps MUST be idempotent. The host MAY retry a compensation if its
first call timed out.

## Run lifecycle

The host MUST emit a structured event stream for each run:

| Event            | When                                                               |
| ---------------- | ------------------------------------------------------------------ |
| `run.started`    | After `commit()` validation succeeds and the start step is queued. |
| `step.started`   | When a step's body is about to execute.                            |
| `step.completed` | On success. Includes outputs (within audit-redaction policy).      |
| `step.failed`    | On error. Includes the error envelope.                             |
| `step.suspended` | When a `suspend` / `approval` step pauses.                         |
| `step.resumed`   | When a paused step receives its event.                             |
| `run.completed`  | All steps done, no errors.                                         |
| `run.failed`     | Uncaught error after compensation walk.                            |
| `run.cancelled`  | External cancel signal.                                            |

Hosts MAY add events; the eight above MUST be present. Tracing / observability
backends consume this stream uniformly.

## File contract

When a manifest declares `inputsFiles` / `outputsFiles`, the host MUST stage and
sync them around each run. The body never touches the workspace directly.

Lifecycle:

1. **Per-run scratch root.** On `createRun`, the host creates a fresh, unique
   directory (a temp dir keyed by `runId` is the reference implementation). All
   declared files live under this root by their manifest key as filename.

2. **Stage inputs.** For each `(key, entry)` in `inputsFiles`:
   - read `workspace:<entry.path>`
   - write the bytes to `<fsRoot>/<key>`
   - on read failure, throw before the run starts (audit-logged).

3. **Inject `_workflowFsRoot`.** The host adds `_workflowFsRoot` to the
   workflow's `inputData` before any step runs. The workflow's `inputSchema`
   MUST allow a string value for this key (typically `z.string().optional()` or
   equivalent). Bodies access it via `inputData._workflowFsRoot`.

4. **Run.** Step bodies read/write `<fsRoot>/<key>` for declared files. Bodies
   MAY scratch undeclared files in `<fsRoot>/`; those are dropped at cleanup.

5. **Sync outputs.** After the workflow completes (success OR failure), for each
   `(key, entry)` in `outputsFiles`:
   - if `<fsRoot>/<key>` exists: write to `workspace:<entry.path>`,
     interpolating `<runId>`, `<workflowId>`, `<isoDate>` tokens.
   - if missing: log a warning, continue. The output schema is authoritative for
     what's mandatory.

6. **Cleanup.** Remove the scratch root, best-effort.

Concurrency: each run owns its scratch root. Concurrent runs of the same
workflow MUST NOT see each other's files through the contract. Cross-run state
requires a tool, not file state.

## Runtime isolation

The manifest's `runtime` block declares the workflow's intended isolation. The
host has the final word — it MAY downgrade `in-process` to `sandbox`, MAY pin a
workspace's mode regardless of manifest claims, and MUST refuse registration
when it cannot honour what the manifest asks for.

### `runtime.mode: "sandbox"` — host responsibilities

A conforming sandbox host MUST:

1. **Strip parent process env.** Spawn the body with a deny-by-default
   environment. Only `runtime.env`-listed names + a minimal POSIX safe set
   (`HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `USER`) cross. The host's own
   `OPENAI_API_KEY`, `STRIPE_*`, etc. MUST stay in the parent.

2. **Resolve `runtime.env` from a credential store**, not from the host's own
   `process.env`. Each resolution emits an audit-log record naming the author,
   the env-var, the run, and the credential record.

3. **Restrict filesystem.** Reads + writes outside the per-run fs root MUST be
   denied by an enforcement primitive — Node `--permission` flags
   (`--allow-fs-read=fsRoot`, `--allow-fs-write=fsRoot`), Linux `bwrap`,
   container mounts, Firecracker, microVM, etc.

4. **Restrict network egress** to `runtime.network.egress`. Empty list = no
   network. Wildcards `*.example.com` match a single subdomain level. Hosts MAY
   enforce via per-process firewall, an HTTP/HTTPS egress proxy, or platform
   primitives. Hosts that CANNOT enforce MUST refuse to register sandboxed
   workflows that declare a non-empty egress list — silent no-op enforcement is
   unsafe and a spec violation.

5. **Cap resources** when the underlying isolation primitive supports it
   (`runtime.resources.timeoutMs`, `memoryMb`).

6. **Reject unsupported step kinds at registration.** A sandbox host that cannot
   persist suspend points MUST refuse to register workflows containing
   `kind: "suspend"` or `kind: "approval"` with a clear error. Silent fallback
   is a spec violation.

The body talks to the host through one channel only: the file contract (in/out
via `<fsRoot>`). All other host services (workspace ops outside declared files,
secrets reveal beyond `runtime.env`, telemetry) MUST be reachable via tools, not
via direct host-API calls — keeps the body portable across isolation backends.

### `runtime.mode: "in-process"` — host responsibilities

A host MAY honour `in-process` for workflows whose source it owns (its own
source tree, vendor packages). For any workflow originating outside that
boundary (workspace folders, user uploads, third-party plugins) the host MUST
silently downgrade to `sandbox` and emit a log warning naming the manifest path.
The downgrade is not optional — `in-process` is a privilege the host grants, not
a request the manifest can demand.

### Defaults

- Missing `runtime` block → `mode: sandbox`, no env, no egress, default resource
  caps.
- Missing `runtime.network` → no egress.
- Missing `runtime.resources` → host's default caps (RECOMMENDED: 600 s timeout,
  256 MB memory).

## Persistence

Suspendable workflows require run-state persistence. The host's schema MUST
capture, per run:

- `runId` (stable across suspend/resume).
- `workflowId` + `version`.
- `currentStepId`.
- Step outputs accumulated so far (so resumed steps can read upstream values).
- Suspend metadata (which event(s), timeout deadline).
- Compensation pointer (which steps need compensation on failure).

The format is host-defined; the **set of fields** is normative. This makes runs
auditable across host migrations.

## Multi-language hosts

Same pattern as TOOL.md ADAPTER:

| Language                | Function names                              | Schema dialect          |
| ----------------------- | ------------------------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineWorkflow`, `defineStep`              | JSON Schema or zod      |
| Python                  | `define_workflow`, `define_step`            | JSON Schema or pydantic |
| Go                      | `DefineWorkflow`, `DefineStep`              | struct tags             |
| Rust                    | `define_workflow`, `define_step` (free fns) | JSON Schema or schemars |

The expression grammar in `branch.when` / `loop.while` is the same across all
languages — it's parsed by the host, not by the body's language.

## Registration test

A conforming host SHOULD provide a `validate(manifestPath)` helper that:

1. Parses the manifest.
2. Validates against `WORKFLOW.schema.json`.
3. Loads the entry; verifies `defineWorkflow(...).commit()` returned a value.
4. Cross-checks manifest steps against entry steps (same ids, same kinds, same
   `next` graph).
5. Resolves all `tool: <id>` references against the host's
   [TOOL.md](/docs/aip-14) catalog.
6. Resolves all `workflow: <id>` references in `subworkflow` steps.
7. Statically verifies the path-expression grammar in every `when`, `while`, and
   `inputs` mapping.
8. Reports the first failure with file + step + field path.

## What this guide does NOT cover

- The host's persistence backend (Redis, Postgres, durable queue).
- The host's worker model (single-process, distributed, serverless).
- The host's approval UI surface (chat prompt, dashboard, mobile).
- Multi-tenant isolation, quotas, billing — all runtime-policy concerns.

These stay out of the spec on purpose.

## See also

- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-13 — agentwork/v1](/docs/aip-13) — work-item linkage
- [`./WORKFLOW.schema.json`](./WORKFLOW.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
