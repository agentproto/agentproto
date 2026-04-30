---
schema: skills/v1
name: use-aip-template
title: Fill out the AIP template
description:
  Walk through filling the AIP-2 template — required frontmatter, section
  ordering, MUST/SHOULD/MAY discipline — once you've decided to author a new
  AIP.
version: 1.0.0
tags: [aip-2, template, authoring, agentproto]
inputs:
  - name: aipNumber
    type: integer
    required: true
    description:
      The AIP number (already reserved). Use `propose-aip` to pick a number.
  - name: type
    type: string
    required: true
    description: One of "Schema", "Core", "Meta", "Informational".
  - name: title
    type: string
    required: true
    description:
      One-line title following the convention `<NAME>.md — <one-line purpose>`
      for Schema AIPs, or `<short title>` for others.
examples:
  - input:
      aipNumber: 18
      type: Schema
      title: "AGENT.md — agent persona manifest format"
    output:
      - aip-18.mdx (filled-in template)
---

# Fill out the AIP template

Use this skill once you've decided to author a new AIP and reserved a number.
The skill takes the [AIP-2](/docs/aip-2) template and fills it in — required
frontmatter fields, the canonical body section order, the MUST/SHOULD/MAY
discipline.

This is a **narrower** skill than
[`propose-aip`](../../../aip-1/draft/skills/propose-aip/SKILL.md) — that one
walks the whole proposal lifecycle (resources folder, adapter guide, indices).
Use this skill when you only need the AIP doc itself.

## When to use

- "I have AIP-N reserved, draft the spec body."
- "Fill in the template for an AIP about X."
- "Reformat my notes into AIP-2 shape."

## When NOT to use

- The user wants the WHOLE proposal (schema + adapter + skills) → use
  [`propose-aip`](../../../aip-1/draft/skills/propose-aip/SKILL.md).
- The user wants to amend an existing AIP — edit the `.mdx` directly.

## Process

### 1. Frontmatter (required fields)

```yaml
---
title: "AIP-NN: <title>"
description: <one-paragraph abstract — search-friendly, no MUST/SHOULD>
aip: NN
status: Draft
type: Schema | Core | Meta | Informational
created: <YYYY-MM-DD>
author: <Name> <email>
requires: [<aip-numbers>] # empty list if none
resources: ./resources/aip-NN/draft # omit if no resources folder
discussions-to: https://github.com/agentproto/specs/discussions/NN
---
```

Notes:

- `status` always starts at `Draft`. Promotion to `Last Call`, `Final`, or
  `Withdrawn` happens after review per [AIP-1](/docs/aip-1).
- `created` is the date the AIP was first drafted, not the latest edit date.
  Don't update it.
- `requires:` lists every AIP this proposal depends on for semantics — if you
  `$ref` an AIP-16 schema, list 16. If you cite an AIP-7 governance rule,
  list 7.

### 2. Header table

Right after the frontmatter, paste a markdown summary table:

```md
| Field     | Value                                            |
| --------- | ------------------------------------------------ |
| AIP       | NN                                               |
| Title     | <NAME>.md — <one-line purpose>                   |
| Status    | Draft                                            |
| Type      | Schema                                           |
| Domain    | <domain.sh — optional>                           |
| Requires  | [AIP-X](/docs/aip-X), [AIP-Y](/docs/aip-Y)       |
| Resources | [`./resources/aip-NN`](./resources/aip-NN/draft) |
```

This is redundant with the frontmatter but renders in the body for human readers
who don't see the YAML.

### 3. Required body sections (in order)

```md
## Abstract

One paragraph: what does this AIP standardise. No motivation, no spec — just
"this AIP defines …".

## Motivation

Why this can't be a vendor-specific feature. Concrete: name the duplication /
drift / security gap.

## Design principles

3–7 numbered principles, two sentences each. Each principle should be
falsifiable — "X over Y because Z."

## Specification

Normative content. Tables, schemas, signatures. Use:

- **MUST** for non-negotiable requirements.
- **SHOULD** for strong recommendations with named exceptions.
- **MAY** for permitted but optional behaviour.

## Compatibility

What changes for existing implementations. Migration steps if applicable.
Greenfield AIPs say "no migration."

## Security considerations

Threats specific to this AIP + how the spec mitigates them. Even "Schema" AIPs
have security considerations — at minimum, what happens when a manifest lies.

## Open questions

Numbered list of things you couldn't settle. Resolve over time in the discussion
thread.

## See also

Cross-links to related AIPs and external references.
```

### 4. Optional sections

Add when relevant — drop when not:

- `## The defineXxx standard signature` — required for AIPs that define a
  manifest format with a code body (TOOL.md, WORKFLOW.md).
- `## Adjacency to other specs` — name MCP, OpenAPI, JSON Schema, RFC NN where
  the AIP overlaps. Be honest about what this AIP borrows.
- `## Reference Implementation` — link to a real host that ships this AIP, once
  one exists.
- `## Conformance rules` — testable rules a host MUST satisfy. Numbered, with
  one rule per item.

### 5. MUST / SHOULD / MAY discipline

- **MUST** is non-negotiable. Implementations that violate a MUST are
  non-conforming. Use sparingly — overuse devalues the keyword.
- **SHOULD** means "do this unless you have a specific reason not to." Always
  pair with the named exception ("…SHOULD do X unless Y").
- **MAY** means "permitted, not required." Use to authorise flexibility, not to
  weasel out of decisions.
- **MUST NOT** is stronger than "SHOULD NOT" — be deliberate.

Words to avoid in normative text: "could", "might", "ought to", "may want to".
They have no spec meaning.

### 6. Style notes

- Vendor-neutral. No `mastra*`, `langchain*`, `temporal*` field names.
  Vendor-specific guidance goes in the resources/ ADAPTER.md, not the AIP body.
- Tables for fields, prose for principles. Don't write field tables in prose;
  don't write principles as bullet lists.
- One spec, one normative term. If you say "tool" in §4, don't switch to
  "function" in §6 unless you've defined them as different concepts.
- Date the AIP once (`created:` in frontmatter). Don't datestamp individual
  sections.

### 7. Drop in-line version markers while Draft

Don't write "(v1.1)", "(v2.0)", etc. in field tables or section headers while
the AIP is `Draft`. Drafts are fluid; versioning them in-line is noise. Once
`Final`, future amendments live as separate AIPs OR get a clearly-marked
`## Changes since vX` section.

## Output

A filled-in `aip-NN.mdx` with:

1. Complete frontmatter (every required field set).
2. Header table mirroring the frontmatter.
3. Eight required body sections in canonical order.
4. Any relevant optional sections.
5. MUST / SHOULD / MAY used per RFC 2119.
6. No vendor-specific field names.
7. No in-line version markers.

## See also

- [AIP-1 — Purpose & Process](/docs/aip-1) — lifecycle, status flow
- [AIP-2 — AIP Template](/docs/aip-2) — the canonical template this skill fills
- [AIP-3 — SKILL.md](/docs/aip-3) — for writing the resources folder's skills
- [`../../../aip-1/draft/skills/propose-aip/SKILL.md`](../../../aip-1/draft/skills/propose-aip/SKILL.md)
  — full-proposal sibling skill
