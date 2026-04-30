# ADAPTER.md — implementing AIP-6 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, validate, and project** AIP-6
[`agentcompanies/v1`](/docs/aip-6) workspaces into its own representation. It is
normative for parts marked MUST and informative for parts marked SHOULD.

The audience is a host author — someone exposing `defineCompany`, `defineRole`,
and `defineObjective` to authors, or projecting filesystem packages into a
vendor-specific catalog. Authors themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when an
`agentcompanies/v1` workspace is registered:

1. **Discover** — walk the workspace root, locate `COMPANY.md`, and enumerate
   `roles/*/ROLE.md` and `objectives/*/OBJECTIVE.md`.
2. **Parse and validate** — for each doctype, parse YAML frontmatter, validate
   against [`./COMPANY.schema.json`](./COMPANY.schema.json), surface schema
   errors with file + field path.
3. **Resolve cross-references** — walk every slug edge between doctypes, fail
   loudly on dangling or asymmetric references.
4. **Project** — wire the validated company graph into the host's internal
   representation (DB rows, in-memory catalog, runtime bundle). Handle imports,
   snapshots, and diffs.

The three signatures `defineCompany`, `defineRole`, and `defineObjective` are
the boundary between the host and authors who work in code rather than markdown.
The host MAY internally translate to its own types after the call, but the
canonical names MUST be present.

## Filesystem layout

The layout is normative. A host MUST recognise:

```
<workspace-root>/
  COMPANY.md                            # exactly one
  roles/
    <slug>/ROLE.md                      # one folder per role
  objectives/
    <slug>/OBJECTIVE.md                 # one folder per objective
  operators/                            # optional; AIP-8 territory
    <slug>/OPERATOR.md
```

Rules:

- The folder name under `roles/` and `objectives/` MUST equal the doctype's `id`
  field. Mismatch is a spec bug surfaced at validation.
- Files outside this layout (READMEs, prompts, fixtures) are ignored. They are
  non-normative and the host MUST tolerate them.
- A workspace without `COMPANY.md` is not an `agentcompanies/v1` package. The
  host MUST refuse with a clear error.

## Doctype loader rules

Each doctype file is a markdown document with YAML frontmatter delimited by
`---` lines. The host's loader MUST:

1. **Strip the frontmatter** — everything between the first `---` pair. Body
   markdown is informational unless the host explicitly surfaces it (operator
   prompts, audit views).
2. **Parse YAML strictly** — duplicate keys, tab indentation, and non-string
   keys SHOULD all error rather than silently succeed.
3. **Check `schema: agentcompanies/v1`** — refuse files lacking the identifier.
   The schema field is the format-discriminator at the filesystem level.
4. **Discriminate on `doctype`** — pick the right `oneOf` branch under
   `COMPANY.schema.json`.
5. **Validate folder name vs `id`** — `<root>/roles/<x>/ROLE.md` MUST have
   `id: <x>`. Mismatches are spec bugs.

The body of the markdown file is non-normative: hosts MAY surface it as a
description or operator prompt, but the structural truth lives in the
frontmatter.

## `defineCompany` — code-first authoring

A host that supports code-first authoring MUST expose `defineCompany`,
`defineRole`, and `defineObjective` returning the same shapes the schema
validates. Round-tripping (code → markdown → code) MUST yield identical
structures.

```ts
import { defineCompany, defineRole, defineObjective } from "<host-runtime>"

const founder = defineRole({
  id: "founder",
  name: "Founder",
  mandate: "Set product direction…",
  scope: { capabilities: ["product.write"] },
  objectives: ["q3-pipeline"],
})

const q3Pipeline = defineObjective({
  id: "q3-pipeline",
  name: "Q3 Pipeline",
  statement: "Close $250K of new MRR by Sept 30…",
  owner: "founder",
  horizon: "quarter",
})

export default defineCompany({
  id: "pricewatch",
  name: "Pricewatch",
  mission: "Track public SaaS pricing for our customers.",
  structure: {
    roles: [founder],
    objectives: [q3Pipeline],
  },
})
```

Required behaviour:

1. **Each function returns a plain value**, not a side-effect. Registration is a
   separate step.
2. **`defineCompany` MUST validate the graph** at call time: role slugs unique,
   objective slugs unique, every `reports_to`, `owner`, `parent`, `children`
   reference resolves.
3. **Refuse on schema mismatch** — the in-code shape MUST match what
   `COMPANY.schema.json` accepts. Drift is a spec bug.

Hosts MAY re-export under language-idiomatic aliases (`createCompany`,
`company`, etc.); the canonical names MUST be present.

## Cross-reference resolution

After all doctypes parse, the host MUST walk every slug edge:

| From           | Field                      | Resolves to                             | On miss                    |
| -------------- | -------------------------- | --------------------------------------- | -------------------------- |
| `COMPANY.md`   | `structure.roles[i]`       | `roles/<slug>/ROLE.md` exists           | error                      |
| `COMPANY.md`   | `structure.objectives[i]`  | `objectives/<slug>/OBJECTIVE.md` exists | error                      |
| `COMPANY.md`   | `structure.reports_to.<k>` | `<k>` ∈ `structure.roles`               | error                      |
| `COMPANY.md`   | `structure.reports_to.<v>` | `<v>` ∈ `structure.roles`, no cycle     | error                      |
| `ROLE.md`      | `reports_to`               | a known role slug                       | error                      |
| `ROLE.md`      | `objectives[i]`            | a known objective slug                  | error                      |
| `ROLE.md`      | `tools[i]`                 | host's TOOL.md catalog                  | warn (resolved at runtime) |
| `ROLE.md`      | `workflows[i]`             | host's WORKFLOW.md catalog              | warn (resolved at runtime) |
| `OBJECTIVE.md` | `owner`                    | a known role slug                       | error                      |
| `OBJECTIVE.md` | `parent` / `children[]`    | known objective slugs, edges symmetric  | error                      |
| `OBJECTIVE.md` | `depends_on[]`             | known objective slugs, no cycle         | error                      |

Cycle detection runs on:

- `reports_to` (role tree),
- `parent`/`children` (objective tree),
- `depends_on` (objective DAG).

A cycle is always a spec bug.

The tool/workflow registry references are intentionally _warnings_ at
company-load time — the host's TOOL/WORKFLOW catalog may not yet be populated.
They become errors at operator-instantiation time (AIP-8).

## Imports

`COMPANY.md`'s `imports[]` lets a workspace pull a role or objective from a
registry:

```yaml
imports:
  - from: "open-companies/marketing@^1.0.0"
    as: role
    id: marketer
```

The host's resolver:

1. **Reads `from`** — registry refs use the format
   `<registry>/<package>@<version>`; relative paths use filesystem-native
   syntax. The host's package registry is out-of-scope for this spec — any
   resolver that returns a doctype matching the requested `as` is conformant.
2. **Materialises the doctype** under `roles/<id>/ROLE.md` (or objective
   equivalent). The materialised file is otherwise treated identically to a
   hand-authored doctype.
3. **Records provenance** in the materialised file's
   `metadata.import = { from, version, resolved_at }`. The adapter's snapshot
   uses this for diff.
4. **Honours `alias`** to avoid slug collisions.

Imported doctypes MUST validate the same as local ones — the registry isn't a
bypass.

## Snapshot and diff

A snapshot is a deterministic, content-addressed projection of the workspace.
The host SHOULD provide a `snapshot(workspace)` helper that:

1. Walks doctypes in canonical order: `COMPANY.md`, then `ROLE.md`s ordered by
   `id`, then `OBJECTIVE.md`s ordered by `id`.
2. Normalises whitespace and key order in each frontmatter block.
3. Hashes each doctype content; aggregates hashes into a workspace hash.
4. Records imports with their resolved versions.

`diff(snapA, snapB)` returns a structured change-set:

| Change                   | Surface                       |
| ------------------------ | ----------------------------- |
| `doctype-added`          | id, doctype, hash             |
| `doctype-removed`        | id, doctype, prior hash       |
| `doctype-modified`       | id, doctype, field-level diff |
| `import-version-changed` | id, from-version, to-version  |
| `structure-edge-changed` | edge, before, after           |

This is the standard "what changed?" handshake — adapters use it for audit,
branch comparison (forks), and migration planning.

## Error envelope

All validation errors leave the host as:

```ts
type CompanyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        file?: string
        field?: string
        cause?: unknown
      }
    }
```

`code` SHOULD use the AIP-6 vocabulary:

- `schema_invalid` — frontmatter failed JSON Schema validation.
- `doctype_unknown` — `doctype` value not recognised.
- `slug_collision` — two doctypes share an `id`.
- `slug_unresolved` — a reference points to a non-existent slug.
- `edge_asymmetric` — `parent`/`children` disagree.
- `cycle_detected` — `reports_to` / `parent` / `depends_on` has a cycle.
- `import_unresolved` — registry resolver failed.
- `folder_id_mismatch` — `<slug>` folder name ≠ `id` field.

Domain-specific codes (vendor extensions) use a colon prefix
(`<vendor>:<code>`), never an underscore — same convention as AIP-14.

`file` and `field` together let editor tooling jump to the offending location.

## Vendor extensions

Per the spec, vendor-specific fields live under `metadata.<vendor>.*`:

```yaml
metadata:
  acme:
    legal_entity_id: "acme-llc-2026"
    cost_center: "ENG-04"
```

Adapter rules:

- **Unknown `metadata.*` keys MUST be tolerated.** Strict unknown-key rejection
  breaks portability.
- The adapter MAY surface its own `metadata.<self>.*` enrichments during
  projection (resolved DB IDs, denormalised fields). These fields MUST be
  re-strippable to round-trip back to filesystem.

## Multi-language hosts

| Language                | Function names                                      |
| ----------------------- | --------------------------------------------------- |
| TypeScript / JavaScript | `defineCompany`, `defineRole`, `defineObjective`    |
| Python                  | `define_company`, `define_role`, `define_objective` |
| Go                      | `DefineCompany`, `DefineRole`, `DefineObjective`    |
| Rust                    | `define_company` (free fns) or `Company::define`    |

The filesystem layout is identical across languages. A polyglot workspace is
allowed: the markdown files are language-agnostic; only code-first authoring
entries are language-specific.

## Registration test

A conforming host SHOULD provide a `validate(workspacePath)` helper that:

1. Locates `COMPANY.md`; refuses if absent.
2. Validates every doctype against `COMPANY.schema.json`.
3. Resolves every cross-reference (the table above).
4. Detects cycles in `reports_to`, `parent`/`children`, `depends_on`.
5. Resolves every import and validates the materialised doctype.
6. Confirms folder names match `id` fields.
7. Reports the first failure with `file` + `field` path.

This is the standard "is this workspace installable?" handshake.

## What this guide does NOT cover

- The host's persistence backend (filesystem-backed, database-projected,
  in-memory).
- Operator instantiation (per [AIP-8](/docs/aip-8)).
- Governance enforcement (per [AIP-7](/docs/aip-7)) — the company package
  declares `capabilities`; the governance layer enforces them.
- The host's UI for authoring or browsing companies.
- Multi-tenant isolation, quotas, billing.

These are runtime-policy concerns and stay out of the spec on purpose.

## See also

- [AIP-6 — agentcompanies/v1 spec](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-8 — agencies engine, operators](/docs/aip-8)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspaces
