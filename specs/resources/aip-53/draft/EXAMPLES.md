# EXAMPLES.md — AIP-53 app/v1 in practice

Worked examples for the surfaces this AIP fixes. Every example round-trips
against [`./APP.schema.json`](./APP.schema.json) and the reference
implementation (`packages/app-kit`, `packages/runtime`).

## 1. A UI-only app (empty `agents`, `ui` present)

The conformance rule legalised in the spec: `agents` MUST be non-empty
UNLESS `ui` is present. This is how the five daemon builtin panels ship
(`packages/apps/src/index.ts:14-20` — `agents: []`, UI-only).

```md
---
schema: app/v1
id: '@acme/pipeline-dashboard'
name: Pipeline Dashboard
version: 0.1.0
agents: []
ui:
  path: .agentproto/ui/index.html
  title: Pipeline Dashboard
  tools:
    - app_list
    - app_status
    - app_data_read
    - app_data_write
---

Live view of pipeline runs, backed entirely by the app data plane.
```

- `defineApp({ agents: [], ui: { html: "<html>…" } })` constructs — no error.
- `defineApp({ agents: [] })` (no `ui`) throws; so does `defineApp({})`.
- A UI-only app bundles zero workflows: a bundled workflow with no
  referencing agent would be an orphan (attachment invariant, rule 3).
- `ui.tools[]` is the UI's entire reach; the host enforces it on every
  call, server-side.

## 2. Declaring a data dir hint

`data` names where the app's durable data lives, relative to the app
dir. It is a hint — an explicit `dataDir` at install time overrides it.

```md
---
schema: app/v1
id: '@acme/trip-planner'
version: 0.1.0
agents:
  - id: '@acme/trip-scout'
    path: .agentproto/agents/trip-scout/AGENT.md
data:
  dir: "data"
category: travel
---
```

`category` is freeform — hosts surface it in catalogs/trees but MUST NOT
validate it against a fixed enum.

## 3. Data-plane addressing under the default layout

With `dataDir = <appDir>/data` (the default), both spellings name the
same file — the legacy `data/` prefix collapses:

| App-relative path | Resolves to |
|---|---|
| `trips/x.json` | `<appDir>/data/trips/x.json` |
| `data/trips/x.json` | `<appDir>/data/trips/x.json` (same file) |
| `../secret` | **rejected** — traversal |
| `/etc/passwd` | **rejected** — absolute |
| `C:temp/x` | **rejected** — drive-letter prefix |
| `docs/link.json` → symlink to `/etc/passwd` | **rejected** — realpath escapes the root |

A path that does not exist under `dataDir` but exists under the app's
source dir (a pre-`dataDir` install) still resolves there — writes
update it in place — and `app_data_list` merges both views, data-dir
entries winning on name clashes.

## 4. An atomic write, observed

`app_data_write { appId, path: "dossiers/42/job.json", content: {...} }`
creates parents, writes `<target>.tmp.<pid>`, then renames it over
`job.json`. A concurrent `app_data_read` sees either the previous
contents or the complete new ones — never a partial file. `.json` paths
are pretty-printed on write and parsed on read (raw text fallback when
the bytes do not parse).
