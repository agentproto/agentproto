---
schema: workspace/v1
id: "@agentik/agents-standard"
version: 0.1.0-alpha
name: "Agentik Standard Agents Library"
description: |
  Reference library of common AGENT.md files (AIP-42) — base
  standalone agents for utilities, sub-agents, and helpers. Operators
  bound to companies and roles live in
  `@agentik/operators-standard` (AIP-9 + AIP-42 extension form).

  Authors fork or extend these via `extends: { ref: "@agentik/agents-standard/<slug>" }`.
owner:
  type: org
  id: "agentik-org-id"
  slug: "agentik"
storage:
  inline:
    provider: github
    config:
      owner: agentik
      repo: agents-standard
      branch: main
publish:
  template: false
  registry: agentik
  visibility: public
tags: [reference, library, agents, standard]
---

## Description

Standalone, runnable agents covering common patterns:

| Slug | Purpose |
|---|---|
| `researcher` | Web research with structured findings |
| `writer` | Long-form writing (drafts, briefs, editorial) |
| `code-reviewer` | Reviews code diffs for bugs, style, security |
| `support-agent` | Customer-facing Q&A on product docs |

Each agent is **standalone runnable** — minimum viable AGENT.md
(model + body + tools), no company / role / persona bindings
required. Extend or fork to specialise.

## AGENTS.md inheritance

The sibling `.agents/AGENTS.md` (when present) is concatenated as a
prefix to every agent's body — common house rules apply uniformly.
