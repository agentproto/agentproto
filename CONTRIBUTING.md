# Contributing to the Agent Protocol Specs

Thanks for considering an AIP. The full submission guide lives at
**[agentproto.sh/docs/propose-aip](https://agentproto.sh/docs/propose-aip)**.
This file is the GitHub-side quick reference.

## Quick path

```bash
# 1. Fork this repo
git clone https://github.com/agentproto/specs
cd specs
git checkout -b propose-<your-slug>

# 2. Copy the template
cp AIPS/aip-template.md AIPS/aip-XXXX.md

# 3. Fill in frontmatter + the 7 required sections
$EDITOR AIPS/aip-XXXX.md

# 4. Open a PR. Editors assign a real number on PR open.
git push origin propose-<your-slug>
gh pr create
```

## Required frontmatter

Every AIP MUST start with YAML frontmatter:

```yaml
---
aip: XXXX                                   # Editors assign — leave as XXXX
title: <short, descriptive title>
author: <Your Name <your@email>>
status: Draft                                # Always start here
type: Meta | Schema | Core                  # Pick exactly one
created: YYYY-MM-DD
requires: [<aip>, <aip>]                    # Optional — list AIPs this depends on
replaces: <aip>                              # Optional — only if this supersedes a prior Final AIP
discussions-to: <github discussion URL>     # Optional but encouraged
ref-impl: <repo URL>                         # Required for Schema/Core
---
```

## Required body sections

1. **Abstract** — 2-3 sentences
2. **Motivation** — what problem this solves
3. **Specification** — the normative content (Zod / TypeScript / JSON Schema / BNF / prose)
4. **Rationale** — why these design choices, what alternatives were considered
5. **Reference Implementation** — link to working code (required for Schema/Core)
6. **Backwards Compatibility** — required only if `replaces` is set
7. **Security Considerations** — required for Core, recommended for Schema

## Lifecycle

```
Draft  →  Review  →  Final
   ↘                    ↓
    Withdrawn       Superseded
```

- **Draft** — open for substantial change
- **Review** — minimum 14 days, clock resets on substantive changes
- **Final** — only errata accepted; replacing requires a new AIP
- **Superseded** — replaced by a later AIP
- **Withdrawn** — author or editors abandoned

## The 2-implementer rule

To move from `Review` to `Final`, an AIP MUST have at least **two
independent implementations** — one of which MAY be the author's
reference impl, but at least one other MUST come from a different
organization or maintainer.

This is the registry's adoption filter. Without it, the namespace
becomes a graveyard of internal proposals dressed as standards.

## Editorial response timelines

| Action | Editor SLA |
|---|---|
| New PR opened | Number assigned within 7 days |
| `status:review` requested | Verified or rejected within 7 days |
| `Final` requested (post-Review) | Decision within 14 days |
| Errata PR on `Final` AIP | Reviewed within 7 days |

## Adjacency to other specs

AIPs explicitly defer to **MCP** (transport / tools), **A2A**
(agent-to-agent transport), **AGNTCY** (identity, discovery),
**AITP** (transactions / payments), and **Anthropic Skills**
(SKILL.md format) for the layers they own. AIPs live in the gaps these
specs leave — primarily the AI-company operating layer.

When proposing an AIP that overlaps with an existing spec from another
initiative, you MUST cite the overlap in the Rationale section and
explain why a new spec is needed rather than an extension. **Default
position: extend, don't fork.**

See [`related-standards.md`](related-standards.md) for the full
catalogue.

## Style guide

- **Be concrete.** Replace "the system" with the actual subject
- **Use small examples.** A 5-line YAML beats two paragraphs of prose
- **Cite prior AIPs by number.** Write `AIP-7`, not "the governance one"
- **Use RFC-2119 keywords.** MUST / SHOULD / MAY are normative
- **Reference adjacent specs.** Cite overlaps explicitly

## Discussion before drafting

For substantive design questions, open a thread in
[Discussions](https://github.com/agentproto/specs/discussions) before
opening a PR. Early feedback is cheap; spec rewrites are expensive.

## Code of conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Violations: open a private issue or email the editors.
