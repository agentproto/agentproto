# ADAPTER.md — implementing AIP-6 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, validate, and project** AIP-6
[`company/v1`](/docs/aip-6) workspaces into its own representation. It is
normative for parts marked MUST and informative for parts marked SHOULD.

The audience is a host author: someone exposing `defineCompany` and
`defineObjective` to authors, or projecting filesystem packages into a
vendor-specific catalog. Roles are not an AIP-6 doctype: a host loads
`roles/<id>/ROLE.md` through [AIP-47](/docs/aip-47), and the seats, holders and
reporting lines through the [AIP-22](/docs/aip-22) office. Authors themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when an
`company/v1` workspace is registered:

1. **Discover** — walk the workspace root, locate `COMPANY.md`, and enumerate
   `objectives/*/OBJECTIVE.md`. `roles/*/ROLE.md` is enumerated too but handed
   to the AIP-47 loader.
2. **Parse and validate**: for each AIP-6 doctype, parse YAML frontmatter,
   validate against [`./COMPANY.schema.json`](./COMPANY.schema.json), surface
   schema errors with file + field path.
3. **Resolve cross-references** — walk every slug edge between doctypes, fail
   loudly on dangling or asymmetric references.
4. **Project** — wire the validated company graph into the host's internal
   representation (DB rows, in-memory catalog, runtime bundle). Handle imports,
   snapshots, and diffs.

The two signatures `defineCompany` and `defineObjective` are the boundary
between the host and authors who work in code rather than markdown. The host
MAY internally translate to its own types after the call, but the canonical
names MUST be present. `defineRole` is not an AIP-6 signature any more: it
belongs to the AIP-47 host (see "`defineCompany` and code-first authoring").

## Filesystem layout

The layout is normative. A host MUST recognise:

```
<workspace-root>/
  COMPANY.md                            # exactly one
  roles/
    <id>/ROLE.md                        # AIP-47 role/v1, one folder per role
  objectives/
    <id>/OBJECTIVE.md                   # one folder per objective
  operators/                            # optional; AIP-9 territory
    <id>/OPERATOR.md
```

Rules:

- The folder name under `objectives/` MUST equal the objective's resolved
  identifier (`id`, or `slug` when only the alias is present). The folder name
  under `roles/` MUST equal the AIP-47 role's `name`. Mismatch is a spec bug
  surfaced at validation.
- Files outside this layout (READMEs, prompts, fixtures) are ignored. They are
  non-normative and the host MUST tolerate them.
- A workspace without `COMPANY.md` is not an `company/v1` package. The
  host MUST refuse with a clear error.

## Doctype loader rules

Each doctype file is a markdown document with YAML frontmatter delimited by
`---` lines. The host's loader MUST:

1. **Strip the frontmatter** — everything between the first `---` pair. Body
   markdown is informational unless the host explicitly surfaces it (operator
   prompts, audit views).
2. **Parse YAML strictly** — duplicate keys, tab indentation, and non-string
   keys SHOULD all error rather than silently succeed.
3. **Check `schema`**: `company/v1` files go to this loader. A file under
   `roles/` with `schema: role/v1` goes to the AIP-47 loader. A file under
   `roles/` with `schema: company/v1` and `doctype: role` is a legacy role
   file: the host MAY read it, SHOULD warn `doctype_moved`, and MUST NOT
   validate it against `COMPANY.schema.json`.
4. **Resolve the aliases**: read `doctype` or, when absent, `kind`; read `id`
   or, when absent, `slug`. Both spellings are accepted permanently, AIP-6 sets
   no removal date. If a file carries an alias and its canonical field with
   different values, refuse it with `alias_conflict`. The schema checks this
   for `doctype`/`kind`; the host checks it for `id`/`slug`.
5. **Discriminate on the resolved doctype**: pick the right `oneOf` branch
   under `COMPANY.schema.json`.
6. **Validate folder name vs identifier**: `<root>/objectives/<x>/OBJECTIVE.md`
   MUST resolve to identifier `<x>`. Mismatches are spec bugs.

Writers emit `doctype` and `id`. A host that rewrites a file MAY keep the
alias spelling it found, or normalise to the canonical one; it MUST NOT emit
both with different values.

The body of the markdown file is non-normative: hosts MAY surface it as a
description or operator prompt, but the structural truth lives in the
frontmatter.

## `defineCompany` and code-first authoring

A host that supports code-first authoring MUST expose `defineCompany` and
`defineObjective` returning the same shapes the schema validates.
Round-tripping (code → markdown → code) MUST yield identical structures.

```ts
import { defineCompany, defineObjective } from "<host-runtime>"

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
    objectives: [q3Pipeline],
  },
})
```

The `founder` seat is not declared here. It is an item of the company's
[AIP-22](/docs/aip-22) office, and the role it holds is an
[AIP-47](/docs/aip-47) `role/v1` document. A host that offers a `defineRole`
helper takes it from the AIP-47 contract, not from this one.

Required behaviour:

1. **Each function returns a plain value**, not a side-effect. Registration is a
   separate step.
2. **`defineCompany` MUST validate the graph** at call time: objective
   identifiers unique, every `parent`, `children` reference resolves, and every
   `owner` resolves to a position of the office or to a role.
3. **Refuse on schema mismatch** — the in-code shape MUST match what
   `COMPANY.schema.json` accepts. Drift is a spec bug.
4. **Accept both spellings**: an input carrying `kind` or `slug` is accepted
   with the same meaning as `doctype` or `id`, and the same `alias_conflict`
   rule applies.

Hosts MAY re-export under language-idiomatic aliases (`createCompany`,
`company`, etc.); the canonical names MUST be present.

## Cross-reference resolution

After all doctypes parse, the host MUST walk every slug edge:

| From           | Field                      | Resolves to                                             | On miss |
| -------------- | -------------------------- | ------------------------------------------------------- | ------- |
| `COMPANY.md`   | `structure.objectives[i]`  | `objectives/<id>/OBJECTIVE.md` exists                   | error   |
| `COMPANY.md`   | `structure.positions[i]`   | a seat of the AIP-22 office, or a seed when none exists | warn    |
| `COMPANY.md`   | `structure.reports_to.<k>` | deprecated; same rule as `structure.positions`          | warn    |
| `OBJECTIVE.md` | `owner`                    | a position of the office, or an AIP-47 role             | error   |
| `OBJECTIVE.md` | `parent` / `children[]`    | known objective identifiers, edges symmetric            | error   |
| `OBJECTIVE.md` | `depends_on[]`             | known objective identifiers, no cycle                   | error   |

`structure.roles` is the older spelling of `structure.positions` and is read
the same way. Both are deprecated and accepted permanently. When the company has
an office, the office wins: a conflict between the seed and the office is
resolved in favour of the office, and the host SHOULD warn.

Everything that belongs to a role (`reports_to`, `tools`, `workflows`,
`objectives`) is resolved by the AIP-47 loader, and the reporting lines of
seats by the AIP-22 office. AIP-6 no longer walks those edges.

Cycle detection runs on:

- `parent`/`children` (objective tree),
- `depends_on` (objective DAG).

A cycle is always a spec bug.

## Imports

`COMPANY.md`'s `imports[]` lets a workspace pull a role or objective from a
registry:

```yaml
imports:
  - from: "open-companies/marketing@^1.0.0"
    as: role
    id: marketer
```

The `as: role` form materialises an AIP-47 `role/v1` document. The host's
resolver:

1. **Reads `from`** — registry refs use the format
   `<registry>/<package>@<version>`; relative paths use filesystem-native
   syntax. The host's package registry is out-of-scope for this spec — any
   resolver that returns a doctype matching the requested `as` is conformant.
2. **Materialises the document** under `roles/<id>/ROLE.md` (an AIP-47
   `role/v1` file) or `objectives/<id>/OBJECTIVE.md`. The materialised file is otherwise treated identically to a
   hand-authored doctype.
3. **Records provenance** in the materialised file's
   `metadata.import = { from, version, resolved_at }`. The adapter's snapshot
   uses this for diff.
4. **Honours `alias`** to avoid slug collisions.

Imported documents MUST validate the same as local ones: the registry isn't a
bypass. An imported role is validated by the AIP-47 schema, an imported
objective by `COMPANY.schema.json`.

## Snapshot and diff

A snapshot is a deterministic, content-addressed projection of the workspace.
The host SHOULD provide a `snapshot(workspace)` helper that:

1. Walks documents in canonical order: `COMPANY.md`, then `ROLE.md`s ordered by
   `name`, then `OBJECTIVE.md`s ordered by identifier.
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
- `doctype_unknown`: `doctype` (or `kind`) value not recognised.
- `alias_conflict`: a file carries `doctype` and `kind`, or `id` and `slug`,
  with different values.
- `doctype_moved`: warning: a `doctype: role` file under `schema: company/v1`.
  The role now lives in AIP-47.
- `slug_collision`: two doctypes share an identifier.
- `slug_unresolved` — a reference points to a non-existent slug.
- `edge_asymmetric` — `parent`/`children` disagree.
- `cycle_detected` — `reports_to` / `parent` / `depends_on` has a cycle.
- `import_unresolved` — registry resolver failed.
- `folder_id_mismatch`: `<id>` folder name ≠ the resolved identifier.

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

| Language                | Function names                          |
| ----------------------- | --------------------------------------- |
| TypeScript / JavaScript | `defineCompany`, `defineObjective`      |
| Python                  | `define_company`, `define_objective`    |
| Go                      | `DefineCompany`, `DefineObjective`      |
| Rust                    | `define_company` (free fns) or `Company::define` |

The filesystem layout is identical across languages. A polyglot workspace is
allowed: the markdown files are language-agnostic; only code-first authoring
entries are language-specific.

## Registration test

A conforming host SHOULD provide a `validate(workspacePath)` helper that:

1. Locates `COMPANY.md`; refuses if absent.
2. Validates every AIP-6 doctype against `COMPANY.schema.json`, and every
   `roles/*/ROLE.md` through the AIP-47 loader.
3. Resolves every cross-reference (the table above).
4. Detects cycles in `parent`/`children` and `depends_on`.
5. Resolves every import and validates the materialised document.
6. Confirms folder names match the resolved identifiers.
7. Reports the first failure with `file` + `field` path.

This is the standard "is this workspace installable?" handshake.

## What this guide does NOT cover

- The host's persistence backend (filesystem-backed, database-projected,
  in-memory).
- The role schema ([AIP-47](/docs/aip-47)) and the office, seats and holders
  ([AIP-22](/docs/aip-22)).
- Projects and their boards ([AIP-20](/docs/aip-20)), reached through
  [AIP-34](/docs/aip-34) nodes.
- Operator instantiation (per [AIP-8](/docs/aip-8) and [AIP-9](/docs/aip-9)).
- Governance enforcement (per [AIP-7](/docs/aip-7)) — the company package
  declares `capabilities`; the governance layer enforces them.
- The host's UI for authoring or browsing companies.
- Multi-tenant isolation, quotas, billing.

These are runtime-policy concerns and stay out of the spec on purpose.

## See also

- [AIP-6 — company/v1 spec](/docs/aip-6)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-8 — agencies engine, operators](/docs/aip-8)
- [AIP-9: operators](/docs/aip-9)
- [AIP-20: WORK.md](/docs/aip-20)
- [AIP-22: office and seats](/docs/aip-22)
- [AIP-34: workspace tree](/docs/aip-34)
- [AIP-47: ROLE.md](/docs/aip-47)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspaces
