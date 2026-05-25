---
schema: skills/v1
name: author-canvas
title: Author a canvakit template (AIP-5)
description:
  Walk through authoring a portable canvakit template — frontmatter identity,
  variables, sources (tool/static/file/query), imports, designkit binding,
  validation. Produces a `<name>.canvakit.<ext>` file plus an optional
  `defineCanvas` entry.
version: 1.0.0
tags: [aip-5, canvakit, templates, data-binding, agentproto]
inputs:
  - name: purpose
    type: string
    required: true
    description:
      One-sentence statement of what the template renders. The skill turns this
      into name + description + a body sketch.
  - name: outputFormat
    type: string
    required: false
    description:
      Body output format. Default "html". Accepts "html", "md", "mdx", "svg",
      "txt".
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill writes a
      single `<id>.canvakit.<ext>` file at the workspace root.
examples:
  - input:
      purpose:
        A weekly status dashboard pulling open tasks from /tasks/*.md and
        current MRR from a stripe.mrr tool.
    output:
      - weekly-status.canvakit.html
---

# Author a canvakit template (AIP-5)

Use this skill when the user asks to **build, draft, or define a template** that
renders against live data — a dashboard, a report, a canvas, a brief that needs
to refresh as the underlying data changes. The skill produces a valid
[AIP-5](/docs/aip-5) `*.canvakit.*` file and (optionally) a typed entry exposing
the `defineCanvas` signature.

## When to use

- "Make a Q2 dashboard that pulls open deals from the CRM tool."
- "Draft a weekly report template that rolls up tasks from `/tasks/`."
- "Build a status canvas wired to my `stripe.mrr` and `linear.issues` tools."
- "I want a template I can re-render every 5 minutes against fresh data."

## When NOT to use

- The user wants a **one-shot** static page → just write HTML.
- The user wants a **multi-step automation** → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/skills/author-workflow/SKILL.md)
  instead.
- The user wants to **theme** an existing UI → use the
  [AIP-4 DESIGN.md skill](../../../aip-4/skills/author-design/SKILL.md) —
  canvakit consumes designkit, it doesn't replace it.

## Process

Eight steps. Steps 3–5 (variables, data sources, format awareness) are where
most authoring mistakes live — read the gotchas in each.

### 1. Fix identity

Frontmatter identity is the registry key.

- `template: true` — required marker. Tooling that loads files by glob uses this
  to catch "renamed but not a template" mistakes.
- `schema: canvakit/v1` — pin the spec version. Hosts that find an unknown
  schema MUST refuse rather than guess.
- `name`: kebab-case, descriptive of WHAT renders (`q2-dashboard`, not
  `template-1`).
- `version`: semver. Bump on breaking change to the rendered shape or the
  variables contract.
- `description`: one sentence for the gallery card. Author-facing.
- `author`: optional locally; required for gallery publish — the
  `(author, name, version)` tuple is the canonical key.

Filename convention: `<name>.canvakit.<engine-ext>` —
`q2-dashboard.canvakit.html`, `report.canvakit.md`. The double extension
`*.canvakit.*` is the discovery glob; the trailing extension self-describes the
engine output.

### 2. Pick the renderer

`renderer: mustache` is the v1 default and what every canvakit runtime must
implement. Other engines are spec-legal but not universally supported:

| Renderer     | Status     | When to pick                                      |
| ------------ | ---------- | ------------------------------------------------- |
| `mustache`   | v1 default | Everywhere. Logic-less, broad implementations.    |
| `handlebars` | optional   | When you need helpers / partials beyond Mustache. |
| `mdx`        | Phase 3    | When the body is React-flavoured docs.            |

If you don't know, leave it off — defaults to `mustache`.

### 3. Declare `variables` (caller inputs)

`variables` are caller-overridable inputs with author defaults. They're how the
same template renders for different users / periods / scopes.

```yaml
variables:
  user_id: { type: string, required: true }
  period: { type: string, default: "Q2 2026" }
  show_archived: { type: boolean, default: false }
```

Rules:

- Every variable that's referenced in `sources.<x>.params` MUST appear in
  `variables` (the runtime substitutes `{{user_id}}` -> caller value before
  resolving the source).
- Mark `required: true` for inputs with no sensible default. The runtime MUST
  refuse the render if a required variable is missing.
- Authoring defaults (`default: <x>`) are visible to the body too — `{{period}}`
  renders the default when the caller doesn't override.
- A caller-provided `variables` key that **collides** with a `sources` name
  silently loses to the source. Don't shadow.

### 4. Pick the data sources

This is where the template's value lives. Four kinds, two primitives + two
filesystem shorthands. Use the **smallest** kind that fits.

#### `kind: tool` — the primitive

```yaml
sources:
  mrr: { kind: tool, ref: stripe.mrr, params: { since: "2026-01-01" } }
  user: { kind: tool, ref: get-user, params: { id: "{{user_id}}" } }
```

`ref` resolves in three styles (precedence: exact flat > longest wildcard >
MCP):

| Style         | Example                          | Resolution                    |
| ------------- | -------------------------------- | ----------------------------- |
| Flat id       | `searchFlights`                  | Local registry lookup         |
| Namespaced    | `stripe.mrr`, `notion.pages.get` | Longest-prefix wildcard match |
| MCP-qualified | `mcp://server/toolName`          | MCP proxy                     |

Use a tool source when the data lives behind an API, a database, or any
non-filesystem source. The portability story rests on `kind: tool` — these refs
are resolved by the runtime's tool registry, identical across hosts.

#### `kind: static` — caller-supplied / constant

```yaml
sources:
  header: { kind: static, value: "Welcome back" }
  branding: { kind: static, value: { color: "#7c3aed", name: "Acme" } }
```

Literal pass-through. Never fetched. Use for per-template constants or values
the caller supplies via the host (e.g. injected through context extension).

#### `kind: file` — single-file shorthand

```yaml
sources:
  roadmap: { kind: file, path: /plans/q2.md }
  pricing: { kind: file, path: /data/pricing.csv }
  config: { kind: file, path: /config/site.yaml }
```

Reads one file from the render filesystem and parses by extension. Equivalent to
`{ kind: tool, ref: readFile, params: { path } }` — runtimes without filesystem
sugar SHOULD just register `readFile` as a tool.

The parsed shape lands at the source name — see §Format contract below.
**Markdown frontmatter keys are flattened on the source object alongside
`$body`** — a markdown file with `title:` and `owner:` exposes
`{{roadmap.title}}` / `{{roadmap.owner}}` / `{{{roadmap.$body}}}`. There is no
`roadmap.frontmatter.*` nesting.

#### `kind: query` — multi-file shorthand

```yaml
sources:
  tasks:
    kind: query
    include: /tasks/**/*.md
    where: { status: todo }
    sort: -updatedAt
    limit: 20
    fields: [title, priority, assignee]
```

Reads many files matching one or more globs; parses each by extension; filters /
sorts / projects.

- `include` — glob OR array of globs. A bare directory path is rewritten to
  `<path>/**/*.md` for back-compat.
- `where` — field predicates against the parsed shape. Supports equality and
  operators `_in`, `_contains`, `_before`, `_after`.
- `sort` — `field` (asc) or `-field` (desc).
- `limit` — max entries; default 50.
- `fields` — project to a subset of parsed keys.

**The data shape is `[{ path, data }]` — pitfall alert.** Templates address
fields through `data.<key>`, NOT at the top level. Frontmatter keys are
flattened on `data` (NOT `data.frontmatter`):

```mustache
{{#tasks}}
  <li>
    <a href="/{{path}}">{{data.title}}</a>
    — {{data.assignee}} ({{data.priority}})
  </li>
{{/tasks}}
```

Writing `{{title}}` (top-level) or `{{data.frontmatter.title}}` (nested) renders
nothing — the most common canvakit authoring bug.

### 5. Know the format contract

`file` and `query` parse content by extension into a uniform shape. Authors MUST
know which shape to expect, because the body addresses it directly:

| Extension                 | Parsed shape                                           |
| ------------------------- | ------------------------------------------------------ |
| `.json`                   | Parsed JSON (any shape)                                |
| `.yaml` / `.yml`          | Parsed YAML (any shape)                                |
| `.csv` / `.tsv`           | `{ columns: string[], rows: Record<string,string>[] }` |
| `.md` / `.markdown`       | `{ ...frontmatter, $body: string, $html: string }`     |
| `.html` / `.htm` / `.txt` | `{ $text: string }`                                    |
| (anything else)           | `{ $text: string }`                                    |

CSV iteration:

```mustache
{{#pricing.rows}}{{name}}: ${{price}}{{/pricing.rows}}
```

Markdown body insertion — `$html` is the body pre-rendered to HTML (use this to
get real headings/lists/tables in the page), `$body` is the raw markdown text.
Triple-brace skips HTML escaping; required for `$html`.

```mustache
<article>{{{roadmap.$html}}}</article>
```

Use `{{{roadmap.$body}}}` instead when you intentionally want to display the
markdown source as text (e.g. inside a `<pre>` for an editor preview).

### 6. Decide on imports (composability)

If the template assembles known sub-canvases (a header, a widget), declare them
under `imports`. Each is a full nested render with its own data sources.

```yaml
imports:
  header: { template: parts/header.canvakit.html }
  mrr_card:
    template: widgets/mrr-card.canvakit.html
    variables: { period: "Q2 2026" }
```

Body reference uses **triple-brace** so the rendered HTML isn't double-escaped:

```mustache
{{{imports.header}}}
{{{imports.mrr_card}}}
```

Imports inherit the parent's filesystem + tool registry but NOT its variables —
pass values down explicitly. Cycles are detected and rejected; depth caps at ≥8
levels.

### 7. (Optional) Bind to a designkit

If the template should pick up an active design — colors, fonts, tokens — set
`design:` (fallback hint) or `forceDesign:` (override).

```yaml
design: dk:heritage # fallback if no workspace design active
# OR
forceDesign: ws:DESIGN.md # bypass operator selection
```

Accepted ref schemes: `dk:<preset>` / `ws:<path>` / `kit:<slug>` / bare `*.md`
paths. Custom schemes register through the host's `DesignSourceRegistry`.

In the body, reference tokens via CSS variables (with fallbacks so the template
still renders without the bridge):

```html
<h1 style="color: var(--color-primary, #7c3aed)">{{header}}</h1>
```

The bridge injects `:root { --color-* }` plus optional Tailwind extensions.
Don't emit your own `:root { --color-* }` block — the cascade lets a body-level
declaration silently override the bridge.

### 8. Validate

Validate the frontmatter against
[`./TEMPLATE.schema.json`](./TEMPLATE.schema.json):

```bash
npx ajv validate -s ./TEMPLATE.schema.json -d ./<your>.canvakit.html
```

Then dry-render against fixture data:

```bash
canvakit render ./<your>.canvakit.html --vars '{"user_id":"u_123"}'
```

The runtime SHOULD report per-source statuses (`ok` / `missing` / `error`) so
you can debug "empty render" cases without log-diving.

## Output

Produce one file in the chosen folder:

```
<folder>/
  <id>.canvakit.<ext>      # the template (frontmatter + body)
```

Optionally, hosts that prefer typed authoring ship a sibling entry:

```ts
// canvas.ts
import { defineCanvas } from "<host-runtime>"
export default defineCanvas({
  name: "q2-dashboard",
  version: "1.0.0",
  variables: { user_id: { type: "string", required: true } },
  sources: {
    user: { kind: "tool", ref: "get-user", params: { id: "{{user_id}}" } },
  },
  body: /* loaded from the .canvakit.html sibling */ "",
})
```

Reply to the user with:

1. The path you wrote to.
2. The list of `sources` with their resolution kind so they can verify the
   binding (e.g. `mrr → tool stripe.mrr`, `tasks → query /tasks/**/*.md`).
3. **Required variables** they must supply at render time.
4. **Open assumptions** — defaults you guessed (`renderer: mustache`,
   `refreshEvery: manual`, no design binding) the user might want to override.

Do NOT install or render the template yourself. Authoring ends with the file
written; rendering is a separate step.

## See also

- [AIP-5 — CANVAKIT.md spec](/docs/aip-5)
- [AIP-4 — DESIGN.md spec](/docs/aip-4) — designkit bridge
- [AIP-14 — TOOL.md spec](/docs/aip-14) — `kind: tool` resolves to these
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference templates (static, tool-bound,
  query-rollup, file-driven, composed, designkit-themed, multi-source dashboard)
- [`./TEMPLATE.schema.json`](./TEMPLATE.schema.json) — frontmatter validator
