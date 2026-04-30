---
schema: skills/v1
name: author-intent
title: Author an INTENT.md (AIP-28)
description:
  Walk through authoring a portable INTENT.md manifest plus an optional
  defineIntent entry — the user-facing operation manifest that routes to one
  or more tools.
version: 1.0.0
tags: [aip-28, intents, authoring, manifest, agentproto]
inputs:
  - name: purpose
    type: string
    required: true
    description:
      One-sentence statement of what verb the intent exposes to the user.
      ("Create an image", "List open PRs", "Schedule a meeting".)
  - name: existingTools
    type: string
    required: false
    description:
      Comma-separated list of TOOL.md refs the intent should route to. If
      omitted, the skill helps identify or scaffold candidate tools first.
  - name: surfaces
    type: string
    required: false
    description:
      Comma-separated list of surfaces (chat, menu, voice, shortcut, api).
      Default "chat,menu".
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the entry file when custom routing is needed.
      Default "ts". Accepts "ts", "py", "go".
examples:
  - input:
      purpose: "Create an image from a text prompt, picking the best model per style."
      existingTools: "./tools/openai-dalle/TOOL.md, ./tools/replicate-flux-pro/TOOL.md"
    output:
      - .intents/image-create/INTENT.md
  - input:
      purpose: "List the user's open GitHub pull requests across watched repos."
    output:
      - .intents/github-pr-list/INTENT.md
---

# Author an INTENT.md (AIP-28)

Use this skill when the user asks to **define a user-facing operation** an
agent can offer — a verb that surfaces on chat, in a menu, by voice, or via
a keyboard shortcut. The skill produces a valid
[AIP-28 INTENT.md](/docs/aip-28) manifest plus, when needed, an entry file
that exposes the standard `defineIntent` signature.

## When to use

- "Make a 'Create image' button that picks Flux for photoreal and DALL-E
  otherwise."
- "Expose 'list my open PRs' as something the user can click."
- "Wrap our `summarise` tool as a one-click intent with a form."

## When NOT to use

- The user wants a **single atomic technical function** with input/output
  schemas → use the [AIP-14 author-tool skill](../../../aip-14/draft/skills/author-tool/SKILL.md).
- The user wants a **multi-step workflow** that's worth its own surface →
  author a [WORKFLOW.md (AIP-15)](/docs/aip-15) and route the intent to it.
- The user wants **expertise / prompting** for the agent — that's a
  [SKILL.md (AIP-3)](/docs/aip-3), not an intent.

## Process

Follow these steps in order. Each step has a short justification — keep
them in the file you produce so reviewers see why each field ended up the
way it did.

### 1. Fix identity

- Pick `id`: dotted, lowercase, descriptive of the verb the user performs
  (`image.create`, `github.pr.list-open`, `calendar.meeting.create`). Use
  dots to express namespace; reviewers should be able to guess the domain
  from the id.
- Write `name`: internal display name (used in dev consoles).
- Write `label`: the **user-facing** button/menu text. Short. Imperative.
- Write `description`: one user-facing paragraph explaining what happens.
  ≤500 chars. Address it to the user, not the LLM.

If the deployment ships >1 locale, author `label` and `description` as
maps from day one. Adding locales later is fine; promoting a string to a
map later is ugly.

### 2. Pick surfaces

`surfaces:` is the allowlist of surfaces this intent appears on. Defaults:

- `[chat, menu]` — most intents, both forms appropriate.
- `[chat]` only — intents awkward outside the conversation flow
  (long form-fills, multi-step refinement).
- `[menu]` only — intents that don't make sense as a chat reply
  (open-a-view, list-X).
- Add `voice` only when there's a clean voice idiom (one-line input,
  obvious confirmation).
- Add `shortcut` for power users (search, summon, repeat).

Don't blanket all surfaces — every surface you add is UX you owe.

### 3. Sketch UX inputs

`inputs[]` is the form the user fills. UX-shaped, not JSON Schema:

- Each field has `name`, `label`, `type`. Optional: `required`, `default`,
  `placeholder`, `hint`, validation bounds.
- Pick the right `type`: `text`, `textarea`, `number`, `toggle`, `choice`,
  `multi-choice`, `file`, `image`, `date`, `markdown`, `code`, `ref` (per
  [AIP-27](/docs/aip-27)).
- Use `choice` with explicit `values` when there's a small enum; users
  pick faster from a dropdown than a text field.
- Keep field count low. 3–5 fields per intent is the sweet spot. More
  → consider splitting intents or moving into a workflow.

If the underlying tool's input is named identically, leave `mapping`
implicit. Use `mapping:` only when names diverge.

### 4. Decide the routing

This is where intents earn their keep.

#### One tool — declare it as default

```yaml
implements:
  - tool: ./tools/openai-dalle/TOOL.md
    default: true
```

#### Multiple tools, choose by input

```yaml
implements:
  - tool: ./tools/replicate-flux-pro/TOOL.md
    when: { style: photorealistic }
  - tool: ./tools/openai-dalle/TOOL.md
    default: true
```

First matching `when:` wins; `default: true` is the fallback. Exactly
one entry MUST be marked default.

#### Plan-aware / context-driven

Use a `entry: intent.ts` file with a `route()` function that reads
`context.user.tier`. See `EXAMPLES.md § 3` for the canonical shape.

#### Multi-step

Don't chain in `route()`. Author a [WORKFLOW.md (AIP-15)](/docs/aip-15)
and route to it:

```yaml
implements:
  - workflow: ./workflows/image-create-and-upscale/WORKFLOW.md
    default: true
```

### 5. Write intent seeds

`intent[]` is what the LLM matches user phrasing against. Add 3–8 seeds
covering the natural ways the user might ask. Keep them short and
imperative; the host composes them with `description`.

For multi-locale intents, author `intent:` as a per-locale map and
contribute seeds for every shipping locale — translation drift here
silently breaks chat matching.

### 6. Add examples

`examples[]` is few-shot for the LLM and reference for the human. 2–5
entries. Include diverse phrasings (formal, terse, multilingual). Add
`note:` when the example illustrates a routing decision.

### 7. Decide cost / quota

- **`quota_key`**: the meter key. Use a domain-prefixed dotted name
  (`ai.image.create`, `billing.invoice.send`). The host enforces; the
  intent only declares the meter.
- **`cost_class`**: omit unless the routed tool's class is wrong for the
  intent's UX (e.g. an intent that bundles two metered tool calls is
  `expensive` even if each tool is `metered`).

### 8. Validate

Run the manifest through
[`./resources/aip-28/draft/INTENT.schema.json`](../../INTENT.schema.json):

```bash
ajv validate -s INTENT.schema.json -d .intents/<id>/INTENT.md \
  --remove-additional fail \
  --strict
```

Reject manifests with extra unknown keys (catches typos like `surface:`
vs `surfaces:`).

### 9. Wire to the catalog

Register the intent with the host's intent runtime:

```ts
import { loadIntent, registerOnSurface } from "@agentproto/intent-runtime"

const intent = await loadIntent("./intents/image-create/INTENT.md")
for (const surface of intent.surfaces) {
  registerOnSurface(intent, surface, surfaceAdapters[surface])
}
```

The intent now appears on every declared surface, validates inputs,
routes to the right tool, and emits an audit row per invocation.

## Output structure

The skill emits at minimum:

```
.intents/<id>/
  INTENT.md          ← always
  intent.ts          ← only when implements: uses entry: dispatch
  previews/<id>.png  ← optional
```

When `purpose` clearly maps to existing tools and routing is data-only,
no entry file is needed. When the user mentions plan-awareness, locale
gating, or runtime-computed routing, ship `intent.ts`.

## Common mistakes

- **Inlining tool input schemas in `inputs[]`.** UX inputs are
  presentation-shaped. If the validation needs full JSON Schema
  expressiveness, the validation belongs in the routed tool — not
  duplicated here.
- **Forgetting `default: true`.** Any non-conditional `implements:`
  entry MUST mark itself default. The schema validates this.
- **Surface explosion.** Don't list `[chat, menu, voice, shortcut, api]`
  by default — only the surfaces you've actually designed for.
- **Per-intent auth.** Auth lives at the routed tool's
  [SECRETS.md](/docs/aip-19) ref. Declaring `auth:` on the intent only
  makes sense when the routing logic itself needs auth (e.g. consulting
  an LLM for tool selection).
- **Mutable `id`.** `id` + major version is the registration key.
  Renaming = breaking change = major bump + alias for old id during
  deprecation window.
