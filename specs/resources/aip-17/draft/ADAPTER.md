# ADAPTER.md — implementer's guide for AIP-17 (runner block)

This guide walks an implementer through wiring the AIP-17 `runner` block
(engine, image, needs, limits) and the `defineRunner` standard signature into a
manifest host. The AIP is the contract; this doc is the projection.

The block is consumed by every manifest format whose body executes code —
TOOL.md ([AIP-14](/docs/aip-14)), WORKFLOW.md ([AIP-15](/docs/aip-15)),
forthcoming runnables. A host that already sandboxes one of those manifests has
90% of the runner machinery in place; this guide names the contract so the
remaining 10% lines up with the spec.

The 2026-04-30 revision narrowed `runner` to four fields. Permissions
(env/secrets/network) and IO (files) moved to their own blocks. See the
[Migration from legacy `runtime`](#migration-from-legacy-runtime) section if
you're updating an existing host.

## Contract overview

A conforming host MUST:

1. Accept the `runner` block on any manifest type that imports it.
2. Apply the downgrade rule for untrusted sources (workspace, ai-draft)
   requesting `engine: "in-process"`.
3. Resolve `image` — either honor the explicit value or auto-pick from the
   registry based on `needs`.
4. Cold-start `needs.native` / `needs.npm` / `needs.pip` when the engine is
   `sandbox`.
5. Enforce `limits` when the underlying isolation primitive supports them; warn
   at registration when caps are unenforceable.

## `defineRunner` — required behaviour

```ts
defineRunner(definition: RunnerDefinition): RunnerHandle
```

The function is a **schema canonicaliser + image resolver + downgrade applier**.

```ts
function defineRunner(def, registry) {
  const engine = def.engine ?? "subprocess"
  const needs = {
    language: def.needs?.language ?? inferLanguageFromContext(),
    native: def.needs?.native ?? [],
    npm: def.needs?.npm ?? [],
    pip: def.needs?.pip ?? [],
  }
  const limits = {
    memory_mb: def.limits?.memory_mb ?? HOST_DEFAULT_MEMORY_MB,
    timeout_ms: def.limits?.timeout_ms ?? HOST_DEFAULT_TIMEOUT_MS,
    cpu_ms: def.limits?.cpu_ms ?? HOST_DEFAULT_CPU_MS,
  }
  const image =
    engine === "sandbox"
      ? (def.image ??
        registry.autopick({ language: needs.language, native: needs.native }))
      : null

  return {
    engine,
    image,
    needs,
    limits,
    resolveForOrigin(origin) {
      const downgrade = engine === "in-process" && UNTRUSTED_ORIGINS.has(origin)
      return downgrade
        ? { engine: "subprocess", image: null, needs, limits, downgraded: true }
        : { engine, image, needs, limits, downgraded: false }
    },
  }
}

const UNTRUSTED_ORIGINS = new Set(["workspace", "ai-draft", undefined])
```

## Engine — host responsibilities

### `engine: "subprocess"`

Spawn a host-local Node child with `--permission` flags. The child shares the
host kernel; isolation is enforced via the Node permission model.

```bash
node \
  --permission \
  --allow-fs-read=<bundle-root> \
  --allow-fs-write=<scratch-root> \
  <bundle-root>/<run-target>
```

Use cases: pure-TS tools, fast cold-start (~50ms), no need for native deps.

### `engine: "sandbox"`

Provision a real container via the host's `SandboxProviderAdapter` (E2B, Modal,
Fly Machines, Cloudflare Containers). The body runs inside the container; the
host pipes stdio over a streamable-http bridge.

Pipeline:

1. Resolve `image` (explicit or auto-picked).
2. `provider.create(imageId, env, timeoutMs)` — provision the container.
3. Upload the bundle tarball (per [AIP-26](/docs/aip-26)).
4. If `needs.native`: `apt-get install <packages>` (Debian-based templates) at
   startup.
5. If bundle has `package.json`: `npm ci --omit=dev` from lockfile, then
   `npm install <needs.npm>` for additional packages.
6. If `needs.pip`: `pip install --user <packages>`.
7. `exec` the resolved `run` command (per AIP-26).

Use cases: tools that need `child_process`, native deps, free `/tmp`, full Linux
runtime.

### `engine: "in-process"`

Dynamic-import the bundle directly into the host's process. Reserved for trusted
code (vendor packages, signed registry entries, host's own source tree).

For any manifest whose `source.origin` is `"workspace"` or `"ai-draft"` (or
absent — treat as untrusted), the host MUST silently downgrade to `"subprocess"`
and emit a log warning:

```
[runner] downgrading <manifestId> from engine=in-process →
  subprocess (origin=<origin> cannot self-elevate)
```

The downgrade is part of `defineRunner(...).resolveForOrigin(origin)` — adapters
call it with the manifest's source origin and consume the resolved handle.

## Image resolution

The host maintains an open registry of sandbox templates. Each entry declares:

```ts
interface SandboxTemplate {
  id: string // "mcp-node-server"
  language: ("node" | "python" | "multi")[]
  baked: { native: string[] } // packages pre-installed in the image
  capabilities: string[] // "stdio", "browser", "display", ...
  cost_tier: "light" | "standard" | "heavy"
  cold_start_ms: number
}
```

Auto-pick algorithm (deterministic):

```ts
function autopick(needs) {
  const candidates = registry.filter(
    t =>
      t.language.includes(needs.language) &&
      needs.native.every(n => t.baked.native.includes(n))
  )
  if (!candidates.length) {
    // Fallback: lightest template matching the language; native deps
    // installed at cold-start instead of being baked.
    return registry
      .filter(t => t.language.includes(needs.language))
      .sort(byCostTier)[0]
  }
  return candidates.sort(byCostTier)[0]
}
```

The registry doc lists candidate templates; for the Guilde reference impl see
`packages/mcp/core/src/sandbox/registry.ts`.

## Needs handling

### `needs.native` (apt-style packages)

For `engine: "sandbox"` only. The startup script
`apt-get install --no-install-recommends <pkgs>` if any package is missing from
the image. Hosts on non-Debian images MAY map names if reliable (e.g. `apk` for
Alpine), otherwise refuse with a clear error.

The trust UI MUST surface the resolved native list; an author who adds
`native: [some-package]` is requesting OS-level privilege, and that change
SHOULD trigger re-review.

### `needs.npm`

For `engine: "sandbox"`: install AFTER `npm ci` from the bundle's lockfile.
Format: `<name>@<semver>`. Multiple entries:

```bash
npm install <pkg1> <pkg2> --omit=dev --silent
```

For `engine: "subprocess"`: ignored. The bundle's own `package.json` / lockfile
drive deps.

### `needs.pip`

For `engine: "sandbox"`: `pip install --user <pkgs>`. Format `<name>==<version>`
recommended.

### `needs.language`

Hosts MAY refuse manifests where `needs.language` doesn't match the inferred
extension of `run` (per AIP-26). E.g. `needs.language: node` + `run: tool.py` is
rejected at registration.

## Limits enforcement

| Cap          | subprocess                         | sandbox                            | in-process        |
| ------------ | ---------------------------------- | ---------------------------------- | ----------------- |
| `memory_mb`  | `--max-old-space-size` (heap only) | container `--memory`               | host-wide cap     |
| `timeout_ms` | `setTimeout` + `child.kill()`      | container TTL                      | host-wide cap     |
| `cpu_ms`     | none (unenforced)                  | cgroups CPU quota (when supported) | none (unenforced) |

Hosts that can't enforce a cap SHOULD log a warning at registration; manifests
that need hard caps SHOULD route to a host that honours them.

## Migration from legacy `runtime`

Hosts MUST accept the legacy `runtime` block during the deprecation window and
preprocess it to the new layout:

```ts
function migrateLegacyRuntime(legacy) {
  return {
    runner: {
      engine: legacy.mode === "in-process" ? "in-process" : "subprocess",
      // (legacy "sandbox" was actually subprocess-isolated, not a real
      // container — the new "sandbox" enum value is reserved for E2B-
      // class engines)
      limits: {
        memory_mb: legacy.resources?.memoryMb,
        timeout_ms: legacy.resources?.timeoutMs,
      },
    },
    secrets: Object.fromEntries(
      (legacy.env ?? []).map(name => [
        name,
        { vault: name.toLowerCase().replace(/_/g, "-") },
      ])
    ),
    network: legacy.network?.egress?.length
      ? { egress: legacy.network.egress }
      : undefined,
    // legacy.fs.read / .write require explicit migration to AIP-16
    // inputsFiles / outputsFiles — they have run-scoped semantics and
    // cannot be auto-mapped without per-key intent.
  }
}
```

Hosts SHOULD warn (not error) on legacy shape during the deprecation window,
then remove the preprocessor in a future revision.

## Registration test

A conforming host SHOULD provide a `validateRunner(manifestPath)` helper that:

1. Parses the manifest's runner block.
2. Validates against `RUNNER.schema.json`.
3. Confirms `image` (if explicit) is in the host registry.
4. Confirms the host can enforce all declared `limits`.
5. Confirms `needs.language` matches the inferred runner of `run:`.
6. Reports the first failure with file + field path.

## Multi-language hosts

| Language                | Function name             | Sandbox primitive                   |
| ----------------------- | ------------------------- | ----------------------------------- |
| TypeScript / JavaScript | `defineRunner`            | Node `--permission`, E2B, container |
| Python                  | `define_runner`           | seccomp, container, E2B             |
| Go                      | `DefineRunner`            | seccomp, container                  |
| Rust                    | `define_runner` (free fn) | seccomp, container, microVM         |

The block semantics are language-agnostic; only the enforcement primitive
varies.

## What this guide does NOT cover

- The host's credential store / vault implementation — see
  [AIP-19](/docs/aip-19).
- Network egress enforcement — see top-level `network` block.
- File mounts / staging — see [AIP-16](/docs/aip-16).
- Bundle materialization — see [AIP-26](/docs/aip-26).
- Cross-tenant resource accounting / fairness.

## See also

- [AIP-17 — runner block spec](/docs/aip-17)
- [AIP-14 — TOOL.md](/docs/aip-14)
- [AIP-15 — WORKFLOW.md](/docs/aip-15)
- [AIP-16 — IO.md](/docs/aip-16) — sibling block (data flow)
- [AIP-19 — SECRETS.md](/docs/aip-19) — sibling block (env binding)
- [AIP-26 — CODE.md](/docs/aip-26) — sibling block (bundle composition)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./RUNNER.schema.json`](./RUNNER.schema.json) — schema validator
