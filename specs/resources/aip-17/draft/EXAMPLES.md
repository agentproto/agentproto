# EXAMPLES.md — runner block reference patterns

Reference snippets showing how the AIP-17 `runner` block appears inside concrete
manifests. AIP-17 is a schema-block AIP — there's no `RUNNER.md` file users
author. The block lives inside other manifests ([TOOL.md](/docs/aip-14),
[WORKFLOW.md](/docs/aip-15), forthcoming runnable formats) via JSON Schema
`$ref`.

Each example focuses on the **runner** block alone. Permissions (`secrets`,
`network`) and IO (`inputs`, `outputs`) live in their own blocks per
[AIP-19](/docs/aip-19), top-level `network`, and [AIP-16](/docs/aip-16) — they
are intentionally absent below.

## Patterns covered

1. [Subprocess (default) — pure compute](#1-subprocess-default--pure-compute)
2. [Sandbox with auto-picked image](#2-sandbox-with-auto-picked-image)
3. [Sandbox with explicit image](#3-sandbox-with-explicit-image)
4. [Sandbox with native deps + extra npm](#4-sandbox-with-native-deps--extra-npm)
5. [Heavy compute with raised limits](#5-heavy-compute-with-raised-limits)
6. [In-process (vendor-only)](#6-in-process-vendor-only)
7. [Inherited runner from a code-workspace](#7-inherited-runner-from-a-code-workspace)
8. [Reusing the runner block across AIPs (TOOL / WORKFLOW)](#8-reusing-the-runner-block-across-aips-tool--workflow)

---

## 1. Subprocess (default) — pure compute

The lightest engine. Host-local Node `--permission` child. No container, no
native deps, no `child_process`. Suitable for pure-TS tools that compute from
inputs to outputs.

```yaml
runner:
  engine: subprocess
  limits:
    memory_mb: 256
    timeout_ms: 5000
```

Or, omitted entirely — `subprocess` is the default:

```yaml
# (no runner block — equivalent to engine: subprocess + host default limits)
```

**When to use.** String manipulation, JSON normalization, schema validation,
hashing, deterministic encoding. Tools that don't need to spawn processes, write
to `/tmp`, or load native deps.

---

## 2. Sandbox with auto-picked image

The host picks the lightest image satisfying `needs`. No template id baked into
the manifest — the registry chooses.

```yaml
runner:
  engine: sandbox
  needs:
    language: node
  limits:
    memory_mb: 1024
    timeout_ms: 60000
```

**When to use.** Standard Node tools that need real Linux (free `/tmp`,
`child_process`, `npm install`) but don't have unusual native requirements. The
host picks `mcp-node-server` or whatever its lightest Node template is.

---

## 3. Sandbox with explicit image

Override the auto-pick when the manifest knows exactly which template it needs.

```yaml
runner:
  engine: sandbox
  image: mcp-browser-server
  needs:
    language: node
  limits:
    memory_mb: 2048
    timeout_ms: 120000
```

**When to use.** The body needs a template with extra capabilities not
expressible via `needs.native` (e.g. an Xvfb + Playwright + Chromium image). Or
when the team wants to pin a specific template version.

---

## 4. Sandbox with native deps + extra npm

Declarative dependencies the host honours at cold-start.

```yaml
runner:
  engine: sandbox
  needs:
    language: node
    native: [weasyprint, fonts-liberation]
    npm: [stripe@^11.0.0, sharp@^0.33.0]
  limits:
    memory_mb: 1024
    timeout_ms: 60000
```

**Resolution.**

1. Host scans `needs.native: [weasyprint, fonts-liberation]` against its
   template registry. If a template has these baked in (e.g. `mcp-node-pdf`),
   it's auto-picked. Otherwise the host picks the lightest Node template and
   runs `apt-get install weasyprint fonts-liberation` at cold-start.
2. The bundle's `package.json` is npm-ci'd from the lockfile.
3. `npm install stripe@^11.0.0 sharp@^0.33.0` runs after, so these deps are
   added on top without disrupting the lockfile.

---

## 5. Heavy compute with raised limits

Long-running tool that needs more memory and a wider timeout window.

```yaml
runner:
  engine: sandbox
  needs:
    language: python
    pip: [pandas==2.1.3, numpy==1.26.0]
  limits:
    memory_mb: 4096
    timeout_ms: 600000 # 10 min
    cpu_ms: 300000 # 5 min CPU
```

**When to use.** Data analysis, ML inference, batch transforms. Tools where a
5-second default timeout would kill the body mid-flight.

---

## 6. In-process (vendor-only)

Reserved for trusted code shipped by the host. The host MUST refuse this engine
for any manifest whose source comes from outside the trust boundary (workspaces,
ai-draft, npm imports). Refusal is silent (downgrades to `subprocess`) with a
logged warning.

```yaml
runner:
  engine: in-process
  limits:
    memory_mb: 512
    timeout_ms: 30000
```

```yaml
# Manifest-level — required for in-process to not be downgraded
source:
  origin: workspace        # ← refused; downgraded
# vs
source:
  origin: vendor           # ← accepted by hosts that trust this origin
```

**When to use.** Internal vendor tools where startup cost matters (no spawn, no
container) and the body is part of the host's own audited codebase.

---

## 7. Inherited runner from a code-workspace

When a tool references a code-workspace (AIP-26), the workspace's `runner` is
inherited. The tool MAY add or override fields.

### The shared workspace

```yaml
# .code-workspaces/render-utils/manifest.yaml
kind: code-workspace
name: render-utils
code:
  sources: [...]
runner:
  engine: sandbox
  needs:
    language: node
    native: [weasyprint, ffmpeg]
  limits:
    memory_mb: 2048
    timeout_ms: 120000
```

### The consuming tool

```yaml
# .tools/render-invoice/manifest.yaml
kind: tool
name: render-invoice
code: ./code-workspaces/render-utils
run: invoice.ts

runner:
  # Inherits engine, image, needs from render-utils.
  # Only overrides limits for this lighter-weight invoice case.
  limits:
    memory_mb: 1024
    timeout_ms: 30000
```

The host merges field-by-field: `engine` / `needs` from the workspace, `limits`
from the tool. The `defineRunner` handle reflects the merged state.

---

## 8. Reusing the runner block across AIPs (TOOL / WORKFLOW)

The block is a `$ref` import — same shape in any consumer manifest.

### TOOL.md (AIP-14)

```yaml
kind: tool
name: scrape-prices
code:
  sources:
    - inline: { path: tool.py, content: "..." }
run: ["python", "tool.py"]

runner:
  engine: sandbox
  needs: { language: python }
  limits: { memory_mb: 512, timeout_ms: 30000 }

inputs: { ... }
outputs: { ... }
```

### WORKFLOW.md (AIP-15)

```yaml
kind: workflow
name: nightly-pricing-report
code:
  sources:
    - inline: { path: workflow.ts, content: "..." }
run: workflow.ts
suspendable: true

runner:
  engine: subprocess
  limits: { memory_mb: 512, timeout_ms: 600000 } # workflows can run longer

inputs: { ... }
outputs: { ... }
```

The block is identical between the two consumers. Host adapters that implement
`defineRunner` once handle both.

---

## What's NOT in the runner block (anti-examples)

These belong to other AIPs and MUST NOT appear inside `runner:`:

```yaml
# WRONG — env vars are not a runner concern
runner:
  env: [STRIPE_KEY]              # ✗ — use top-level `secrets:` (AIP-19)

# WRONG — network egress is its own top-level block
runner:
  network:
    egress: [api.stripe.com]     # ✗ — use top-level `network:` block

# WRONG — file mounts are per-run staging (AIP-16)
runner:
  fs:
    read:  [templates/]          # ✗ — use top-level `inputsFiles:` / `outputsFiles:`
    write: [output/]
```

The legacy `runtime:` block bundled all of these. The 2026-04-30 revision splits
them into independent top-level blocks; hosts that encounter the legacy shape
preprocess to the new layout (see AIP-17 § Compatibility).
