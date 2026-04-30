# ADAPTER.md — implementing AIP-30 in a host runtime

This document is the implementer's guide for any runtime, framework, or
language that wants to **load, register, and invoke** AIP-30
[`PROVIDER.md`](/docs/aip-30) files. It is normative for the parts marked
**MUST** and informative for the parts marked **SHOULD**.

The audience is a runtime author — someone exposing `defineProvider` to
provider authors and operating a multi-provider tool catalog. Provider
authors themselves should read [`./skills/author-provider/SKILL.md`](./skills/author-provider/SKILL.md), not this file.

## Contract overview

A conforming host implements seven responsibilities, in roughly this order
when a PROVIDER.md is registered and exercised:

1. **Parse the manifest** — read `PROVIDER.md`, validate against
   [`./PROVIDER.schema.json`](./PROVIDER.schema.json), then dispatch to the
   subtype-specific schema (`kind: cli` → AIP-29 schema, `kind: http` →
   AIP-31, etc.) for kind-specific fields.
2. **Install** (CLI/SDK only) — try install methods in order until one
   succeeds; verify SHA-256 when supplied.
3. **Version-check** (CLI/SDK only) — run `version_check.cmd`, parse,
   compare against `version_check.range`. Refuse the provider on mismatch.
4. **Authenticate** — drive the auth state machine using `auth.login` /
   `auth.refresh` / `auth.expiry.detect`.
5. **Bind tools** — for each entry in `implements[]`, validate the
   referenced TOOL.md exists, the contract semver intersects, and the
   `mapping`/`schema_narrowing` are coherent. Refuse the provider if any
   binding is broken.
6. **Health-check** — run the periodic `health_check` per `every`, mark
   the provider available/unavailable for resolver Phase 2.
7. **Dispatch** — when the resolver picks this provider for a call,
   validate input + context (host's job, not provider's), invoke
   `execute[<toolId>]`, route output through `parseOutput` if declared.

## `defineProvider` — the entry-point function

### Required behaviour

A host that implements `defineProvider` MUST:

1. **Accept the `ProviderDefinition` shape** documented in
   [AIP-30 § The `defineProvider` standard signature](/docs/aip-30#the-defineprovider-standard-signature).
   Every field listed there MUST be honoured at runtime.

2. **Frontmatter is the source of truth.** When the entry exports
   conflicting values for a field declared in frontmatter, the
   adapter MUST surface a warning naming the field and prefer the
   frontmatter value. Entries are for behaviour, not identity.

3. **`execute[<toolId>]` MUST exist for every `implements[]` entry.**
   Hosts MUST refuse to register providers whose `execute` keys don't
   match the declared `implements` set. Surface as
   `error.code = "execute_binding_mismatch"` with the missing tool id.

4. **Validate inputs against the contract before dispatch.** The host
   reads the resolved TOOL.md's `inputSchema` and validates `args.input`
   BEFORE calling `execute[<toolId>]`. The provider body MUST NOT
   re-validate. When the TOOL declares a `contextSchema`, the host
   ALSO validates `args.context` before dispatch.

5. **Apply mapping + schema_narrowing per call.**
   - `mapping[k]` rewrites the input key. Identity rename (`prompt:
     prompt`), key rename (`style: artistic_style`), or
     `{ from, transform }` for named transformer functions.
   - `schema_narrowing.drop_inputs` makes the resolver refuse calls
     using those inputs (returns `error.code = "input_unsupported"`,
     listing the offending field). Does NOT silently strip them.
   - `schema_narrowing.drop_outputs` removes optional output fields;
     the host returns the narrowed shape to the caller (and the
     contract's optional output is treated as undefined).

6. **Honour `signal`** in `execute`, `login`, `refresh`,
   `parseOutput`, `healthCheck`. Long-running calls (LLM streaming,
   slow CLI invocations, hung browser auth) MUST stop on cancellation.

7. **Drive the auth state machine.**
   - **unknown**: only `version_check` / `health_check` allowed.
   - **unauthed**: `execute` calls return `error.code = "auth_required"`
     with the `login` config in the payload.
   - **logging-in**: `login` is in flight; subsequent calls block or
     queue.
   - **authed**: dispatch normally. Run `refresh.cmd` eagerly when
     elapsed-since-refresh ≥ `refresh.every`.
   - **expired**: detected via `expiry.detect`; transition to
     `unauthed`, surface `auth_required` to caller, optionally
     auto-trigger `login` if interactive context allows.

8. **Persist auth state** per `(provider.id, workspace.id, user.id)`
   tuple across runs. The user MUST NOT re-login at every session.

9. **Apply `cost_override` to the resolver's ranking.** When a
   provider declares `cost_units_per_call` (in millicents), the
   resolver Phase 5 ranks by ascending value. Providers that omit
   `cost_override` use the contract's `cost_class` baseline ranking.

10. **Apply `region` policy.** When `context.regionConstraint` is
    set (workspace policy or call-level pin), the resolver Phase 3
    drops providers whose `region:` array doesn't intersect. The
    intersection MUST be exact-match or `"global"` (the default
    for omitted region declarations).

11. **Apply `policy_tags` filter.** Workspace policy is an allowlist
    or denylist of tags; resolver Phase 3 drops providers violating
    it. Tag matching is exact-string, case-sensitive.

12. **No I/O at module load.** The module containing `defineProvider`
    MUST be safely importable as a side-effect-free unit. All I/O
    happens inside `execute`, `login`, `refresh`, `parseOutput`,
    `healthCheck`.

### Optional behaviour

A host MAY:

- Re-export `defineProvider` under host-idiomatic aliases
  (`createProvider`, `provider`). Subtype-specific aliases like
  `defineCli` SHOULD pre-fill `kind: cli` and forward to the
  canonical `defineProvider`.
- Cache resolver decisions when policy + auth state + health are
  stable. Cache key MUST include `(tool.id@major,
  policy_fingerprint, pinnedProvider, region)`. Invalidate on
  provider register/unregister and any auth state transition.
- Surface a "test provider" affordance to surface adapters
  (catalogue UIs) so users can verify auth + connectivity before
  invoking through the actual workflow.

## Subtype-specific dispatch (kind branching)

### `kind: cli`

CLI subtype's `bin` + per-tool `metadata.cli.argv` template drive
subprocess invocation:

```ts
async function executeCli(handle, toolId, args) {
  const impl = handle.implements.find(i => i.toolId === toolId)
  const argv = expandArgvTemplate(impl.metadata.cli.argv, args.input)
  const result = await spawn(handle.bin, [...handle.bin_args, ...argv], {
    sandbox: handle.sandbox,
    env: buildEnv(handle.sandbox.env, handle.auth.state.env),
    signal: args.signal,
    timeout_ms: handle.timeout_override_ms,
  })
  if (handle.parseOutput) {
    return handle.parseOutput({ exitCode: result.exit, stdout: result.stdout, stderr: result.stderr, expected: { format: handle.output.default_format } })
  }
  return defaultParseCli(result, handle.output)
}
```

Argv expansion supports:
- `${input.X}` — value of input X (shell-escaped).
- `${input.X | default('Y')}` — fallback when X is undefined/null.
- `${input.X | optional('--flag', input.X)}` — append flag+value when set.
- `${input.X | flag('--draft')}` — append flag when X is truthy.

Hosts MUST shell-escape interpolated values; the bundle MUST NOT
use shell features (`&&`, `|`, `;`, `>`).

### `kind: http`

HTTP subtype's `endpoint` + `method` + optional `body_template` and
`headers` drive HTTP requests:

```ts
async function executeHttp(handle, toolId, args) {
  const impl = handle.implements.find(i => i.toolId === toolId)
  const url = handle.base_url + impl.metadata.http.endpoint
  const body = impl.metadata.http.body_template
    ? expandBodyTemplate(impl.metadata.http.body_template, args.input)
    : args.input
  const headers = {
    "Authorization": `Bearer ${args.providerCtx.secrets.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    ...impl.metadata.http.headers,
  }
  const response = await fetch(url, { method: impl.metadata.http.method, headers, body: JSON.stringify(body), signal: args.signal })
  if (response.status === 401) {
    handle.transitionTo('expired')
    throw new ProviderError({ code: "auth_required" })
  }
  return await response.json()
}
```

### `kind: mcp`

MCP subtype connects to a server via stdio/SSE/HTTP and dispatches
through `tools/call`:

```ts
async function executeMcp(handle, toolId, args) {
  const impl = handle.implements.find(i => i.toolId === toolId)
  const mcpToolName = impl.metadata.mcp.tool_name
  const client = await handle.getMcpClient()
  return await client.callTool({
    name: mcpToolName,
    arguments: args.input,
  })
}
```

### `kind: sdk`

SDK subtype loads the package and invokes the named function in-process:

```ts
async function executeSdk(handle, toolId, args) {
  const impl = handle.implements.find(i => i.toolId === toolId)
  const pkg = await import(impl.metadata.sdk.package)
  const fn = pkg[impl.metadata.sdk.function_ref] || pkg.default
  return await fn(args.input, { signal: args.signal, context: args.context })
}
```

### `kind: builtin`

Builtin providers dispatch through the host runtime's native function
registry. No external invocation:

```ts
async function executeBuiltin(handle, toolId, args) {
  const fn = host.builtins.get(toolId)
  if (!fn) throw new ProviderError({ code: "tool_unavailable", message: `No builtin for ${toolId}` })
  return await fn(args.input, { signal: args.signal, context: args.context })
}
```

## Errors

Providers return errors out-of-band relative to the routed tool's
`outputs`. The host wraps results in:

```ts
type ProviderResult<T> =
  | { ok: true;  value: T;  ms: number }
  | { ok: false; error: { code: string; message: string; retryable?: boolean }; ms: number }
```

Standard error codes hosts MUST emit:

| Code | When |
|---|---|
| `auth_required` | Auth state is `unauthed` or `expired` at dispatch time. |
| `auth_failed` | Login flow failed (`login.cmd` exit non-zero, callback rejected). |
| `version_mismatch` | Installed binary version doesn't satisfy `version_check.range`. |
| `install_failed` | All `install` methods exhausted without success. |
| `tool_unavailable` | The TOOL.md ref in `implements[]` couldn't be loaded. |
| `execute_binding_mismatch` | `implements[]` contains a tool id with no corresponding `execute[<toolId>]`. |
| `input_unsupported` | Call uses an input listed in `schema_narrowing.drop_inputs`. |
| `policy_violation` | Resolver dropped this provider but caller pinned it. |
| `region_mismatch` | Resolver dropped this provider for region; caller pinned it. |
| `pinned_provider_unavailable` | `context.pinnedProvider` set but candidate filtered out earlier. |
| `output_parse_failed` | Subtype output couldn't be parsed (CLI exit non-zero with unstructured stderr, HTTP non-JSON response, etc.). |
| `cancelled` | Caller aborted via `signal`. |
| `timeout` | Call exceeded `timeout_override_ms` (or contract ceiling). |
| `internal` | Unhandled host error. |

Tool-specific codes from the dispatched body propagate through under
their own namespace (e.g. `stripe:card_declined`,
`openai:rate_limit_exceeded`).

## Audit log shape

Hosts SHOULD emit two audit entries per call: one at resolver-decision
time, one at dispatch-completion time.

**Resolver decision** (one row per call, even before dispatch):

```json
{
  "type": "provider.resolved",
  "tool_id": "image.create",
  "tool_version": "1.0.0",
  "user_id": "u_abc",
  "workspace_id": "w_xyz",
  "candidates_total": 3,
  "candidates_passed_phase_2_capability": 2,
  "candidates_passed_phase_3_policy": 2,
  "pinned_provider": null,
  "rejected": [
    { "provider_id": "host-sdxl-sdk", "phase": 2, "reason": "health_check_failed_recently" }
  ],
  "selected": { "provider_id": "replicate-flux-http", "kind": "http", "cost_units_per_call": 2.5 },
  "ts": "2026-04-30T14:00:00Z"
}
```

**Dispatch completion** (one row per call):

```json
{
  "type": "provider.invoked",
  "provider_id": "replicate-flux-http",
  "provider_version": "1.0.0",
  "tool_id": "image.create",
  "user_id": "u_abc",
  "workspace_id": "w_xyz",
  "input_keys": ["prompt", "aspect"],
  "duration_ms": 6420,
  "ok": true,
  "cost_units_charged": 2.5,
  "auth_state": "authed",
  "ts": "2026-04-30T14:00:06Z"
}
```

`input_keys` lists keys, not values (PII safety). The two-row format
lets operators audit "why was this provider picked" separately from
"what was the call result".

## Reference implementation

The canonical TypeScript implementation lives at
[`packages/provider-runtime`](https://github.com/agentik/agentik-studio/tree/dev/packages/provider-runtime).
It exposes:

- `defineProvider(definition: ProviderDefinition): ProviderHandle`
- `loadProvider(path: string): Promise<ProviderHandle>`
- `installProvider(handle): Promise<InstallResult>`
- `verifyProvider(handle): Promise<VerifyResult>`
- `loginProvider(handle, context): Promise<LoginResult>`
- `runTool(toolHandle, { input, context, signal }): Promise<ProviderResult>`
- `resolveProvider(toolHandle, context): Promise<ResolvedProvider>`

Subtype-specific runtimes (`packages/cli-runtime`,
`packages/http-runtime`, `packages/mcp-runtime`,
`packages/sdk-runtime`) wrap `provider-runtime` with the subtype's
dispatch logic. Hosts in other languages should mirror this surface
(the contract is the manifest + `defineProvider` shape, not the
package).

## Migration notes

### From AIP-14 v1 (TOOL with embedded runner)

The pre-refactor TOOL.md carried `code`/`run`/`runner`/`secrets`/
`network` directly. Migration:

1. Author a `PROVIDER.md` for the tool's existing implementation.
   Move `code`/`run` → `provider.code` (per AIP-26 reference) and
   `provider.run`. Move `runner` → `provider.runner`. Move `secrets`
   → `provider.auth.ref` (point at a sibling SECRETS.md). Move
   `network` → `provider.network`.
2. Set `provider.implements[0].tool` to the (now-amputated) TOOL.md.
3. Move the `entry`'s `execute()` body → `provider.execute[toolId]`.
4. Validate the new pair against the v2 schemas; the host's
   `tool-runtime` and `provider-runtime` packages.

### From hand-rolled wrappers (Mastra MCP servers, LangChain ShellTool)

1. Author a `PROVIDER.md` per wrapper. Map the wrapper's bootstrap
   (install, version-check, auth) into PROVIDER frontmatter blocks.
2. Convert each wrapped operation into a TOOL.md sibling (per
   AIP-14). Reference each TOOL from `provider.implements[]`.
3. Move auth + sandbox + output-parsing logic into a `defineProvider`
   entry with `kind: cli` (or appropriate subtype).
4. Decommission the wrapper after the provider covers the same
   surface.

The wrapper stays functional during migration; PROVIDER.md is
additive.
