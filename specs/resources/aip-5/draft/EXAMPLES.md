# EXAMPLES.md — canvakit template reference patterns

Reference `*.canvakit.*` templates exemplifying common patterns. Each example is
a self-contained file a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Minimal static page](#1-minimal-static-page)
2. [Page with a tool source](#2-page-with-a-tool-source)
3. [Page with a query source (markdown rollup)](#3-page-with-a-query-source-markdown-rollup)
4. [Page with a file source (CSV table)](#4-page-with-a-file-source-csv-table)
5. [Composed page (imports)](#5-composed-page-imports)
6. [Page with designkit binding](#6-page-with-designkit-binding)
7. [Multi-source dashboard](#7-multi-source-dashboard)

## Reading these examples

- All examples assume `renderer: mustache` (the v1 default). The body uses
  `{{var}}` for HTML-escaped output and `{{{var}}}` for raw passthrough.
- File paths are relative to the render filesystem (host-defined root, typically
  the workspace).
- The pitfall flagged in
  [SKILL.md §4](./SKILL.md#kind-query--multi-file-shorthand) is repeated here on
  purpose — `query` data is `[{ path, data }]` and frontmatter keys flatten on
  `data`, NOT under `data.frontmatter`. Examples 3 and 7 show the correct
  pattern.

---

## 1. Minimal static page

A template with no dynamic data — useful for fixed marketing copy that still
wants to live in the canvakit registry. `sources` is empty; the body uses
caller variables only.

`welcome.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: welcome
version: 1.0.0
description: Minimal welcome page. No dynamic data; caller supplies the name.
variables:
  visitor_name: { type: string, required: true }
  cta_label: { type: string, default: "Get started" }
tags: [marketing, welcome]
---

<!doctype html>
<html>
  <head>
    <title>Welcome, {{visitor_name}}</title>
  </head>
  <body>
    <h1>Welcome, {{visitor_name}}.</h1>
    <p>Rendered at {{$meta.renderedAt}}.</p>
    <a href="/start">{{cta_label}}</a>
  </body>
</html>
```

Render:

```bash
canvakit render welcome.canvakit.html --vars '{"visitor_name":"Jeremy"}'
```

---

## 2. Page with a tool source

The cleanest demonstration of canvakit's value: a template binds to one tool and
re-renders against fresh data without re-emitting HTML.

`mrr-card.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: mrr-card
version: 1.0.0
description: One-card view of current MRR pulled from the stripe.mrr tool.
renderer: mustache
refreshEvery: 5m
variables:
  period: { type: string, default: "current-month" }
sources:
  mrr:
    kind: tool
    ref: stripe.mrr
    params: { period: "{{period}}" }
tags: [finance, dashboard, stripe]
---

<section class="card">
  <h2>MRR — {{period}}</h2>
  <p class="big">${{mrr.amountUsd}}</p>
  <p class="trend">{{#mrr.deltaPct}}{{.}}% vs last period{{/mrr.deltaPct}}</p>
  <small>as of {{$meta.renderedAt}}</small>
</section>
```

Notes:

- `params.period` interpolates the `period` variable — the runtime substitutes
  BEFORE invoking the tool resolver.
- `refreshEvery: 5m` is a hint. A long-running host re-renders every 5 minutes;
  a one-shot CLI ignores it.
- The tool's return shape is whatever `stripe.mrr` returns — canvakit doesn't
  impose a schema on tool outputs.

---

## 3. Page with a query source (markdown rollup)

The single most common canvakit shape: roll up a folder of markdown files into a
list. Each entry is a `{ path, data }` pair where `data` is
`{ ...frontmatter, $body }`.

`tasks.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: open-tasks
version: 1.0.0
description: Open tasks rolled up from /tasks/**/*.md, sorted by priority.
sources:
  tasks:
    kind: query
    include: /tasks/**/*.md
    where: { status: todo }
    sort: -priority
    limit: 50
    fields: [title, priority, assignee, dueDate]
tags: [tasks, rollup]
---

<h1>Open tasks</h1>
<p>{{tasks.length}} items.</p>

<ul>
  {{#tasks}}
  <li>
    <a href="/{{path}}">{{data.title}}</a>
    <span class="meta">
      priority {{data.priority}} {{#data.assignee}}— {{.}}{{/data.assignee}}
      {{#data.dueDate}}— due {{.}}{{/data.dueDate}}
    </span>
  </li>
  {{/tasks}}
</ul>
```

**Pitfall (repeat from SKILL.md):**

- Correct: `{{data.title}}` — frontmatter keys flatten on `data`.
- Wrong: `{{data.frontmatter.title}}` — there is no `frontmatter` key.
- Wrong: `{{title}}` (top-level) — within a `{{#tasks}}…{{/tasks}}` block the
  iteration item is the entry, not the parsed shape.

A pre-v1 template using `kind: queryFiles` and `{{frontmatter.x}}` in the body
needs BOTH the kind rewritten to `query` AND the body changed to `{{data.x}}`.
The legacy-kind rewrite alone does not touch the body.

---

## 4. Page with a file source (CSV table)

A single CSV file becomes a table. The parsed shape is `{ columns, rows }`.

`pricing.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: pricing-table
version: 1.0.0
description: Current pricing tiers rendered from /data/pricing.csv.
sources:
  pricing: { kind: file, path: /data/pricing.csv }
  config: { kind: file, path: /config/site.yaml }
variables:
  show_archived: { type: boolean, default: false }
tags: [pricing, table]
---

<h1>{{config.brandName}} pricing</h1>
<p>{{config.tagline}}</p>

<table>
  <thead>
    <tr>
      {{#pricing.columns}}
      <th>{{.}}</th>
      {{/pricing.columns}}
    </tr>
  </thead>
  <tbody>
    {{#pricing.rows}}
    <tr>
      <td>{{name}}</td>
      <td>${{price_usd}}</td>
      <td>{{features}}</td>
    </tr>
    {{/pricing.rows}}
  </tbody>
</table>
```

Notes:

- CSV cell values are always strings — coerce in the body if needed
  (`{{rows.price_usd}}` is a string like `"49"`).
- The YAML file (`/config/site.yaml`) parses into the source object as-is;
  `{{config.brandName}}` reads the YAML key directly.
- For markdown files, the parsed shape is `{ ...frontmatter, $body }`. Use
  triple-brace for the body: `<article>{{{config.$body}}}</article>` —
  double-brace would HTML-escape the markdown's HTML output.

---

## 5. Composed page (imports)

A dashboard template that assembles three child canvases via `imports`. Each
import is a full nested render with its own data sources.

`dashboard.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: company-dashboard
version: 1.0.0
description:
  Composed dashboard — header + MRR card + open tasks. Each section is its own
  canvas.
imports:
  header:
    template: parts/header.canvakit.html
  mrr:
    template: widgets/mrr-card.canvakit.html
    variables: { period: "Q2 2026" }
  tasks:
    template: widgets/open-tasks.canvakit.html
tags: [dashboard, composed]
---

<!doctype html>
<html>
  <head>
    <title>Company dashboard</title>
  </head>
  <body>
    {{{imports.header}}}

    <main class="grid grid-cols-2 gap-6">
      <section>{{{imports.mrr}}}</section>
      <section>{{{imports.tasks}}}</section>
    </main>

    <footer>Rendered {{$meta.renderedAt}}.</footer>
  </body>
</html>
```

Notes:

- Triple-brace (`{{{imports.x}}}`) is required — the imported body is already
  rendered HTML, so double-brace would HTML-escape it.
- Imports inherit the parent's filesystem and tool registry but NOT its
  variables. Pass explicit values via each entry's `variables:` block.
- A child canvas can itself have imports — depth is capped at ≥8 by the spec,
  hosts MAY cap lower.
- Per-source statuses roll up under `<importName>.<sourceName>`, so `mrr.mrr` is
  the MRR card's `mrr` source status in the parent's status map.

---

## 6. Page with designkit binding

The template declares a designkit hint. When the bridge is wired, the runtime
injects `:root { --color-* }` and exposes flattened tokens under `$design`. The
body references tokens through CSS variables with fallbacks so it still renders
without the bridge.

`brief.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: weekly-brief
version: 1.0.0
description:
  Weekly brief themed via the active workspace designkit, falling back to
  dk:heritage.
design: dk:heritage
sources:
  brief: { kind: file, path: /briefs/this-week.md }
tags: [brief, themed]
---

<style>
  body {
    background: var(--color-background, #fdfcfb);
    color: var(--color-foreground, #1a1a1a);
    font-family: var(--font-body, Georgia, serif);
  }
  h1 {
    color: var(--color-primary, #7c3aed);
    font-family: var(--font-display, var(--font-body));
  }
</style>

<article>
  <h1>{{brief.title}}</h1>
  <p class="byline">{{brief.author}} — {{brief.date}}</p>
  {{{brief.$body}}}
</article>
```

Notes:

- `design: dk:heritage` is a **fallback hint**. Operator-set workspace selection
  wins. If you want to force a design, use `forceDesign:` instead.
- Reference tokens via `var(--color-foo, <fallback>)`. Do NOT emit your own
  `:root { --color-* }` block in the body — the cascade lets the body
  declaration silently override the bridge's injected `:root`.
- `$design` is also available on the context — e.g. `{{$design.colors.primary}}`
  — useful for inline color attributes that can't use CSS variables.

---

## 7. Multi-source dashboard

The full canvakit value-add: one template, multiple sources of different kinds,
parallel resolution, partial degradation. Plus the `_data` rehydration primitive
so the browser can layer interactivity without re-fetching.

`q2-status.canvakit.html`

```html
---
schema: canvakit/v1
template: true
name: q2-status
version: 1.0.0
description:
  Q2 status canvas — MRR (tool), open deals (tool), task rollup (query), pricing
  snapshot (file), brand block (static).
renderer: mustache
refreshEvery: 10m
design: dk:heritage
variables:
  period: { type: string, default: "Q2 2026" }
  user_id: { type: string, required: true }
sources:
  brand:
    kind: static
    value: { name: "Acme", motto: "Build fewer, build deeper." }
  user:
    kind: tool
    ref: get-user
    params: { id: "{{user_id}}" }
  mrr:
    kind: tool
    ref: stripe.mrr
    params: { period: "{{period}}" }
  deals:
    kind: tool
    ref: crm.deals.open
    params: { ownerId: "{{user_id}}" }
  tasks:
    kind: query
    include: /tasks/**/*.md
    where: { status: todo }
    sort: -priority
    limit: 10
    fields: [title, priority, assignee]
  pricing:
    kind: file
    path: /data/pricing.csv
tags: [dashboard, multi-source, q2]
---

<!doctype html>
<html>
  <head>
    <title>{{brand.name}} — {{period}} status</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        background: var(--color-background, #fdfcfb);
        color: var(--color-foreground, #1a1a1a);
        font-family: var(--font-body, system-ui, sans-serif);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
      }
      .card {
        padding: 1rem;
        border: 1px solid var(--color-border, #ddd);
      }
      .big {
        font-size: 2rem;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>{{brand.name}} — {{period}}</h1>
      <p>{{brand.motto}}</p>
      <p>Owner: {{user.name}}.</p>
    </header>

    <section class="grid">
      <div class="card">
        <h2>MRR</h2>
        <p class="big">${{mrr.amountUsd}}</p>
        <p>{{mrr.deltaPct}}% vs prior period.</p>
      </div>

      <div class="card">
        <h2>Open deals</h2>
        <p class="big">{{deals.count}}</p>
        <ul>
          {{#deals.items}}
          <li>{{name}} — ${{amount}} ({{stage}})</li>
          {{/deals.items}}
        </ul>
      </div>

      <div class="card">
        <h2>Top tasks</h2>
        <ul>
          {{#tasks}}
          <li>
            <a href="/{{path}}">{{data.title}}</a>
            — p{{data.priority}} {{#data.assignee}}({{.}}){{/data.assignee}}
          </li>
          {{/tasks}}
        </ul>
      </div>

      <div class="card">
        <h2>Pricing</h2>
        <table>
          <thead>
            <tr>
              {{#pricing.columns}}
              <th>{{.}}</th>
              {{/pricing.columns}}
            </tr>
          </thead>
          <tbody>
            {{#pricing.rows}}
            <tr>
              <td>{{name}}</td>
              <td>${{price_usd}}</td>
            </tr>
            {{/pricing.rows}}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      <small>Rendered {{$meta.renderedAt}}.</small>
    </footer>

    <script id="canvas-data" type="application/json">
      {{{_data}}}
    </script>

    <script type="module">
      // Browser-side hydration. Same context the server saw —
      // no re-fetch, no duplicate logic.
      const ctx = JSON.parse(document.getElementById("canvas-data").textContent)
      // ctx.deals.items, ctx.tasks, ctx.pricing.rows are all typed
      // exactly as the server resolved them. Build sparklines,
      // filter tables, animate counters here.
    </script>
  </body>
</html>
```

Notes:

- All five non-static sources resolve in parallel. If `crm.deals.open` errors,
  `deals` becomes `null` (status `error`) — the rest of the page still renders.
  The host SHOULD surface the per-source statuses to the author.
- `tasks` uses the `[{ path, data }]` shape — fields are `data.title`,
  `data.priority`, `data.assignee`. Don't reach for `data.frontmatter.*`.
- `_data` carries the full context as `<script>`-safe JSON. Stray `<` characters
  in string values are pre-escaped (`<`) so a `</script>` sequence in a string
  field can't break out of the script tag. The browser parses it once and
  rehydrates whatever interactive bits the page wants.
- The CSS uses `var(--color-*, <fallback>)` references — when the designkit
  bridge is wired, the injected `:root` supplies values; when not, the fallbacks
  render the page in its default palette.

---

## Anti-patterns to avoid

- **Reading frontmatter under `data.frontmatter` in a `query`** iteration.
  Frontmatter flattens on `data`. Use `data.title`, not
  `data.frontmatter.title`.
- **Double-brace for imported bodies.** `{{imports.header}}` HTML-escapes the
  rendered HTML — use `{{{imports.header}}}`.
- **Cross-source references in `params`.** Sources resolve in parallel, so
  `sources.b.params.x: "{{a.value}}"` is a race. Substitution happens
  against `variables` only — pass the value through a variable instead.
- **Body-level `:root { --color-* }` blocks** when the designkit bridge is also
  injecting one. The cascade lets the body win; use inline
  `var(--color-x, <fallback>)` instead.
- **Omitting `template: true`** to make a "draft" template. The marker is the
  registry's "this is loadable" check; without it hosts warn and best-effort
  render.
- **Wide `kind: tool` `ref: "*"` patterns.** Tool refs are exact flat ids,
  namespaced strings, or MCP URIs — never globs.

## See also

- [AIP-5 — CANVAKIT.md spec](/docs/aip-5)
- [AIP-4 — DESIGN.md spec](/docs/aip-4) — designkit bridge details
- [AIP-14 — TOOL.md spec](/docs/aip-14) — defining the tools `kind: tool`
  resolves against
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./TEMPLATE.schema.json`](./TEMPLATE.schema.json) — frontmatter validator
