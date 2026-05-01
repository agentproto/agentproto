---
schema: skills/v1
name: propose-aip
title: Author and propose a new AIP
description:
  Walk through drafting a new AIP — from picking a number through writing the
  spec body, generating the resources folder, and submitting for discussion.
version: 1.0.0
tags: [aip-1, aip-2, process, authoring, agentproto]
inputs:
  - name: idea
    type: string
    required: true
    description:
      One-paragraph description of the standard you want to propose. The skill
      turns this into title, abstract, and motivation.
  - name: type
    type: string
    required: false
    description:
      AIP type. One of "Schema" (file format), "Core" (runtime primitive),
      "Meta" (process), "Informational". Default Schema.
  - name: relatedAips
    type: string[]
    required: false
    description:
      Numbers of AIPs this proposal extends or references (for `requires:` and
      "See also").
examples:
  - input:
      idea:
        A manifest format for declaring agent personas — voice, traits, role.
      type: Schema
    output:
      - aip-NN.mdx
      - resources/aip-NN/draft/<NAME>.schema.json
      - resources/aip-NN/draft/ADAPTER.md
      - resources/aip-NN/draft/EXAMPLES.md
      - resources/aip-NN/draft/skills/author-<thing>/SKILL.md
---

# Author and propose a new AIP

Use this skill when the user asks to **draft, propose, or standardise**
something agent-related — a file format, a runtime primitive, a governance rule,
a shared building block. The skill produces a complete AIP draft: the spec doc,
the canonical schema, an adapter guide, examples, and at least one authoring
SKILL.md.

The lifecycle, required frontmatter, and submission process come from
[AIP-1](/docs/aip-1). The body template comes from [AIP-2](/docs/aip-2). This
skill is the _agent-driven projection_ of both — it walks you through them step
by step.

## When to use

- "Write up an AIP for declaring agent personalities."
- "I have a pattern that's been re-implemented three times — turn it into a
  shared spec."
- "Standardise the way operators record decisions, propose an AIP."

## When NOT to use

- The user wants to **amend** an existing AIP — that's a spec edit, not a new
  AIP. Edit the `.mdx` directly and bump the version semantics there.
- The proposal is implementation-specific (one host, one vendor) — AIPs are
  vendor-neutral by [AIP-1](/docs/aip-1) rule. If it doesn't generalise to a
  second implementation, it's not an AIP.
- The user wants a tutorial / blog post / internal doc — those go somewhere
  else.

## Process

Follow these steps in order. Steps 1–5 produce the AIP draft; steps 6–8 produce
the resources folder; step 9 wires the new doc into the index.

### 1. Pick the number

- Look at the highest existing AIP number in `meta.json` (search for the AIP
  index page).
- Reserve the next integer. AIP numbers are immutable once a draft is committed
  — pick once, never renumber.
- If the AIP is a **schema-block** (composable building block, not a manifest
  users author — like AIP-16 IO.md, AIP-17 RUNTIME.md), flag it in the abstract.

### 2. Decide the type

| Type            | When to use                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `Schema`        | A file format users author (TOOL.md, WORKFLOW.md) OR a schema block other AIPs reference (IO.md, RUNTIME.md). |
| `Core`          | A runtime primitive — governance, audit, dispatch, capability gates.                                          |
| `Meta`          | About the AIP process itself (numbering, status flow, registry).                                              |
| `Informational` | Background, conventions, glossary. No normative requirements.                                                 |

### 3. Write the frontmatter

Mirror the template in [AIP-2](/docs/aip-2):

```yaml
---
title: "AIP-NN: <NAME>.md — <one-line purpose>"
description: <one-paragraph abstract for search + indices>
aip: NN
status: Draft
type: Schema | Core | Meta | Informational
created: <ISO date>
author: <Name> <email>
requires: [<aip-numbers this depends on>]
resources: ./resources/aip-NN/draft
discussions-to: https://github.com/agentproto/agentproto/discussions/NN
---
```

### 4. Write the body

Required sections (in order):

```md
## Abstract

One paragraph: what does this AIP standardise, and why.

## Motivation

Why this can't live as a vendor-specific feature. Name the duplication / drift /
security concern that prompted the proposal.

## Design principles

3–7 numbered principles. Keep them short — two sentences max each.

## Specification

The normative content. Tables, schemas, signatures. Use MUST / MAY / SHOULD per
RFC 2119.

## The `defineXxx` standard signature

If the AIP defines a manifest format that runs code, declare the canonical
entry-point function name + signature. Bullet-point the conformance rules.

## Compatibility

What changes when this is adopted. Migration guidance.

## Security considerations

Threat model + mitigations specific to this AIP. Don't punt.

## Open questions

Anything you couldn't settle in the first draft. Resolve over time in
`discussions-to:`.

## See also

Cross-links to related AIPs.
```

Optional but encouraged:

- `## Adjacency to other specs` — name MCP / OpenAPI / JSON Schema / similar
  where this AIP overlaps.
- `## Reference Implementation` — point to a real host that ships this AIP, when
  one exists.

### 5. Drop the v1.x markers

While the AIP is `Draft`, don't put inline version markers ("v1.1", "v2.0") in
field tables or section headers. Once shipped under `Final`, future amendments
live as separate AIPs OR get a clearly-marked "## Changes since X" section.
Drafts are fluid; versioning them in-line is noise.

### 6. Generate the schema (if Type = Schema)

Author `resources/aip-NN/draft/<NAME>.schema.json`:

- JSON Schema Draft 2020-12.
- `$id` = `https://agentproto.dev/schemas/aip-NN/<NAME>.schema.json`.
- Strict `additionalProperties: false` on the top-level object and on every
  concrete sub-shape (helps catch field-name typos).
- `$ref` into AIP-16 (IO blocks) and AIP-17 (runtime block) when your AIP
  defines a manifest type that imports them. Don't redeclare those blocks.

### 7. Write the ADAPTER.md

Host-implementer guide. Cover:

- Required behaviour for the manifest's standard signature.
- Lifecycle around the body (parse → validate → run → cleanup).
- Multi-language naming conventions for the standard signature.
- Registration test — what `validate(manifestPath)` checks.
- What this guide does NOT cover (other AIPs handle).

### 8. Write at least one SKILL.md

Pick a verb that names the most common author task:

- `author-<thing>` for AIPs whose users write a `<NAME>.md` file (TOOL.md →
  `author-tool`, WORKFLOW.md → `author-workflow`).
- `use-<block>` for schema-block AIPs that other AIPs consume (IO.md →
  `use-io-blocks`, RUNTIME.md → `use-runtime-block`).
- `<verb>-<noun>` for everything else (curate-wiki, propose-aip,
  configure-governance).

Mirror the [AIP-3](/docs/aip-3) skill format: frontmatter (`schema: skills/v1`),
When to use / When NOT, Process steps, Output, See also.

Each SKILL.md goes in `resources/aip-NN/draft/skills/<verb>-<noun>/SKILL.md`.

### 9. Wire into the index

Three places to update:

1. `meta.json` — append `"aip-NN"` to the `pages` array.
2. `index.mdx` — add a row to the AIPs table:
   ```md
   | [AIP-NN](/docs/aip-NN) | <NAME>.md — <one-line purpose> | Schema | Draft |
   ```
3. The Categories list line (`Schema — file formats … (AIPs 3–5, 10–NN)`) —
   extend the upper bound.

### 10. Submit for discussion

Open the GitHub discussion the frontmatter `discussions-to:` points to.
Cross-link from any existing AIPs that reference yours (via `requires:` or "See
also") so reviewers see the dependency graph.

## Output

A new AIP draft consisting of:

1. `aip-NN.mdx` with full frontmatter + body covering the required sections.
2. `resources/aip-NN/draft/<NAME>.schema.json` (Schema type only).
3. `resources/aip-NN/draft/ADAPTER.md` (host implementer's guide).
4. `resources/aip-NN/draft/EXAMPLES.md` (3+ reference manifests, if applicable).
5. `resources/aip-NN/draft/skills/<verb>-<noun>/SKILL.md` (at least one).
6. `meta.json` + `index.mdx` updated.
7. A GitHub discussion thread linked in `discussions-to:`.

## See also

- [AIP-1 — Purpose & Process](/docs/aip-1) — lifecycle, status flow, frontmatter
  required fields
- [AIP-2 — AIP Template](/docs/aip-2) — the body template this skill expands
- [AIP-3 — SKILL.md](/docs/aip-3) — the format SKILL.md authoring follows
- [`../../../aip-2/draft/skills/use-aip-template/SKILL.md`](../../../aip-2/draft/skills/use-aip-template/SKILL.md)
  — sibling skill for filling out the template
