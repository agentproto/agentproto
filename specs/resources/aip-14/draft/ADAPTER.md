# ADAPTER.md — implementing AIP-14 in a host runtime

This document is the implementer's guide for any runtime, framework, or
language that wants to **load, validate, and register** AIP-14
[`TOOL.md`](/docs/aip-14) files. It is normative for the parts marked
**MUST** and informative for the parts marked **SHOULD**.

The audience is a runtime author — someone exposing `defineTool` to tool
authors. Tool authors themselves should read [`./skills/author-tool/SKILL.md`](./skills/author-tool/SKILL.md), not this file.

After AIP-30 ships, TOOL.md is the **abstract contract layer**. Bodies,
transport, install, auth, and sandbox all live on DRIVER.md (per
AIP-30). The host implementing TOOL.md is responsible for:

1. Validating contracts.
2. Resolving drivers per call.
3. Validating inputs/context against the contract before dispatch.
4. Routing the validated call to the chosen driver's `execute`.
5. Wrapping results into the standard envelope.

Driver-side responsibilities (install, auth state, sandbox enforcement,
output parsing) belong to [`packages/driver/core`](https://github.com/agentproto/ts/tree/main/packages/driver/core) and the kind-specific subtypes —
not to tool-runtime.

## Contract overview

A conforming host implements four responsibilities when a TOOL.md is
registered:

1. **Parse the manifest** — read `TOOL.md`, validate against
   [`./TOOL.schema.json`](./TOOL.schema.json), surface errors. Reject
   manifests carrying removed fields (`entry`, `code`, `run`, `runner`,
   `secrets`, `network`) with a migration message pointing at AIP-30.
2. **Bind to drivers** — for each registered DRIVER.md whose
   `implements[]` references this tool, validate the binding (semver
   intersection, schema narrowing coherence, mapping coverage).
3. **Expose the resolver** — when a caller invokes the tool, run the
   6-phase resolver to pick a driver, then dispatch.
4. **Audit** — emit per-call audit rows recording the contract, the
   resolved driver, and the outcome.

## `defineTool` — the entry-point function

### Required behaviour

A host that implements `defineTool` MUST:

1. **Accept the `ToolDefinition` shape** documented in
   [AIP-14 § The `defineTool` standard signature](/docs/aip-14#the-definetool-standard-signature).
   Every field listed there MUST be honoured at runtime.

2. **Reject `execute` on the contract.** If `defineTool` receives an
   `execute` field, surface a migration error pointing at AIP-30. Bodies
   live on drivers; the contract has no body.

3. **Validate `input` against `inputSchema` before dispatch.** When the
   resolver picks a driver and the host calls
   `driver.execute[<toolId>]`, the input MUST already be validated.
   The driver body MUST NOT re-validate.

4. **Validate `context` against `contextSchema` (when declared) before
   dispatch.** Same rule as input. Drivers receive a narrowed typed
   context.

5. **Apply `schema_narrowing`** at resolver time. If the call uses an
   input listed in the picked driver's `schema_narrowing.drop_inputs`,
   surface `error.code = "input_unsupported"` BEFORE dispatch — not at
   the driver body.

6. **Honour `default_driver`** in resolver Phase 5 (cost ranking).
   When no other signal differentiates candidates, prefer the contract's
   pinned default.

7. **Honour `driver_constraints`** in resolver Phase 1 (candidate
   filter). Drop drivers whose `kind` is in
   `driver_constraints.forbid` or absent from
   `driver_constraints.require_kind` (when set).

8. **Wrap thrown errors into the standard envelope.**
   `{ ok: false, error: { code, message, retryable?, cause? } }`.
   Standard codes: `input_invalid`, `input_unsupported`,
   `auth_required`, `not_found`, `rate_limited`, `timeout`,
   `upstream_error`, `no_route`, `pinned_provider_unavailable`,
   `internal`. Tool-specific codes use a domain prefix
   (`stripe:card_declined`).

9. **Enforce `timeout_ms`** at the contract ceiling. If the picked
   driver declares `timeout_override_ms` narrower than
   `timeout_ms`, the host uses the narrower value. If a driver
   tries to widen, the host MUST refuse the override.

10. **Apply `retry`** at resolver-coordinated time. Retry within a
    single dispatch is the host's job, not the driver's. Drivers
    that observe transient failures MUST throw a retryable error
    (`retryable: true`); the host decides whether to retry.

11. **No I/O at module load.** The module containing `defineTool`
    MUST be safely importable as a side-effect-free unit.

### Optional behaviour

A host MAY:

- Re-export `defineTool` under host-idiomatic aliases (`createTool`,
  `tool`, `registerTool`). The canonical name MUST be present.
- Accept zod, pydantic, attrs, or other schema libraries in
  `inputSchema` / `outputSchema` — canonicalise to JSON Schema for
  the manifest before hand-off. Stored canonical form MUST be JSON
  Schema; the framework-specific form is a developer-affordance only.
- Cache resolver decisions when policy + auth state + health are
  stable across calls. Cache key MUST include
  `(tool.id@major, policy_fingerprint, pinnedProvider, region)`.

## Schema canonicalisation

The manifest's `inputs` / `outputs` are JSON Schema. The entry's
`inputSchema` / `outputSchema` MAY be JSON Schema OR any value the host
can canonicalise (zod, pydantic, attrs, …).

Hosts MUST surface the **canonicalised JSON Schema** as the authoritative
form to:

- the audit log entry recording the call,
- the resolver's `schema_narrowing` validation,
- any catalog UI rendering the tool's input form.

The framework-specific form (zod schema object, pydantic class) is
ephemeral — used for type inference and developer ergonomics, never
stored.

## Resolver dispatch

When a caller invokes a tool:

```ts
async function dispatch(toolId, args) {
  const tool = registry.tools.get(toolId)
  if (!tool) throw new Error("tool_unknown")

  // Phase 1-5: resolver picks a driver
  const resolved = await resolver.resolve(tool, args.context)
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.errorCode, message: resolved.message } }
  }

  // Validate input against contract
  const validated = await validate(args.input, tool.inputSchema)
  if (!validated.ok) {
    return { ok: false, error: { code: "input_invalid", message: validated.message, field: validated.field } }
  }

  // Validate context against contract (if contextSchema declared)
  if (tool.contextSchema) {
    const ctxValidated = await validate(args.context, tool.contextSchema)
    if (!ctxValidated.ok) {
      return { ok: false, error: { code: "input_invalid", message: ctxValidated.message, field: "context" } }
    }
  }

  // Apply schema_narrowing — refuse calls using dropped inputs
  for (const dropped of resolved.driver.implements[toolId].schema_narrowing?.drop_inputs ?? []) {
    if (args.input[dropped] !== undefined) {
      return { ok: false, error: { code: "input_unsupported", message: `Input '${dropped}' not supported by driver ${resolved.driver.id}` } }
    }
  }

  // Apply mapping
  const mapped = applyMapping(args.input, resolved.driver.implements[toolId].mapping)

  // Dispatch to driver with retry + timeout enforcement
  return await runWithRetry(tool.retry ?? resolved.driver.retry_override, async (signal) => {
    return await runWithTimeout(tool.timeout_ms, signal, async () => {
      return await resolved.driver.execute[toolId]({
        input: mapped,
        context: args.context,
        driverCtx: resolved.driverCtx,
        signal,
      })
    })
  })
}
```

The host owns: validation, narrowing-refusal, mapping, retry, timeout,
and audit. The driver owns: the body. Clean split.

## Side-effect declaration enforcement

The `mutates` array drives:

- **Approval gating** ([AIP-7](/docs/aip-7)): an approval policy can
  refuse a tool whose `mutates` includes `database:` without an explicit
  ack.
- **Idempotency planners** for orchestration: workflows
  ([AIP-15](/docs/aip-15)) can decide whether to retry vs route to
  compensation.
- **Audit logs**: the post-call audit row records the contract's
  `mutates` so external auditors reconstruct effect graphs without
  re-reading driver code.

A tool's contract MUST declare every class of mutation any driver
might perform. A driver whose body observably writes resources not
declared in the contract MUST be refused at runtime — not silently
allowed.

How hosts detect undeclared mutations:

- **CLI drivers**: by tracking the binary's filesystem writes (per
  the sandbox's `fs.write` allowlist) and network egress; any write
  outside `tool.mutates` is logged + refused.
- **HTTP drivers**: by inspecting outbound calls; any host-detected
  side effect (POST/PUT/DELETE to an endpoint not in `tool.mutates`)
  is logged.
- **SDK / builtin**: by host-static analysis at registration
  (best-effort) plus runtime instrumentation of known mutation APIs.

This is host policy, not contract policy. Strict hosts refuse;
permissive hosts warn loudly. Both are conformant.

## Errors

Tools return errors out-of-band relative to `outputs`. The host wraps
driver runtime errors into the standard envelope:

```ts
type ToolResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: { code: string; message: string; retryable?: boolean; cause?: unknown } }
```

Standard error codes hosts MUST emit:

| Code | When |
|---|---|
| `input_invalid` | Caller's input failed `inputSchema` validation. `field:` names the offending input. |
| `input_unsupported` | Caller's input includes a key listed in resolved driver's `schema_narrowing.drop_inputs`. |
| `no_route` | No driver survived the resolver's filter chain. Surface the closest-rejected candidates in `cause`. |
| `pinned_provider_unavailable` | `context.pinnedProvider` set but the candidate failed an earlier resolver phase. |
| `policy_violation` | Resolver rejected this call due to workspace policy + caller pinning combination. |
| `timeout` | Call exceeded `timeout_ms` (or narrowed `timeout_override_ms`). |
| `cancelled` | Caller aborted via `signal`. |
| `internal` | Unhandled host error. |

Driver-level codes (`auth_required`, `rate_limited`,
`upstream_error`, `output_parse_failed`) propagate through unchanged
from the driver runtime.

## Audit log shape

Hosts SHOULD emit one audit entry per tool dispatch:

```json
{
  "type": "tool.invoked",
  "tool_id": "image.create",
  "tool_version": "1.0.0",
  "tool_mutates": ["network:*"],
  "resolved_provider_id": "replicate-flux-http",
  "resolved_provider_version": "1.0.0",
  "user_id": "u_abc",
  "workspace_id": "w_xyz",
  "input_keys": ["prompt", "aspect"],
  "duration_ms": 6420,
  "retries": 0,
  "ok": true,
  "ts": "2026-04-30T14:00:00Z"
}
```

`input_keys` lists keys, not values (PII safety). `tool_mutates` is the
contract-declared set; an audit consumer can join this against the
driver's actual side effects to detect spec violations.

## Reference implementation

The canonical TypeScript implementation lives at
[`packages/tool`](https://github.com/agentproto/ts/tree/main/packages/tool).
It exposes:

- `defineTool(definition: ToolDefinition): ToolHandle`
- `loadTool(path: string): Promise<ToolHandle>`
- `dispatchTool(toolId, { input, context, signal }): Promise<ToolResult>`
- `validateInput(toolHandle, input): ValidationResult`

The dispatcher composes with `driver-runtime` (per AIP-30) for
resolver + per-kind execution. tool-runtime's job is the contract layer
only; driver-runtime's job is the implementation layer.

## Migration notes

### From the pre-AIP-30 bundled shape

A pre-refactor TOOL.md carried `code`, `run`, `runner`, `secrets`,
`network`, `entry` directly. To migrate:

1. Author a sibling `DRIVER.md` per [AIP-30](/docs/aip-30) carrying
   the moved fields:
   - `code` / `run` → `driver.code` / `driver.run`
   - `runner` → `driver.runner`
   - `secrets` → `driver.auth.ref` (point at a sibling SECRETS.md)
   - `network` → `driver.network.egress`
   - `entry`'s `execute` body → `driver.execute[<toolId>]`
2. Set `driver.implements[0].tool` to the (now-amputated) TOOL.md.
3. Remove the moved fields from TOOL.md; add `default_driver` if
   relevant.
4. Validate both files against their v1 schemas.

The migration is a single PR per tool. No deprecation window, no
codemod release. Internal consumers migrate in lockstep with the spec
rewrite.

### From hand-rolled wrappers (Mastra `createTool`, LangChain tools)

1. Add `TOOL.md` for the contract: id, schemas, mutates, approval,
   requires.
2. Add `DRIVER.md` for the implementation per [AIP-30](/docs/aip-30):
   kind, auth, sandbox, implements.
3. Re-export the existing body as the DRIVER's
   `execute[<toolId>]`.
4. Run both manifests through their schemas.

Hosts MAY accept legacy runtime-specific tool registrations during a
migration period; the audit-log shape from [AIP-7](/docs/aip-7)
remains identical as long as `mutates` / `requires` / `approval` are
populated on the contract side.
