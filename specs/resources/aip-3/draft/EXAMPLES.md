# EXAMPLES.md — SKILL.md reference patterns

Reference `SKILL.md` files exemplifying common patterns. Each example is a
self-contained manifest a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Minimal / read-only](#example-1--minimal--read-only)
2. [With capabilities and scopes](#example-2--with-capabilities-and-scopes)
3. [With typed inputs and structured outputs](#example-3--with-typed-inputs-and-structured-outputs)
4. [Composes other skills](#example-4--composes-other-skills)
5. [Tool-authoring skill](#example-5--tool-authoring-skill)
6. [Vendor-specific extension](#example-6--vendor-specific-extension)

---

## Example 1 — Minimal / read-only

The simplest possible skill: identity fields, a description, a body of prose. No
inputs, no tools, no capabilities. Use this shape when the skill is pure
instruction and depends only on the agent's default toolset.

```md
---
schema: skills/v1
name: explain-like-im-five
title: Explain like I'm five
description:
  Reframe the user's last technical answer in plain language a five-year-old
  could follow. Use when the user says "ELI5" or "explain simply"; do NOT use as
  the default style.
version: 1.0.0
tags: [communication, style, plain-language]
---

# Explain like I'm five

Take the most recent technical explanation in the conversation and rewrite it in
language a curious five-year-old would follow.

## Process

1. Identify the most recent assistant turn that contained jargon, acronyms, or
   technical concepts.
2. Replace each technical term with a concrete analogy.
3. Keep sentences short (≤12 words).
4. End with a single sentence that names the original concept once, so the user
   can search it later.

## Output

Reply with the rewritten explanation only — do not preface with "here's the
simpler version" or similar fluff.
```

When to use this pattern: you're packaging a style guide, a reframing skill, or
any pure prompt-modification capability that needs no tools and no host grants.
This is also the right shape for skills that ship as part of an open-source
registry where authors can't make assumptions about the host's tools.

---

## Example 2 — With capabilities and scopes

The skill needs network access and a secret. Capabilities are declared up-front
so the host can gate via AIP-7 before the body ever reaches the agent. The body
itself never reads env directly — it relies on the host to inject credentials
into the tool layer.

```md
---
schema: skills/v1
name: github-pr-house-style
title: Draft a GitHub PR description in house style
description:
  Walk the agent through drafting a GitHub pull request description that follows
  our house style (one-line summary, bullet changelog, test plan, screenshots if
  UI). Use when the user asks to write or rewrite a PR description; do NOT use
  for review comments.
version: 1.2.0
author: Jeremy André <jeremy@agentik.net>
tags: [engineering, github, pull-request, style]
capabilities:
  network: ["api.github.com"]
  secrets: ["github-token"]
  tools: ["github-list-commits", "github-create-pr"]
---

# Draft a GitHub PR description in house style

## When to use

- "Write a PR description for this branch."
- "Improve this PR summary."

## Process

1. Use `github-list-commits` to fetch the commits between the branch tip and its
   base.
2. Group commits by intent (feature / fix / refactor / chore).
3. Draft a description in this exact shape:
```

## Summary

   <one sentence>

## Changes

- <bullet per intent group>

## Test plan

- [ ] <unchecked checklist>

```

4. If any commit touches `apps/*/web/`, add a `## Screenshots`
section and remind the user to attach images before submitting.

## Output

Return the assembled markdown. Do not call `github-create-pr` —
the user reviews the draft first.
```

When to use this pattern: any skill that needs the host to grant network egress,
file scopes, secrets, or specific tools before activating. The `capabilities`
block is the safety contract; pair it with narrow grants (named hosts, named
secrets — never `*` unless the skill genuinely speaks to the open internet).

---

## Example 3 — With typed inputs and structured outputs

The skill takes parameters from its caller and reports back a structured result.
`inputs` describes what the LLM must supply; `outputs` (optional) describes what
the host can expect to parse from the agent's reply for downstream wiring.

```md
---
schema: skills/v1
name: release-note-from-diff
title: Generate a release note from a diff
description: Produce a customer-facing release note paragraph from a code diff and an optional issue reference. Use when the user asks for a changelog entry or release blurb; do NOT use for internal commit messages.
version: 1.0.0
tags: [release, changelog, communication]
inputs:
  - name: diffSummary
    type: string
    required: true
    description: Plain-text summary of the diff. The skill rewrites this into a customer-facing sentence; the LLM should not paste the raw diff.
  - name: issueRef
    type: string
    required: false
    description: Optional issue or ticket id (e.g. "ENG-1234") to reference in the note.
  - name: tone
    type: string
    required: false
    default: "neutral"
    description: One of "neutral", "celebratory", "apologetic". Default "neutral".
outputs:
  type: object
  properties:
    note:        { type: string, description: "Customer-facing paragraph." }
    category:    { enum: ["feature", "fix", "improvement"] }
    breaking:    { type: boolean }
  required: [note, category, breaking]
tags: [release, changelog]
---

# Generate a release note from a diff

## Process

1. Read `diffSummary`. Classify as feature / fix / improvement.
2. Detect breaking changes (look for "BREAKING", removed APIs, schema changes).
3. Write a single paragraph in the requested `tone`.
4. If `issueRef` is provided, end the paragraph with `(<issueRef>)`.

## Output

Return JSON matching the declared `outputs` schema. The host's release tooling
parses this directly into the changelog.
```

When to use this pattern: the skill is invoked by another skill, a workflow, or
a programmatic caller that needs typed I/O. The `outputs` block lets the host
validate the agent's reply and route the result without fragile regex parsing.

---

## Example 4 — Composes other skills

The skill orchestrates other skills via the `skills` declaration. The host MAY
refuse activation if any composed skill is missing, catching dependency drift at
registration time rather than at runtime.

```md
---
schema: skills/v1
name: ship-release
title: Ship a release end-to-end
description:
  Run the full release flow — generate notes, draft a PR description, post the
  announcement. Use when the user says "ship the release"; do NOT use for
  partial release tasks (use the individual skills instead).
version: 1.0.0
tags: [release, orchestration]
skills:
  - release-note-from-diff
  - github-pr-house-style
  - announce-release-to-slack
inputs:
  - name: diffSummary
    type: string
    required: true
    description: Diff summary forwarded to release-note-from-diff.
  - name: branchName
    type: string
    required: true
    description: Branch name forwarded to github-pr-house-style.
---

# Ship a release end-to-end

## Process

1. Activate `release-note-from-diff` with `{ diffSummary, tone: "neutral" }`.
   Capture `outputs.note` and `outputs.category`.
2. Activate `github-pr-house-style` for `branchName`. Append the release note
   paragraph from step 1 under "## Summary".
3. Activate `announce-release-to-slack` with the release note from step 1 and
   the PR URL from step 2.
4. Report the PR URL and the Slack message link to the user.

## Output

Reply with both URLs and a one-line confirmation. Do not retry failed sub-skills
automatically — surface failures and wait for the user.
```

When to use this pattern: a high-level skill that delegates to narrower skills.
Composition keeps each skill testable in isolation while letting authors package
an opinionated end-to-end flow.

---

## Example 5 — Tool-authoring skill

A skill whose output is a new artifact in the workspace — in this case, a new
tool. The AIP-14 authoring skill in the sibling `aip-14/` folder follows this
exact pattern. Tool-authoring skills need fs.write capability and typically call
no tools themselves (they emit files via the host's workspace adapter).

```md
---
schema: skills/v1
name: scaffold-fetch-tool
title: Scaffold a fetch-style read-only tool
description:
  Walk the agent through scaffolding an AIP-14 TOOL.md plus entry file for a
  read-only HTTP fetch tool. Use when the user wants to "wrap an API as a tool";
  do NOT use for mutating tools (use the mutating-tool scaffold skill instead).
version: 1.0.0
tags: [aip-14, tools, authoring, scaffolding]
capabilities:
  fs.write: ["./.tools/"]
inputs:
  - name: apiName
    type: string
    required: true
    description:
      Human name of the API being wrapped. Used in id, name, description.
  - name: apiDocsUrl
    type: string
    required: false
    description:
      Optional URL to the upstream API docs. The skill cites this in the
      manifest's metadata.
---

# Scaffold a fetch-style read-only tool

## Process

1. Derive `id` from `apiName` (kebab-case, prepend the verb `fetch-`).
2. Write `.tools/<id>/TOOL.md` with `mutates: []`, `approval: auto`,
   `risk_level: 0`, and a stub schema.
3. Write `.tools/<id>/tool.ts` with a default-exported `defineTool(...)`
   returning a placeholder `execute`.
4. Tell the user which fields still need their attention: the URL pattern, the
   response parse, the `requires.network` host list.

## Output

Reply with the folder path and the unfilled-field checklist. Do not attempt to
call the tool yourself.
```

When to use this pattern: any skill whose job is to produce a file in the
workspace (tools, workflows, design kits, snippets). The output is files, not
prose, so the body focuses on a stable file layout and the unfilled-fields
handoff.

---

## Example 6 — Vendor-specific extension

The skill targets a specific vendor's runtime quirks. Vendor hints go in the
`metadata` block under a namespaced key — never as top-level fields, because
other hosts MUST tolerate them but shouldn't have to know what they mean. This
keeps the manifest portable while still letting authors squeeze the most out of
a preferred host.

```md
---
schema: skills/v1
name: long-context-summary
title: Summarise a long document with chunked map-reduce
description:
  Summarise documents larger than the model's context window using a chunked
  map-reduce strategy. Use when the input exceeds the host's context budget; do
  NOT use for documents that fit in one shot.
version: 1.0.0
tags: [summarisation, long-context, retrieval]
inputs:
  - name: documentRef
    type: string
    required: true
    description: Reference to the document in the workspace (path or canvas id).
  - name: targetWordCount
    type: number
    required: false
    default: 300
    description: Target length of the final summary, in words.
metadata:
  acme:
    preferredModel: "long-context-large"
    chunkTokens: 8000
    overlapTokens: 400
  contoso:
    summarizerProfile: "map-reduce-v2"
---

# Summarise a long document with chunked map-reduce

## Process

1. Resolve `documentRef` to text content via the host's workspace adapter.
2. Chunk the text. The host MAY honour `metadata.<vendor>` hints (chunk size,
   overlap, preferred model); on hosts that don't, pick sensible defaults from
   the host's context-window limit.
3. Summarise each chunk independently (map phase).
4. Concatenate chunk summaries; produce a final summary at the requested
   `targetWordCount` (reduce phase).

## Output

Reply with the final summary only. Do not list intermediate chunk summaries
unless the user asks.
```

When to use this pattern: the skill performs better with host-specific tuning,
but the core logic is portable. The `metadata.<vendor>` block lets each host opt
in to its own optimisations without forking the skill. Other hosts MUST tolerate
the metadata block (the schema permits it as `additionalProperties: true`) and
ignore namespaces they don't recognise.

---

## Anti-patterns to avoid

- **Missing `schema: skills/v1`.** The host's parser dispatches on this field; a
  manifest without it MUST be rejected. Don't rely on format inference.
- **`capabilities` omitted** when the skill assumes network or secret access.
  Declare every grant the body relies on, even if the underlying tool already
  declares them — defence in depth.
- **Vague `description`** like "skill for X" or "useful skill". The host indexes
  descriptions for selection; vague descriptions make the wrong skill picked.
- **Empty input `description` fields.** The LLM reads these. Empty prose trains
  the agent to hallucinate values.
- **Vendor-specific top-level fields.** If a field is host-specific, it goes
  under `metadata.<vendor>.…`. Top-level extensions break cross-host
  portability.
- **Skills that wrap a single tool call.** That's a tool, not a skill. Use
  [AIP-14](/docs/aip-14) instead.
- **Skills that branch and fan out.** That's a workflow. Use
  [AIP-15](/docs/aip-15) instead.
- **Body-only skills with `entry: skill.ts`** when the entry adds nothing the
  body couldn't express. Every additional file is a maintenance cost; default to
  body-only.

## See also

- [AIP-3 — SKILL.md spec](/docs/aip-3)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./SKILL.schema.json`](./SKILL.schema.json) — manifest validator
