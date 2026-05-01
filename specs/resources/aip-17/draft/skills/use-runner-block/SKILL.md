---
schema: skills/v1
name: use-runner-block
title: Wire the AIP-17 runner block into a new manifest format
description:
  Walk an adapter implementer through importing the `runner` block (engine,
  image, needs, limits) and the `defineRunner` standard signature into a new AIP
  manifest format.
version: 1.0.0
tags: [aip-17, runner, sandbox, schema, adapter, agentproto]
inputs:
  - name: targetManifest
    type: string
    required: true
    description:
      The new manifest format being authored (e.g. "PROCEDURE.md", "AGENT.md").
      The skill produces the `runner` $ref plumbing for that manifest's schema.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the `defineRunner` host implementation. Default "ts".
      Accepts "ts", "py", "go", "rs".
  - name: existingSchemaPath
    type: string
    required: false
    description:
      Absolute path to the new manifest's `*.schema.json`. If omitted, the skill
      produces the field row + `$ref` snippet you paste in.
examples:
  - input:
      targetManifest: AGENT.md
    output:
      - resources/<aip>/draft/AGENT.schema.json (with $ref into
        RUNNER.schema.json)
      - <aip>.mdx field-table row for runner
---

# Wire the AIP-17 runner block into a new manifest format

Use this skill when you're authoring a NEW manifest format AIP and its bodies
execute code that needs a defined process boundary. The `runner` block — engine,
image, needs, limits — is defined once in [AIP-17](/docs/aip-17) and reused
across every manifest type that runs code.

This skill is for **AIP authors and host implementers**, not end users —
`RUNNER.md` is not a file users author. It's a schema block.

The 2026-04-30 revision narrowed `runner` to the process boundary only.
Permissions (env/secrets) live in the [AIP-19](/docs/aip-19) `secrets:` block;
network egress is its own top-level `network:` block; file mounts are per-run
staging via [AIP-16](/docs/aip-16). If your manifest needs any of those, import
each independently.

## When to use

- "I'm drafting a new AIP for declaring agent skills that run code."
- "My new manifest type needs the same engine selection rules as TOOL.md /
  WORKFLOW.md."
- "I'm adding a third manifest format to my host and want the process-boundary
  model to match."

## When NOT to use

- The user wants to author a TOOL.md or WORKFLOW.md → those AIPs already import
  the runner block; use their authoring skills.
- The user wants to declare what code composes the bundle → use
  [AIP-26 CODE.md](/docs/aip-26) instead.
- The user wants to declare what env vars / secrets the body sees → use
  [AIP-19](/docs/aip-19).

## Steps

### 1. Reference the schema

In your manifest's JSON Schema, add a `$ref` to AIP-17's RUNNER.schema.json:

```json
{
  "properties": {
    "runner": {
      "$ref": "https://agentproto.dev/schemas/aip-17/RUNNER.schema.json#/$defs/runner"
    }
  }
}
```

### 2. Wire the host-side resolver

For each new manifest format, the host calls `defineRunner` to canonicalise the
block and apply the downgrade rule:

```ts
import { defineRunner } from "@agentproto/aip-17"

async function provisionRunner(manifest: ToolManifest, registry) {
  const handle = defineRunner(manifest.runner ?? {}, registry)
  const resolved = handle.resolveForOrigin(manifest.source.origin)
  if (resolved.downgraded) {
    log.warn(`runner downgraded to subprocess for ${manifest.name}`)
  }
  return resolved
}
```

### 3. Pick the engine implementation

Based on `resolved.engine`:

| Engine       | Implementation                                                     |
| ------------ | ------------------------------------------------------------------ |
| `subprocess` | `child_process.spawn("node", ["--permission", ...flags, bundle])`  |
| `sandbox`    | `driver.create(resolved.image, env, resolved.limits.timeout_ms)` |
| `in-process` | `await import(bundle)`                                             |

### 4. Honour `needs` at cold-start (sandbox engine only)

```bash
# pseudo-startup script
apt-get install --no-install-recommends ${needs.native[@]}
cd /workspace
[ -f package.json ] && npm ci --omit=dev --silent
[ -n "${needs.npm[*]}" ] && npm install ${needs.npm[@]} --omit=dev --silent
[ -n "${needs.pip[*]}" ] && pip install --user ${needs.pip[@]}
exec <run-command>
```

### 5. Enforce limits

Map `limits.{memory_mb,timeout_ms,cpu_ms}` to your isolation primitive. Log
warnings at registration when caps can't be enforced.

## Conformance

A manifest format that imports the runner block MUST:

1. Reference `runner` via `$ref` (not redefine it).
2. Call `defineRunner(...)` and `resolveForOrigin(origin)` before provisioning.
3. Surface the resolved `image` (auto-picked or explicit) in logs/audit.
4. NOT mention env, secrets, network egress, or file mounts inside `runner:` —
   those are separate blocks.
5. Apply the `in-process → subprocess` downgrade for untrusted origins.
