---
schema: skills/v1
name: use-code-block
title: Wire AIP-26 CODE blocks into a new manifest format
description:
  Walk an adapter implementer through importing the `code` and `run` blocks and
  the `defineCode` standard signature into a new manifest format that needs
  explicit bundle identity and entry-point declaration.
version: 1.0.0
tags: [aip-26, code, schema, adapter, agentproto]
inputs:
  - name: targetManifest
    type: string
    required: true
    description:
      The new manifest format being authored (e.g. "TOOL.md", "WORKFLOW.md",
      "AGENT.md"). The skill produces the CODE `$ref` plumbing for THAT
      manifest's schema.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the `defineCode` host implementation. Default "ts".
      Accepts "ts", "py", "go", "rs".
  - name: existingSchemaPath
    type: string
    required: false
    description:
      Absolute path to the new manifest's `*.schema.json`. If omitted, the skill
      produces the field rows + `$ref` snippets you paste in.
examples:
  - name: import-into-tool-md
    description: Import code+run blocks into TOOL.md (AIP-14 v2)
    inputs:
      targetManifest: TOOL.md
      hostLanguage: ts
---

# Use AIP-26 CODE blocks

Use this skill when you are extending an existing manifest format (or authoring
a new one) to declare what code composes the runnable bundle and how to invoke
it.

## Steps

### 1. Import the schema definitions

In your manifest's JSON Schema, add a `$ref` to AIP-26's CODE.schema.json:

```json
{
  "properties": {
    "code": {
      "$ref": "https://agentproto.dev/schemas/aip-26/CODE.schema.json#/$defs/code"
    },
    "run": {
      "$ref": "https://agentproto.dev/schemas/aip-26/CODE.schema.json#/$defs/run"
    }
  }
}
```

If your manifest is a `kind: code-workspace` itself, also add:

```json
{
  "$ref": "https://agentproto.dev/schemas/aip-26/CODE.schema.json#/$defs/codeWorkspaceManifest"
}
```

### 2. Wire the host-side resolver

For each new manifest format, the host MUST implement `defineCode` (or call into
a shared implementation). Pseudo-code:

```ts
import { defineCode } from "@agentproto/aip-26"

async function materializeBundle(manifest: ToolManifest): Promise<Buffer> {
  return defineCode({
    code: manifest.code,
    workspaceRoot: getWorkspaceRoot(manifest.guildId),
    github: githubConnector(manifest.guildId),
    fs: workspaceFilesystem(manifest.guildId),
  })
}
```

The host calls `materializeBundle` at scan time (to validate sources resolve)
and at invocation time (to ship the tarball to the runner).

### 3. Resolve `run` to a process command

At runner startup, the host translates `run:` into an exec command:

```ts
function resolveRun(
  run: ToolManifest["run"],
  bundleRoot: string
): { cmd: string; args: string[] } {
  if (typeof run === "string") {
    if (looksLikeShell(run)) return { cmd: "bash", args: ["-c", run] }
    if (looksLikePath(run)) {
      const ext = path.extname(run)
      switch (ext) {
        case ".ts":
        case ".tsx":
        case ".mts":
          return {
            cmd: "npx",
            args: ["--yes", "tsx", path.join(bundleRoot, run)],
          }
        case ".js":
        case ".mjs":
        case ".cjs":
          return { cmd: "node", args: [path.join(bundleRoot, run)] }
        case ".py":
          return { cmd: "python", args: [path.join(bundleRoot, run)] }
        case ".sh":
          return { cmd: "bash", args: [path.join(bundleRoot, run)] }
        default:
          throw new Error(`Unknown extension: ${ext}`)
      }
    }
  }
  if (Array.isArray(run)) return { cmd: run[0], args: run.slice(1) }
  if (run && typeof run === "object") {
    if ("file" in run) return resolveRun(run.file, bundleRoot)
    if ("exec" in run) return { cmd: run.exec[0], args: run.exec.slice(1) }
    if ("shell" in run) return { cmd: "bash", args: ["-c", run.shell] }
  }
  throw new Error("Invalid run shape")
}
```

### 4. Honor the cache invalidation contract

For every `github:` source, resolve the SHA at fetch time and record it in the
connector metadata. The cache key is `(repo, resolvedSha, path)`. SHA-pinned
refs cache forever; tags cache 24h; branches refetch per scan.

### 5. Validate before provisioning

The host MUST validate the bundle materializes successfully BEFORE provisioning
a runner sandbox. Surface materialization errors to the trust UI with per-source
attribution.

## Conformance

A manifest format that imports CODE blocks MUST:

1. Reference `code` and `run` via `$ref` (not redefine them).
2. Forward the resolved bundle to a runner conforming to AIP-17.
3. Surface materialization errors at scan/registration time.
4. Honor cache invalidation per the SHA/tag/branch matrix.
5. Reject manifests where `code` or `run` violate path-traversal rules.
