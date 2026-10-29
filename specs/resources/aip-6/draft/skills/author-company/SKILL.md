---
schema: skill/v1
name: author-company
title: Author a company/v1 workspace (AIP-6)
description:
  Walk through producing a valid company/v1 workspace: COMPANY.md plus
  objectives, with the roles written as AIP-47 role/v1 and the seats left to the
  AIP-22 office, cross-references resolved and validated.
version: 1.1.0
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
      - pricewatch/roles/founder/ROLE.md   # AIP-47 role/v1
      - pricewatch/objectives/q3-pipeline/OBJECTIVE.md
---

# Author a company/v1 workspace (AIP-6)

Use this skill when the user asks to **define, draft, or scaffold a company** as
a portable file-format package. The skill produces a valid
[AIP-6 company/v1](/docs/aip-6) workspace: the `COMPANY.md` root plus one
folder per objective, and one [AIP-47](/docs/aip-47) `ROLE.md` per role. Every
file is a markdown document with YAML frontmatter; references between them are
identifier-based; the result is a git-native package any conforming adapter
can load. AIP-6 is the static profile only: seats, holders and reporting lines
belong to the [AIP-22](/docs/aip-22) office, and projects are
[AIP-20](/docs/aip-20) work reached through [AIP-34](/docs/aip-34) nodes.

## When to use

- "Define our company as a file-format package."
- "Draft the company profile for a two-person agency."
- "Scaffold the roles and objectives for our marketing pod."
- "Express this team's mission and objectives as company/v1."

## When NOT to use

- The user wants a **single role's prompt** with no surrounding org structure →
  they want an operator definition (AIP-8), not a company.
- The user wants **governance policies** (caps, approvals, audit) → use AIP-7
  once the company doctypes exist.
- The user wants to **call** an existing company package — no authoring needed.

## Process

Eight steps. The order matters: identity first, then mission, then shape, then
roles, then objectives, then references, then validation. Skip the
cross-reference step and you ship a workspace whose objectives are owned by
positions that don't exist.

### 1. Fix the company identity

- Pick `id`: kebab-case, 2–64 chars, recognisable as the company's short handle
  (`pricewatch`, not `company-1`). The `id` is the folder name. Write `doctype`
  and `id`; if you edit a file that already says `kind` or `slug`, those are
  accepted permanently (AIP-6 sets no removal date), but never write both
  spellings with different values (`alias_conflict`).
- Write `name`: the human display name.
- Pick a one-paragraph `description`. Address it to a reader who has never heard
  of the company.

The folder layout from this point on is fixed:

```
<company-slug>/
  COMPANY.md
  roles/
    <role-id>/ROLE.md          # AIP-47 role/v1
  objectives/
    <objective-id>/OBJECTIVE.md
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

### 3. Pick the shape

Decide the org shape before writing role files. Three common shapes:

| Shape    | When                                           | Example                           |
| -------- | ---------------------------------------------- | --------------------------------- |
| Solo     | One operator wears every hat.                  | A founder running a side project. |
| Two-role | Founder + ops, or maker + seller.              | Most early-stage agencies.        |
| Tree     | Multiple roles with explicit reports-to edges. | Anything beyond ~3 people.        |

Inside `COMPANY.md` only the objectives are listed:

```yaml
structure:
  objectives: [q3-pipeline, retention-90]
```

Do not write the seats or the reporting lines here. Positions, their holders
and who reports to whom are items of the company's [AIP-22](/docs/aip-22)
office (`OFFICE.md` and its `role` items). `structure.positions`,
`structure.roles` and `structure.reports_to` are still accepted when a file
carries them, but they are deprecated, the office wins, and writers should not
emit them.

Projects are not listed either. A project is an [AIP-34](/docs/aip-34) node of
the company tree whose `work:` field points to an [AIP-20](/docs/aip-20)
`WORK.md`.

### 4. Author each role

A role is an [AIP-47](/docs/aip-47) document, not an AIP-6 doctype. Create
`roles/<id>/ROLE.md` with `schema: role/v1`:

```yaml
schema: role/v1
name: founder
title: Founder
description: Sets product direction and owns the largest customer relationships.
version: 1.0.0
seniority: lead
mission: >
  Set product direction, own customer relationships above $5K MRR, unblock other
  roles. Hand off to ops once a process is recurring.
responsibilities:
  - Own the product direction
  - Own enterprise customer relationships
```

Required fields are fixed by AIP-47: `schema`, `name`, `title`, `description`,
`version`, `seniority`, `mission`, `responsibilities`. Read the AIP-47 schema
for the rest; do not invent fields here.

Conventions:

- The folder name equals the role's `name`.
- `mission` is the role's bounded-autonomy statement. Write it intentionally.
- Do not use `doctype: role` with `mandate`. That is the old AIP-6 shape: a host
  may still read it and warn `doctype_moved`, but new files are `role/v1`.
- Who holds the role, and who the holder reports to, is a seat in the AIP-22
  office. Add it there, not in `ROLE.md` or `COMPANY.md`.

### 5. Author each objective

For every slug in `structure.objectives` (and any sub-objectives), create `objectives/<slug>/OBJECTIVE.md`:

```yaml
schema: company/v1
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

- `owner` MUST be the slug of a position in the AIP-22 office or of an AIP-47
  role that exists in the company.
- `horizon` is informational; use `ongoing` for objectives without a fixed end
  date.
- `key_results[]` is optional but encouraged. Each KR has its own `id`
  (kebab-case, scoped to the objective) so progress updates can reference it
  stably.
- For decomposition, set `parent: <slug>` on the child and list
  `children: [<slugs>]` on the parent. The adapter validates the edges agree
  both directions.

### 6. Cross-reference and link

Every reference between documents is a **slug**. Adapter rules:

| From           | Field                     | Resolves to                                           |
| -------------- | ------------------------- | ----------------------------------------------------- |
| `COMPANY.md`   | `structure.objectives[]`  | `objectives/<slug>/OBJECTIVE.md`                      |
| `OBJECTIVE.md` | `owner`                   | a position of the AIP-22 office, or an AIP-47 role    |
| `OBJECTIVE.md` | `parent` / `children[]`   | other objectives, edges MUST be symmetric             |
| `OBJECTIVE.md` | `depends_on[]`            | other objectives, no cycle                            |

Role edges (`reports_to`, `tools`, `workflows`) are AIP-47 and AIP-22
territory; the AIP-47 loader and the office check them.

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
document into the local workspace under `roles/<id>/ROLE.md` (an AIP-47
`role/v1` file) or `objectives/<id>/OBJECTIVE.md`, and treats it identically to
a hand-authored one after that. Use `alias` if a local slug would collide.

### 8. Validate

Validate each AIP-6 document against
[`./COMPANY.schema.json`](./COMPANY.schema.json), and each role against the
AIP-47 `ROLE.schema.json`:

```bash
# Validate the root and every objective
npx ajv validate --spec=draft2020 -s ./COMPANY.schema.json -d <pkg>/COMPANY.md
find <pkg>/objectives -name 'OBJECTIVE.md' -exec npx ajv validate --spec=draft2020 -s ./COMPANY.schema.json -d {} \;

# Validate every role against the AIP-47 schema
find <pkg>/roles -name 'ROLE.md' -exec npx ajv validate --spec=draft2020 -s <aip-47>/ROLE.schema.json -d {} \;
```

These commands take parsed data; run them on the frontmatter, or through your
adapter's `validate` helper (see [`./ADAPTER.md`](./ADAPTER.md)). Then run the
**cross-reference check**. Specifically check:

- Every slug in `structure.objectives` resolves to an `OBJECTIVE.md`.
- Every `objective.owner` is a known position or role.
- Every `objective.parent` and `objective.children` edge is symmetric.
- No file carries an alias and its canonical field with different values.

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
2. A list of the roles written, and a reminder that their seats and reporting
   lines go into the AIP-22 office.
3. A list of objectives with their owners, so they can verify accountability.
4. **Open assumptions** — fields you guessed defaults for that the user might
   want to override (`horizon: quarter`, `seniority` per role, etc.).

Do NOT install or instantiate the company yourself. Authoring ends with the
files written; instantiation (per AIP-8) is a separate step.

## See also

- [AIP-6 — company/v1 spec](/docs/aip-6)
- [AIP-7 — governance, capabilities, approval](/docs/aip-7)
- [AIP-8 — agencies engine, operator instances](/docs/aip-8)
- [AIP-14: TOOL.md spec](/docs/aip-14)
- [AIP-15: WORKFLOW.md spec](/docs/aip-15)
- [AIP-20: WORK.md](/docs/aip-20): how projects are described
- [AIP-22: office and seats](/docs/aip-22): positions, holders, reporting
- [AIP-34: workspace tree](/docs/aip-34)
- [AIP-47: ROLE.md](/docs/aip-47): the role schema
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspaces (solo, two-role, tree,
  decomposed objectives, imports, fork, legacy spellings)
- [`./COMPANY.schema.json`](./COMPANY.schema.json) — frontmatter validator
