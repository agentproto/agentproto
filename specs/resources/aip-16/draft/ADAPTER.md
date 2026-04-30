# ADAPTER.md — implementer's guide for AIP-16 (IO blocks)

This guide walks an implementer through wiring the four AIP-16 IO blocks
(`inputs`, `outputs`, `inputsFiles`, `outputsFiles`) and the `defineIO` standard
signature into a manifest host. The AIP itself is the contract; this doc is the
projection.

The blocks are consumed by every manifest format that declares runnable units —
TOOL.md ([AIP-14](/docs/aip-14)), WORKFLOW.md ([AIP-15](/docs/aip-15)), and
forthcoming formats. A host that already implements one of those manifests has
90% of the IO machinery in place; this guide names the contract so the remaining
10% lines up with the spec.

## Contract overview

A conforming host MUST:

1. Accept all four IO blocks on any manifest type that imports IO.
2. Validate `inputs` against the structured input value before the body runs.
3. Stage `inputsFiles` from the workspace into a per-run scratch root before the
   body runs (when non-empty).
4. Inject `_workflowFsRoot` into the structured input before the body's input
   validation when either `inputsFiles` or `outputsFiles` is non-empty.
5. Sync `outputsFiles` from the scratch root to the workspace after the body
   completes (success or failure).
6. Clean up the scratch root best-effort.

The host MUST surface every staged read and every synced write to the standard
audit log ([AIP-7](/docs/aip-7)) without inspecting body code.

## `defineIO` — required behaviour

```ts
defineIO(definition: IODefinition): IOHandle
```

The function is a **schema canonicaliser**. Given the importing manifest's IO
declarations, it returns an `IOHandle` that:

1. Coerces `inputs` / `outputs` to JSON Schema. Implementations MAY accept zod /
   pydantic / schemars / Go struct tags / etc. and convert internally; the
   canonical surface is JSON Schema.
2. Defaults missing `inputsFiles` / `outputsFiles` to `{}`.
3. Augments `inputs.properties` with the `_workflowFsRoot` reserved field when
   either file map is non-empty. The augmentation MUST leave any existing
   `_workflowFsRoot` declaration in the user's `inputs` schema in place —
   `defineIO` only ADDS, never replaces.
4. Returns `validateInput(value)` that runs JSON Schema validation against the
   augmented `inputs` schema and returns a tagged result. Errors include the
   JSON Pointer path of the failing field.

### Pseudo-code

```ts
function defineIO(def) {
  const inputs = canonicaliseSchema(
    def.inputs ?? { type: "object", properties: {} }
  )
  const outputs = canonicaliseSchema(
    def.outputs ?? { type: "object", properties: {} }
  )
  const inputsFiles = def.inputsFiles ?? {}
  const outputsFiles = def.outputsFiles ?? {}
  const hasFiles =
    Object.keys(inputsFiles).length > 0 || Object.keys(outputsFiles).length > 0

  const inputsAugmented = hasFiles
    ? withProperty(
        inputs,
        "_workflowFsRoot",
        { type: "string" },
        /* required */ false
      )
    : inputs

  return {
    inputs: inputsAugmented,
    outputs,
    inputsFiles,
    outputsFiles,
    validateInput: value => validateAgainstJsonSchema(inputsAugmented, value),
  }
}
```

### Optional behaviour

- Output validation: hosts MAY validate the body's return value against
  `outputs` after the body runs. Implementations vary — some hosts log on
  mismatch, some throw. Either is acceptable; silent coercion is not.
- Schema dialect translation: hosts MAY convert zod / pydantic inputs to JSON
  Schema upfront and cache the result on the manifest. The canonical schema
  dialect is JSON Schema Draft 2020-12.

## File contract — host responsibilities

When the importing manifest's IO declares non-empty `inputsFiles` or
`outputsFiles`, the host runs the following lifecycle around every run:

### 1. Per-run scratch root

Create a fresh, unique directory keyed by the run's identifier. The reference
implementation uses `<os.tmpdir()>/<host-prefix>/<runId>` and resolves it
through `realpath` so platform-specific symlinks (`/var` → `/private/var` on
macOS) don't trip downstream consumers.

### 2. Stage inputs

For each `(key, entry)` in `inputsFiles`:

- Read the workspace at `entry.path`. Workspace-relative; the host's workspace
  provider resolves it.
- Write the bytes to `<fsRoot>/<key>` (key is the filename — no subdirectories
  from the contract itself; bodies MAY create subdirectories underneath).
- On read failure, throw before the body starts. Audit-log the failure; no run
  kicks off.

The implementation SHOULD support both binary and text file reads; hosts whose
workspace provider returns strings should encode via UTF-8 before writing to
disk.

### 3. Inject `_workflowFsRoot`

Before the body's input validation runs, the host adds:

```ts
augmentedInput = { ...userInput, _workflowFsRoot: fsRoot }
```

The `defineIO`-augmented `inputs` schema accepts this field, so validation
passes. Hosts MUST NOT honour a `_workflowFsRoot` value the caller pre-supplied
— the host overwrites it.

### 4. Run the body

Standard manifest-specific body invocation. The body reads / writes at
`<fsRoot>/<key>` for declared files; it MAY scratch undeclared files inside
`<fsRoot>/` that get dropped at cleanup.

### 5. Sync outputs

For each `(key, entry)` in `outputsFiles`, after the body completes (success OR
failure):

- If `<fsRoot>/<key>` exists: read the bytes, write to the workspace at
  `entry.path`, applying token interpolation (`<runId>`, `<workflowId>` /
  `<toolId>`, `<isoDate>`).
- If missing: log a warning, continue. The body's structured `outputs` is the
  source of truth for what's mandatory; `outputsFiles` is "nice to have" by
  default.

Sync failures (workspace write rejected, disk full) MUST be logged but MUST NOT
fail the run — by sync time, the body has returned its result. Manifests that
need transactional writes SHOULD model the write as a tool step, not a declared
output.

### 6. Cleanup

Remove the scratch root best-effort. Failures (e.g. `ENOTEMPTY` because a body
produced an undeclared file the OS hasn't released yet) MUST be logged but MUST
NOT fail the run. The OS reaps the directory eventually.

## Path interpolation

`outputsFiles.<key>.path` accepts a fixed token set, replaced by the host at
sync time:

| Token                       | Replaced with                       |
| --------------------------- | ----------------------------------- |
| `<runId>`                   | The current run's identifier.       |
| `<workflowId>` / `<toolId>` | The importing manifest's `id`.      |
| `<isoDate>`                 | Today's date in `YYYY-MM-DD` (UTC). |

Hosts MAY support additional tokens; portable manifests SHOULD stay within the
listed set. Replacement is one-pass — tokens inside replaced values are NOT
re-expanded.

`inputsFiles.<key>.path` MAY also use these tokens for runs that read from
per-run-named files (rare).

## Concurrency

Each run owns its scratch root keyed by the importing manifest's run identifier.
Concurrent runs of the same unit MUST NOT see each other's files through the
contract. Bodies that need cross-run state MUST use a tool, not file state.

## Multi-language hosts

| Language                | Function name         | Schema dialect          |
| ----------------------- | --------------------- | ----------------------- |
| TypeScript / JavaScript | `defineIO`            | JSON Schema or zod      |
| Python                  | `define_io`           | JSON Schema or pydantic |
| Go                      | `DefineIO`            | struct tags             |
| Rust                    | `define_io` (free fn) | JSON Schema or schemars |

The file contract lifecycle is language-agnostic; only the
schema-canonicalisation step varies by host.

## Registration test

A conforming host SHOULD provide a `validateIO(manifestPath)` helper that:

1. Parses the manifest's IO declaration.
2. Validates each block against `IO.schema.json`.
3. Confirms `inputsFiles.<key>.path` workspace targets exist (host MAY skip in
   dry-run mode).
4. Cross-checks `_workflowFsRoot` is allowed by `inputs` if either file map is
   non-empty (`defineIO` augments automatically; manifests that pre-declare
   `_workflowFsRoot` with a non-string type MUST be rejected).
5. Statically verifies that path interpolation tokens are in the allowed set.
6. Reports the first failure with file + field path.

## What this guide does NOT cover

- The host's workspace provider implementation (file-backed vs S3-backed vs
  database-backed).
- The host's runtime isolation (env stripping, fs scoping, network egress) —
  that's a separate AIP. IO is pure data-shape.
- The body's error envelope shape — that's the importing manifest's
  responsibility.
- Streaming I/O — out of scope; see AIP-16 open questions.

## See also

- [AIP-16 — IO blocks spec](/docs/aip-16)
- [AIP-14 — TOOL.md](/docs/aip-14)
- [AIP-15 — WORKFLOW.md](/docs/aip-15)
- [`./IO.schema.json`](./IO.schema.json) — schema validator
