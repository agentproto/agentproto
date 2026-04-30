# ADAPTER.md — implementing AIP-33 in a host runtime

Implementer's guide for `kind: sdk` providers. Inherits all
[AIP-30 ADAPTER](../../../aip-30/draft/ADAPTER.md) responsibilities;
this doc covers SDK-specific dispatch.

## Module loading

Per `import_style`:

| `import_style` | Load mechanism | Function ref resolution |
|---|---|---|
| `esm`        | `await import(package)` | Walk dot-notation on the imported namespace; `default` → `pkg.default ?? pkg` |
| `cjs`        | `require(package)` | Same as ESM |
| `python`     | `importlib.import_module(package)` | Walk attribute access; ref `Client.X.Y` instantiates `Client(...)` per resolved-secret args |
| `rust-crate` | `dlopen` of compiled crate; entry resolved via FFI symbol table | Symbol name = function_ref |
| `go-module`  | `plugin.Open` (when host runs in-process Go); function as exported symbol | Symbol name = function_ref |

The host's SDK runtime resolves function refs at registration time
(`loadProvider`), not at first call. Refs that don't resolve fail
the provider with `error.code = "function_ref_unresolvable"`.

For class-based refs (`Client.images.create`):

1. Resolve `Client` from the package namespace.
2. Instantiate `Client(...)` with constructor args derived from
   `auth.state.env` resolved secrets + optional `client_options`.
3. Walk dot notation on the instance (`.images.create`).
4. Cache the instance per `(provider.id, workspace.id, user.id)` for
   reuse across calls.

## Args templating

`args_template` produces the function's arguments. Two cases:

### Object-arg

When `args_template` is an object, the function receives that object
as its first (and only) argument. `${input.X}` substitutions apply to
leaves.

```yaml
args_template:
  model: "dall-e-3"
  prompt: "${input.prompt}"
  size: "${input.size | default('1024x1024')}"
```

### Positional-arg

When the function takes positional args, declare via `_N` keys:

```yaml
args_template:
  _0: "${input.prompt}"        # first positional
  _1: { model: "...", temp: 0.7 }  # second positional, an object
```

Maximum 5 positional args (`_0` through `_4`); the SDK runtime
populates them in order. SDKs needing >5 positional args should be
wrapped in a custom entry's `buildArgs()`.

When `args_template` is omitted entirely, the runtime calls
`fn(args.input)` (object-arg). Unknown shape: introspect the function
signature in TS/JS via `Function.length`; ambiguous → error at
registration.

## Streaming

When `streaming.mode: "async-iterator"`:

```ts
async function* dispatchSdkStream(handle, toolId, args) {
  const fn = handle.resolveFn(toolId)
  const fnArgs = applyArgsTemplate(handle.implements[toolId].args_template, args.input)
  const iter = fn(fnArgs)
  if (!iter[Symbol.asyncIterator]) throw new Error("not_async_iterator")
  for await (const chunk of iter) {
    if (args.signal.aborted) return
    yield extractResponse(chunk, handle.implements[toolId].result_extract ?? "$")
  }
}
```

Hosts MUST cancel iteration on signal abort to free resources.

When `streaming.mode: "callback"`, the runtime adapts callback-style
streaming via the entry's custom `buildArgs()` providing a
runtime-supplied callback that the entry pipes back through an
async generator.

## Sandbox limitations

SDK providers run in the host's process. Strong process-level
isolation isn't available. Hosts MAY enforce capability sandboxing:

- **Node.js**: `vm.createContext()` with `child_process` denied,
  `fs` proxied to deny writes outside `network.egress`.
- **Python**: import-time hooks denying `subprocess`, `os.system`,
  network beyond declared egress.
- **Rust/Go**: more limited; rely on policy_tags + auditing.

The `network.egress` field is enforced by host network policy
(iptables, proxy) — same enforcement as HTTP / MCP providers.

## Audit

SDK-specific audit fields:

```json
{
  "type": "provider.invoked",
  "kind": "sdk",
  "package": "openai",
  "package_version": "4.55.0",
  "function_ref": "Client.images.generate",
  "duration_ms": 4200,
  "memory_delta_mb": 12,
  "ok": true
}
```

`memory_delta_mb` is best-effort — process-wide memory delta during
the call. SDK providers MAY mask memory leaks; periodic full-process
audits catch this.

## Reference implementation

`packages/sdk-runtime` exposes:

- `defineSdkProvider(...)` (sugar for `defineProvider({ kind: "sdk", ... })`)
- `loadSdkPackage(handle)` — module load + function ref resolution at registration
- `dispatchSdk(handle, toolId, args)` — unary
- `dispatchSdkStream(handle, toolId, args)` — async iterator
- `applyArgsTemplate(template, input, context, secrets)` — substitution
- `extractResponse(value, jsonPath)` — JSONPath-lite

The runtime composes with `provider-runtime` for the resolver and
`tool-runtime` for contract validation.
