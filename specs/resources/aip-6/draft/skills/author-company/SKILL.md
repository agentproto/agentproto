---
schema: skills/v1
name: author-company
title: Author an agentcompanies/v1 workspace (AIP-6)
description:
  Walk through producing a valid agentcompanies/v1 workspace — COMPANY.md plus
  role and objective doctypes — with cross-references resolved and validated.
version: 1.0.0
tags: [aip-6, companies, roles, objectives, authoring, manifest, agentproto]
inputs:
  - name: pitch
    type: string
    required: true
    description:
      One-paragraph description of the company. The skill turns this into
      mission, structure, and a starter set of roles + objectives.
  - name: shape
    type: string
    required: false
    description:
      Org shape hint. Accepts "solo", "two-role", "tree". Defaults to "solo"
      unless the pitch implies more.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to an empty folder to author into. If omitted, the skill
      produces a new folder under `./<company-slug>/`.
examples:
  - input:
      pitch: A solo founder running a SaaS pricing-intelligence service.
      shape: solo
    output:
      - pricewatch/COMPANY.md
      - pricewatch/roles/founder/ROLE.md
      - pricewatch/objectives/q3-pipeline/OBJECTIVE.md
---

# Author an agentcompanies/v1 workspace (AIP-6)

Use this skill when the user asks to **define, draft, or scaffold a company** as
a portable file-format package. The skill produces a valid
[AIP-6 agentcompanies/v1](/docs/aip-6) workspace — the `COMPANY.md` root plus
one folder per role and per objective. Every doctype is a markdown file with
YAML frontmatter; references between them are slug-based; the result is a
git-native package any conforming adapter can load.

## When to use

- "Define our company as a file-format package."
- "Draft the org structure for a two-person agency."
- "Scaffold the roles and objectives for our marketing pod."
- "Express this team's reporting tree as agentcompanies/v1."

## When NOT to use

- The user wants a **single role's prompt** with no surrounding org structure →
  they want an operator definition (AIP-8), not a company.
- The user wants **governance policies** (caps, approvals, audit) → use AIP-7
  once the company doctypes exist.
- The user wants to **call** an existing company package — no authoring needed.

## Process

Eight steps. The order matters: identity first, then mission, then structure,
then objectives, then references, then validation. Skip the cross-reference step
and you ship a workspace whose roles point at objectives that don't exist.

### 1. Fix the company identity

- Pick `id`: kebab-case, 2–64 chars, recognisable as the company's short handle
  (`pricewatch`, not `company-1`). The `id` is the folder name.
- Write `name`: the human display name.
- Pick a one-paragraph `description`. Address it to a reader who has never heard
  of the company.

The folder layout from this point on is fixed:

```
<company-slug>/
  COMPANY.md
  roles/
    <role-slug>/ROLE.md
  objectives/
    <objective-slug>/OBJECTIVE.md
```

Any extra files (READMEs, prompts, fixtures) live alongside but are not
normative.

### 2. Write the mission, values, and tone

Inside `COMPANY.md` frontmatter:

- `mission`: one paragraph. Read by every operator at boot — keep it tight.
- `values`: 3–6 short statements. Surfaced in role prompts.
- `description`: human-facing summary, longer than `mission`.

Rules:

- No vendor names in the mission. The company package is portable; bake-in to a
  vendor breaks portability.
- Mission text is the **shared substrate** every role inherits. Per-role tone
  goes in the role file, not here.

### 3. Pick the structure

Decide the org shape before writing role files. Three common shapes:

| Shape    | When                                           | Example                           |
| -------- | ---------------------------------------------- | --------------------------------- |
| Solo     | One operator wears every hat.                  | A founder running a side project. |
| Two-role | Founder + ops, or maker + seller.              | Most early-stage agencies.        |
| Tree     | Multiple roles with explicit reports-to edges. | Anything beyond ~3 people.        |

Inside `COMPANY.md`:

```yaml
structure:
  roles: [founder, ops]
  objectives: [q3-pipeline, retention-90]
  reports_to:
    ops: founder
```

Roles not present in `reports_to` are top-level. Roles in `reports_to` MUST
resolve to a slug also listed in `structure.roles`.

### 4. Author each role

For every slug in `structure.roles`, create `roles/<slug>/ROLE.md` with
frontmatter:

```yaml
schema: agentcompanies/v1
doctype: role
id: founder
name: Founder
mandate: >
  Set product direction, own customer relationships above $5K MRR, unblock other
  roles. Hand off to ops once a process is recurring.
reports_to: ~ # top-level — omit or use ~
scope:
  owns: ["product-direction", "enterprise-customers"]
  capabilities: ["product.write", "customers.write"]
objectives: [q3-pipeline]
tools: [pricing-snapshot, send-email-brevo]
workflows: [contract-send]
```

Required fields: `schema`, `doctype: role`, `id`, `name`, `mandate`.

Conventions:

- `mandate` is the **bounded-autonomy contract**. Read by the governance layer
  (AIP-7) when sizing approvals. Write it intentionally.
- `scope.owns` is free-text, intentionally informal — names of resources the
  role is accountable for.
- `scope.capabilities` is structured — slugs the AIP-7 capability registry
  recognises. Keep narrow.
- `tools` and `workflows` reference the host's [AIP-14 TOOL.md](/docs/aip-14)
  and [AIP-15 WORKFLOW.md](/docs/aip-15) catalogs by slug. Adapter resolves;
  unresolved slugs error.

### 5. Author each objective

For every slug in `structure.objectives` (and any sub-objectives roles list
under `objectives`), create `objectives/<slug>/OBJECTIVE.md`:

```yaml
schema: agentcompanies/v1
doctype: objective
id: q3-pipeline
name: Q3 Pipeline
statement: >
  Close $250K of new MRR by Sept 30, with at least 3 logos above $5K MRR.
owner: founder
horizon: quarter
status: active
key_results:
  - id: kr-mrr
    statement: New MRR closed
    target: "$250K"
  - id: kr-logos
    statement: Logos above $5K MRR
    target: "3"
```

Required fields: `schema`, `doctype: objective`, `id`, `name`, `statement`.

Conventions:

- `owner` MUST be a role slug that exists in the company.
- `horizon` is informational; use `ongoing` for objectives without a fixed end
  date.
- `key_results[]` is optional but encouraged. Each KR has its own `id`
  (kebab-case, scoped to the objective) so progress updates can reference it
  stably.
- For decomposition, set `parent: <slug>` on the child and list
  `children: [<slugs>]` on the parent. The adapter validates the edges agree
  both directions.

### 6. Cross-reference and link

Every reference between doctypes is a **slug**. Adapter rules:

| From           | Field                                | Resolves to                                |
| -------------- | ------------------------------------ | ------------------------------------------ |
| `COMPANY.md`   | `structure.roles[]`                  | `roles/<slug>/ROLE.md`                     |
| `COMPANY.md`   | `structure.objectives[]`             | `objectives/<slug>/OBJECTIVE.md`           |
| `COMPANY.md`   | `structure.reports_to.<k>` and `<v>` | both must be in `structure.roles`          |
| `ROLE.md`      | `reports_to`                         | a sibling role's slug                      |
| `ROLE.md`      | `objectives[]`                       | `objectives/<slug>/OBJECTIVE.md`           |
| `OBJECTIVE.md` | `owner`                              | a role's slug                              |
| `OBJECTIVE.md` | `parent` / `children[]`              | other objectives — edges MUST be symmetric |

Walk every reference before declaring the workspace done. A dangling slug is a
spec bug.

### 7. Imports (optional)

To pull a role or objective from a registry, declare under `COMPANY.md`'s
`imports[]`:

```yaml
imports:
  - from: "open-companies/marketing@^1.0.0"
    as: role
    id: marketer
  - from: "open-companies/standard-okrs@^1.0.0"
    as: objective
    id: nps-90
```

The adapter resolves `from` against its package registry, materialises the
doctype into the local workspace under `roles/<id>/ROLE.md` (or objective
equivalent), and treats it identically to a hand-authored doctype after that.
Use `alias` if a local slug would collide.

### 8. Validate

Validate every doctype against [`./COMPANY.schema.json`](./COMPANY.schema.json):

```bash
# Validate the root
npx ajv validate -s ./COMPANY.schema.json -d <pkg>/COMPANY.md

# Validate every role and objective
find <pkg>/roles      -name 'ROLE.md'      -exec npx ajv validate -s ./COMPANY.schema.json -d {} \;
find <pkg>/objectives -name 'OBJECTIVE.md' -exec npx ajv validate -s ./COMPANY.schema.json -d {} \;
```

Then run the **cross-reference check** (your adapter's `validate` helper — see
[`./ADAPTER.md`](./ADAPTER.md)). Specifically check:

- Every slug in `structure.roles` resolves to a `ROLE.md`.
- Every slug in `structure.objectives` resolves to an `OBJECTIVE.md`.
- Every `reports_to` value is a known role.
- Every `objective.owner` is a known role.
- Every `objective.parent` ↔ `objective.children` edge is symmetric.
- No role lists an objective that doesn't list it as `owner` (warn, don't error
  — multi-role objectives are allowed).

Fix every error before declaring success.

## Output

Produce a folder tree:

```
<company-slug>/
  COMPANY.md
  roles/
    <role-slug>/ROLE.md
    ...
  objectives/
    <objective-slug>/OBJECTIVE.md
    ...
```

Reply to the user with:

1. The folder you wrote to.
2. An ASCII tree of the org (roles + reports_to edges) so they can verify the
   structure.
3. A list of objectives with their owners, so they can verify accountability.
4. **Open assumptions** — fields you guessed defaults for that the user might
   want to override (`horizon: quarter`, default `capabilities` per role, etc.).

Do NOT install or instantiate the company yourself. Authoring ends with the
files written; instantiation (per AIP-8) is a separate step.

## See also

- [AIP-6 — agentcompanies/v1 spec](/docs/aip-6)
- [AIP-7 — governance, capabilities, approval](/docs/aip-7)
- [AIP-8 — agencies engine, operator instances](/docs/aip-8)
- [AIP-14 — TOOL.md spec](/docs/aip-14) — referenced from `role.tools`
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15) — referenced from `role.workflows`
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspaces (solo, two-role, tree,
  decomposed objectives, imports, fork)
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
