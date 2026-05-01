# ADAPTER.md — implementing AIP-3 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and activate** AIP-3 [`SKILL.md`](/docs/aip-3)
files. It is normative for the parts marked MUST and informative for the parts
marked SHOULD.

The audience is a framework or runtime author — someone exposing a skill catalog
to agents. Skill authors themselves should read [`./SKILL.md`](./SKILL.md), not
this file.

## Contract overview

A conforming host implements four responsibilities, in this order when a
SKILL.md folder is registered:

1. **Parse the manifest** — read `SKILL.md`, split YAML frontmatter from
   markdown body, validate frontmatter against
   [`./SKILL.schema.json`](./SKILL.schema.json), surface errors.
2. **Resolve dependencies** — verify every id in `tools` exists in the host's
   tool catalog; verify every grant in `capabilities` is representable in the
   host's policy registry.
3. **Register in the skill catalog** — wire the parsed value into the host's
   index so agents can discover and select it.
4. **Activate on demand** — when an agent (or the host's selector) chooses the
   skill for a turn, the host injects the body as instructions and the inputs as
   a structured arg payload, then gates capabilities through
   [AIP-7](/docs/aip-7).

The signature `defineSkill` (when present) is the boundary between host and
author for the optional entry file. Body-only manifests have no entry — the
markdown IS the skill, and the host hands it to the agent verbatim.

## `defineSkill` — the entry-point function (optional)

Most skills are body-only. A host MAY additionally accept an entry file that
returns a `defineSkill(...)` value for skills needing runtime hooks (dynamic
body assembly, custom input coercion, post-run reporting).

### Required behaviour

A host that implements `defineSkill` MUST:

1. **Accept the `SkillDefinition` shape** with at minimum:
   - `name` (string, kebab-case) — must match the manifest's `name`.
   - `inputSchema` (JSON Schema or canonicalisable equivalent).
   - `body` (string OR `(args) => string`) — the instruction prose. Hosts MAY
     accept additional fields under namespaced keys.
2. **Validate `input` against `inputSchema` before activation.** If the schema
   rejects, the host MUST throw `{ code: "input_invalid", … }` without injecting
   the body.
3. **Pass `context` through** to the body callable with at least:
   - `userId` (string \| undefined) — caller identity for audit.
   - `conversationId` (string \| undefined) — request grouping.
   - `capabilities` (string[]) — what the caller is permitted to do. Hosts MAY
     add fields under namespaced keys.
4. **Refuse drift between manifest and entry.** The entry's `name`,
   `inputSchema`, and (if declared) `tools` MUST match the manifest. Mismatch is
   a registration-time error.
5. **Cache the assembled body** when `body` is a function. Skills are read
   frequently; recomputing prose on every turn is waste.

### Optional behaviour

A host MAY:

- Re-export `defineSkill` under host-idiomatic aliases (`createSkill`, `skill`,
  `registerSkill`). The canonical name MUST be present.
- Accept zod, pydantic, attrs, or other schema libraries in `inputSchema` —
  canonicalise to JSON Schema for the manifest before hand-off.
- Expose host-specific fields via `metadata`. Authors stash hints there under
  namespaced keys; other hosts MUST tolerate unknown `metadata.<host>.…` keys.

## Manifest parsing

Frontmatter is YAML 1.2, delimited by `---` lines. Hosts MUST:

- Use a real YAML parser (`js-yaml`, `pyyaml`, `gopkg.in/yaml.v3`). Home-rolled
  parsers silently corrupt list-of-objects.
- Reject manifests where the frontmatter is empty, malformed, or missing
  `schema: skills/v1`.
- Treat the markdown body (everything after the closing `---`) as opaque
  instruction text. Do NOT attempt to extract tool calls or workflow steps from
  the body — that's not what skills are.

## Schema canonicalisation

The manifest's `inputs` are an authored shape (array of named parameters). The
entry's `inputSchema`, when present, MAY be JSON Schema or any value the host
can canonicalise to JSON Schema (zod, pydantic, attrs, …).

Hosts MUST surface the **canonicalised JSON Schema** as the authoritative form
to:

- the audit log entry recording the skill activation,
- any external catalog that lists skills (LSP-style auto-complete, marketplace,
  doc generator),
- the LLM-facing skill description (most drivers want JSON Schema for
  tool/skill arg shapes).

If the entry's schema doesn't match the manifest's `inputs` shape after
canonicalisation, the host MUST refuse registration. Drift is a spec bug.

## Capability gating

`capabilities` declares what the skill needs to function. [AIP-7](/docs/aip-7)
capability gating MUST run _before_ the body is injected into the agent's
context. The host walks the requested capabilities against the caller's grants:

- `network: ["api.example.com"]` — caller MUST have a grant covering the
  host(s).
- `fs.read: ["./config"]` — caller MUST have a read-grant covering the paths.
- `secrets: ["github-token"]` — caller MUST have an explicit per-secret grant.
- `tools: [<id>...]` — every listed tool MUST be in the caller's active toolset.

A missing grant MUST throw `{ code: "unauthorised", … }` with the specific
capability cited in `message`. Don't silently degrade (e.g. don't activate the
skill without the missing tool).

## Activation flow

When an agent turn selects a skill, the host:

1. Loads the manifest (cached after first parse).
2. Validates the agent's input args against `inputSchema`.
3. Runs capability gating against the caller's grants.
4. If `body` is a function (entry-driven skill), invokes it with
   `{ input, context }` and captures the returned prose.
5. Otherwise, uses the manifest's static markdown body.
6. Injects the body as system/instruction text into the agent's next message.
   The agent runs as normal.
7. Records `{ skillName, skillVersion, input, contextSnapshot }` in the audit
   log.

The host SHOULD also surface the skill's `description` and `tags` in any catalog
UI so users can discover and pick skills manually.

## Install scopes

Skills MAY be installed at three scopes. A host SHOULD support all three;
minimal hosts MAY support only the workspace scope.

| Scope     | Source                                     | Visibility                         |
| --------- | ------------------------------------------ | ---------------------------------- |
| Workspace | `.skills/<name>/` in the agent's workspace | Only the agent in that workspace.  |
| User      | `~/.skills/<name>/`                        | Every workspace owned by the user. |
| Host      | DB-backed catalog                          | Configured per-org by admins.      |

When the same `name@version` exists in multiple scopes, the host MUST prefer the
**most-specific** scope (workspace > user > host). Conflicting versions across
scopes SHOULD warn loudly so the user can resolve.

## Error envelope

All errors leave the host as:

```ts
type SkillResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        retryable?: boolean
        cause?: unknown
      }
    }
```

`code` SHOULD use the AIP-3 vocabulary (`input_invalid` / `unauthorised` /
`not_found` / `schema_unknown` / `tool_missing` / `body_too_large` / `internal`)
or a domain-prefixed variant (`github:rate_limited`). Domain prefixes use a
colon, never an underscore.

Hosts that pipe errors to a tracing/observability backend SHOULD emit `code` as
a span attribute keyed `skill.error.code` so error budgets aggregate cleanly
across runtimes.

## Loader rules

The (optional) entry file MUST be safely importable as a side-effect-free
module. Specifically:

- **No I/O at module load.** All I/O happens inside the body callable or
  downstream tools.
- **No reliance on a running host singleton.** The entry MUST work when imported
  in isolation — for testing, schema export, doc generation. Host context
  arrives via the activation call.
- **Default export is the `defineSkill(...)` return value.** The loader MAY also
  accept named exports (`export const skill = defineSkill(...)`) but a
  single-skill default export is the canonical shape.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name                               | Schema dialect                 |
| ----------------------- | ------------------------------------------- | ------------------------------ |
| TypeScript / JavaScript | `defineSkill`                               | JSON Schema or zod             |
| Python                  | `define_skill`                              | JSON Schema or pydantic        |
| Go                      | `DefineSkill`                               | JSON Schema struct tags        |
| Rust                    | `define_skill` (free fn) or `Skill::define` | JSON Schema or `schemars`      |
| Java / Kotlin           | `defineSkill` (static)                      | JSON Schema or jackson schemas |

A polyglot manifest declaring no entry is loaded identically across hosts (it's
just markdown). A manifest with an entry is loaded by the host whose language
matches the entry's extension.

## Registration test

A conforming host SHOULD provide a `validate(manifestPath)` helper that:

1. Parses the manifest.
2. Validates frontmatter against `SKILL.schema.json`.
3. Verifies every `tools` id resolves in the host's catalog.
4. Verifies every `capabilities` key is representable in policy.
5. Loads the entry (if present); verifies `defineSkill(...)` returned a value
   with matching `name` and schema.
6. Reports the first failure with file + field path.

This is the standard "is this skill installable?" handshake.

## What this guide does NOT cover

- The host's persistence model (in-memory catalog, DB, distributed registry).
- The host's selection surface (LLM-driven skill picker, manual catalog UI,
  command-bar fuzzy search).
- Skill versioning policy across upgrades (out of scope for v1).
- Host-specific UI for capability prompts.

These are runtime-policy concerns and stay out of the spec on purpose.

## See also

- [AIP-3 — SKILL.md spec](/docs/aip-3)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-14 — TOOL.md spec](/docs/aip-14) — for `tools` references
- [`./SKILL.schema.json`](./SKILL.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference patterns
