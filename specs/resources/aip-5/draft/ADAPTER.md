# ADAPTER.md — implementing AIP-5 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, resolve, and render** AIP-5 [CANVAKIT.md](/docs/aip-5)
templates. It is normative for the parts marked MUST and informative for the
parts marked SHOULD.

The audience is a framework or runtime author — someone exposing `defineCanvas`
(or a parser-only path) to template authors. Template authors themselves should
read [`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when rendering
a `*.canvakit.*` file:

1. **Parse the frontmatter** — split on `---` fences, parse YAML, validate
   against [`./TEMPLATE.schema.json`](./TEMPLATE.schema.json), apply legacy-kind
   rewrites.
2. **Resolve `sources` in parallel** — every entry produces a value plus a
   per-source `status`. Failures degrade to `null`/`[]` without aborting the
   render.
3. **Render the body** — assemble a context (variables + sources + well-known
   roots), invoke the engine with `(body, context)`, capture the string output.
4. **Surface status + serialise context** — emit per-source statuses, populate
   `_data` for client-side rehydration, return the result envelope.

Each responsibility is independent enough to be reused: a CLI lint tool wants
only step 1; a render-once-and-cache server uses 1–4; a playground UI streams
the result envelope to the browser.

## `defineCanvas` — the entry-point function

The canonical signature is `defineCanvas`. Hosts MAY alias it (`createTemplate`,
`template`, `canvas`) but the canonical name MUST be present so polyglot tooling
can locate the binding.

### Required behaviour

A host that implements `defineCanvas` MUST:

1. **Accept the `CanvasDefinition` shape** documented in AIP-5 § Frontmatter.
   Every field listed there MUST round-trip — unknown keys are preserved (do not
   strip).
2. **Validate `variables` against author defaults at render time.** Required
   variables without a caller value MUST throw `{ code: "input_invalid", … }`
   before any source is resolved.
3. **Substitute variables in `params`** before invoking a source's resolver. The
   substitution scope is `variables` only — sources cannot reference each
   other's resolved values (sources resolve in parallel, so cross-references
   would be a race).
4. **Resolve every declared source.** Missing tool refs / missing files degrade
   to `null`/`[]` with `status: "missing"`. Failed resolvers degrade to
   `null`/`[]` with `status: "error"`. The render MUST complete with the
   surviving sources intact.
5. **Run the engine over the body** with a context that obeys the precedence in
   §Context shape below.
6. **Return a result envelope** that carries the rendered string, the per-source
   statuses, and the serialised context.

### Optional behaviour

A host MAY:

- Re-export `defineCanvas` under host-idiomatic aliases.
- Cache resolved sources between renders, keyed on `(ref, params, fs hash)`.
- Watch the filesystem for `kind: file` / `kind: query` source changes and
  trigger re-renders for `refreshEvery: on-tool-change`.
- Inject host-specific values via context extension (see §Designkit bridge for
  the canonical pattern).

## Frontmatter parsing

The frontmatter block MUST begin with a line containing exactly `---` and
terminate with the next such line. Everything between is parsed as YAML. The
body is everything after the closing fence.

If the leading `---` is absent, the file has no frontmatter — treat the entire
file as body and emit a warning (`template: true` marker missing).

### Legacy kind rewrites

Two pre-v1 kinds MUST be accepted with a parse-time warning and rewritten before
resolution:

| Legacy form                                   | Rewritten to                           | Notes                                           |
| --------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `kind: integration, ref: <id>, params: {...}` | `kind: tool, ref: <id>, params: {...}` | Rename only.                                    |
| `kind: queryFiles, queryFiles: <path>`        | `kind: query, include: <pattern>`      | A bare directory path becomes `<path>/**/*.md`. |

The `queryFiles` rewrite is a structural rename, not a body rewrite. Pre-v1
templates iterating `{{frontmatter.title}}` need their **bodies** updated to
`{{data.title}}` — the kind rename does not touch the body. Hosts SHOULD log
this caveat alongside the rewrite.

Both legacy kinds are scheduled for removal in v2 (target 2026-Q4).

### Schema validation

Validate the parsed object against `TEMPLATE.schema.json`. On failure, hosts
MUST refuse the render and report the first error with the `instancePath` and
the human reason. Don't silently drop fields.

## Variable substitution

Variables are substituted in `sources.<x>.params` (and any nested string
values inside) before the source is resolved. The substitution language is the
same as the body engine — `{{var}}` under Mustache. Substitution rules:

- Required variables without a caller value MUST throw `input_invalid`.
- Defaults in `variables.<x>.default` apply when the caller omits.
- A caller-provided variable name that collides with a `sources` name
  silently loses to the source post-resolution. Hosts SHOULD warn so the
  collision is visible.

## Source resolution

Resolve all `sources` entries **in parallel** using the host's async
primitive (Promise.all in JS, asyncio.gather in Python, errgroup in Go).
Per-source timeouts MAY be applied; an exceeded timeout becomes
`status: "error", reason: "timeout"`.

### Per-source status

Every resolution reports a status the host MUST return alongside the resolved
value:

```ts
type SourceStatus =
  | { status: "ok"; sampleKeys?: string[]; count?: number }
  | { status: "missing"; reason: string }
  | { status: "error"; reason: string }
```

`ok` is the success case. `count` is set for array-shaped sources (`query`, CSV
`.rows`). `sampleKeys` lists the top-level keys of the parsed shape — useful for
debugging "I see an `ok` status but nothing renders" (the keys reveal what the
body should reference).

`missing` covers expected-but-absent: unregistered tool ref, unreadable file
path. The value MUST be `null` for object-shaped sources, `[]` for array-shaped
(`query`).

`error` covers unexpected: resolver threw, parse failed, timeout. The value MUST
be `null`/`[]` so the body's `{{#tasks}}…{{/tasks}}` section yields the empty
string instead of crashing.

A failed source degrades its OWN key only. The render completes.

### Source kinds

| Kind     | Resolution path                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tool`   | Look up `ref` in the host's tool registry (exact > wildcard > MCP). Invoke with `params`. Return value verbatim.       |
| `static` | Return `value` unchanged. Status is always `ok`.                                                                       |
| `file`   | Map to `tool` `readFile` with `{ path }` if no native handler — parse by extension per §Format contract.               |
| `query`  | Map to `tool` `query` with `{ include, where, sort, limit, fields }` if no native handler — return `[{ path, data }]`. |

Hosts that lack filesystem sugar SHOULD register `readFile` and `query` as tools
and let `kind: file` / `kind: query` rewrite through the same code path. The
observed value in the context is identical either way.

## Format contract

`file` and `query` sources parse content by extension into a uniform shape.
Hosts MUST implement these mappings so templates render identically across
runtimes:

| Extension                 | Parsed shape                                           | Notes                                                                                     |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `.json`                   | Parsed JSON (any shape)                                | Standard `JSON.parse` (or equivalent).                                                    |
| `.yaml` / `.yml`          | Parsed YAML (any shape)                                | Use a real YAML parser (js-yaml, PyYAML); never roll your own.                            |
| `.csv` / `.tsv`           | `{ columns: string[], rows: Record<string,string>[] }` | First row is the column header. Cell values are strings.                                  |
| `.md` / `.markdown`       | `{ ...frontmatter, $body: string, $html: string }`     | Frontmatter keys flatten on the object. `$body` is the raw markdown source; `$html` is the same body rendered to HTML by the host's markdown engine (GFM-compliant). Templates that want headings/lists/tables to display as real DOM use `{{{x.$html}}}`; `$body` is for displaying the source as text. |
| `.html` / `.htm` / `.txt` | `{ $text: string }`                                    | The raw text, escape-safe.                                                                |
| (anything else)           | `{ $text: string }`                                    | Same fallback shape so the body never crashes on a typo'd extension.                      |

For `kind: query` the per-entry `data` carries the parsed shape. For markdown,
frontmatter keys are flattened on `data` (NOT under `data.frontmatter`). For CSV
the per-entry `data` is `{ columns, rows }`. JSON / YAML / text / html parse
exactly as for `kind: file`. The iteration unit is the entry, not the parsed
shape itself.

## Body rendering

A canvakit engine is a single function:
`(body: string, context: object) => Promise<string>`. No class hierarchy. Hosts
MUST ship a Mustache implementation as the v1 default. Other engines
(Handlebars, MDX) plug in by exposing the same function shape.

Hosts MUST NOT import React, DOM, or front-end frameworks in their core renderer
— engines that need them ship as separate packages.

### Context shape

Merge sources into a single object passed to the engine. Precedence (lowest →
highest):

1. Author-declared `variables` defaults
2. Caller-provided `variables`
3. Resolved `sources` (winning — the dynamic data is the point)

Plus these well-known roots:

- `$meta` — `{ renderedAt, templatePath, renderedFrom?, instanceSlug? }`.
- `$design` — flattened designkit tokens when the bridge is wired; `null`
  otherwise.
- `_data` — the entire context serialised as `<script>`-safe JSON for
  client-side rehydration (see below).
- `renderedAt` — alias for `$meta.renderedAt` exposed at the top level for older
  templates.

Caller-provided variables that collide with a source name lose to the source.
Emit a warning so the collision is visible.

## Imports (composable canvases)

If frontmatter declares an `imports` map, each entry is a full nested render:
parse, resolve sources, run the engine, serialise. The rendered body is exposed
under `imports.<name>` in the parent's context — reference with **triple-brace**
(`{{{imports.<name>}}}`) so the engine's HTML escaping doesn't double-encode the
rendered HTML.

Semantics hosts MUST implement:

- Imports inherit the parent's filesystem, tool registry, and render extensions
  (designkit injection MUST cascade).
- Imports do NOT inherit the parent's variables or resolved sources — pass
  values down explicitly via each entry's `variables:` block.
- Per-source statuses from imports roll up under `<importName>.<sourceName>` in
  the parent's status map.
- **Cycle protection**: a template path already in the active import chain is
  rejected with a warning; the import renders as the empty string.
- **Depth cap**: at least 8 levels of nesting. Hosts MAY cap lower; document the
  cap.

## Client-side rehydration (`_data`)

The host MUST populate `_data` in the context with the full context as
`<script>`-safe JSON. Templates embed it as:

```html
<script id="canvas-data" type="application/json">
  {{{_data}}}
</script>
```

Triple-brace skips HTML-entity escaping (the data is already JSON). Hosts MUST
pre-escape stray `<` to `<` so a `</script>` sequence in a string field can
never break out of the script tag.

Browsers parse the JSON to rehydrate typed values without re-fetching. Frontend
framework choice (React, Solid, Vue, vanilla) is out of scope — this is the
primitive on top.

## Designkit bridge (context extension)

When the optional `@canvakit/designkit` bridge is wired, the host extends the
context with a `$design` root and (typically) a `<style>:root { --color-* }`
injection prepended to the body output.

Resolution priority (highest first):

1. Runtime `designOverride` (caller force at render time)
2. `forceDesign:` frontmatter (template-author force)
3. Workspace pointer — `_design/active.txt` → `_design/<slug>.md`
4. Workspace root `DESIGN.md`
5. `design:` frontmatter (fallback hint)

Schemes (`dk:`, `ws:`, `kit:`, bare `*.md` paths) resolve through a pluggable
`DesignSourceRegistry`. Custom schemes (`db:`, `npm:`, `https:`) register at the
host level. A resolver returns a
`DesignArtifact { tokens, tailwindExtend?, fonts? }`.

Hosts MUST treat the bridge as opt-in — a base canvakit runtime without
designkit MUST still render templates that declare `design:` (the field becomes
a no-op, `$design` is `null`).

## Refresh semantics

`refreshEvery` is a declarative hint, not a runtime guarantee:

| Value                               | Host behaviour                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `manual` (default)                  | Never auto-refresh.                                                                                                            |
| Duration string (`60s`, `5m`, `1h`) | Schedule timer-driven re-renders. Hosts that can't (one-shot CLI) treat as `manual`.                                           |
| `on-tool-change`                    | Re-render when any `kind: tool` source's params would invalidate (requires tool-tracking; hosts without it treat as `manual`). |

Unknown values warn and fall back to `manual`. Don't crash.

## Unknown content handling

Inherits AIP-5's consumer convention:

| Scenario                                  | Behaviour                                      |
| ----------------------------------------- | ---------------------------------------------- |
| Unknown frontmatter key                   | Preserve (round-trip); do not error.           |
| Missing `template: true` marker           | Warn; render anyway.                           |
| Unknown `sources` kind                | Drop with warning; other sources still render. |
| Malformed source fields                   | Drop with warning; status reports the issue.   |
| Missing / unreadable file (`file` source) | Status `missing`; value `null`.                |
| Unregistered tool ref                     | Status `missing`; value `null`.                |
| Unknown `refreshEvery` value              | Warn; fall back to `manual`.                   |
| Unknown design ref scheme                 | Warn; `$design` becomes `null`.                |

Hosts SHOULD NOT crash a render over author/data mistakes — surface per-source
statuses and carry on.

## Loader rules

- The `*.canvakit.*` file MUST be safely readable as a flat string
  - YAML front-matter parse. No code execution at load time.
- An optional `defineCanvas` entry file follows the same rule as AIP-14 entries:
  no I/O at module load, no host singletons. Host context arrives via the render
  call, not module scope.
- Hosts MAY pre-compile the body (Mustache → AST cache) at load. Re-render uses
  the cached AST + a fresh context.

## Multi-language hosts

Same contract, idiomatic naming:

| Language                | Function name   | Engine                        |
| ----------------------- | --------------- | ----------------------------- |
| TypeScript / JavaScript | `defineCanvas`  | Mustache (mustache.js)        |
| Python                  | `define_canvas` | Mustache (chevron / pystache) |
| Go                      | `DefineCanvas`  | Mustache (mustache.go)        |
| Rust                    | `define_canvas` | Mustache (rustache)           |

The `*.canvakit.*` file is portable across all of them — only the optional entry
file is language-specific.

## Validation helper

A conforming host SHOULD provide a `validate(templatePath)` helper that:

1. Parses the frontmatter.
2. Validates against `TEMPLATE.schema.json`.
3. Checks every `variables.<x>` referenced in `params` is declared.
4. Checks every `imports.<n>.template` resolves (file exists).
5. Resolves sources against a fixture-mode tool registry — confirms refs are
   reachable.
6. Reports the first failure with file + field path.

This is the standard "is this template installable?" handshake.

## What this guide does NOT cover

- The host's persistence model (catalog, gallery, registry).
- The host's invocation surface (CLI, HTTP, agent tool-call).
- Streaming bodies (out of scope for v1; see §Streaming in the AIP).
- The frontend framework chosen for `_data` rehydration.

## See also

- [AIP-5 — CANVAKIT.md spec](/docs/aip-5)
- [AIP-4 — DESIGN.md spec](/docs/aip-4) — designkit bridge
- [AIP-14 — TOOL.md spec](/docs/aip-14) — `kind: tool` lookups
- [`./TEMPLATE.schema.json`](./TEMPLATE.schema.json) — frontmatter validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference templates
