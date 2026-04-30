---
schema: skills/v1
name: author-operator
title: Author an OPERATOR.md (AIP-9)
description:
  Walk through authoring a portable OPERATOR.md manifest plus a defineOperator
  entry that turns the canonical operator shell into a runnable agent on any
  conforming runtime.
version: 1.0.0
tags: [aip-9, operators, authoring, manifest, agentproto]
inputs:
  - name: role
    type: string
    required: true
    description:
      One-paragraph description of the role the operator plays — what it owns,
      who it talks to, what it must NOT do. The skill turns this into identity +
      profile + skill/tool wiring.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the entry file. Default "ts". Accepts "ts", "py",
      "go", "rs", "js".
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new folder under `.operators/<id>/`.
examples:
  - input:
      role:
        A research analyst that monitors competitor pricing pages weekly, drafts
        a comparative brief, and posts it to the strategy channel for the
        founder to review.
    output:
      - .operators/research-analyst/OPERATOR.md
      - .operators/research-analyst/operator.ts
---

# Author an OPERATOR.md (AIP-9)

Use this skill when the user asks to **build, draft, or define an operator** —
the agent shell that powers an AI-company role. The skill produces a valid
[AIP-9 OPERATOR.md](/docs/aip-9) manifest plus an entry file that exposes the
standard `defineOperator` signature.

An operator is **one shell, configured many ways**. The shape is fixed:
identity, profile, skills, tools, memory, governance, capabilities,
participation. The contents move per role.

## When to use

- "Make a researcher operator that monitors competitor pricing."
- "Draft a coordinator operator that triages incoming requests."
- "Build an operator that sends weekly investor updates."

## When NOT to use

- The user wants a **single tool** an operator can call → use the
  [AIP-14 tool-authoring skill](../../../aip-14/skills/author-tool/SKILL.md)
  instead.
- The user wants a **multi-step process** with branching, suspend, or approvals
  → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/skills/author-workflow/SKILL.md)
  instead.
- The user wants to **invoke** an existing operator — no authoring needed; just
  dispatch.

## Process

Eight steps. The first two fix who the operator is; the next three attach what
it can do; the last three lock the safety contract and validate.

### 1. Fix identity

- Pick `id`: kebab-case, 2–64 chars, the slug a workflow will dispatch by
  (`research-analyst`, not `operator-1`).
- Write `name`: the human display label.
- Write `persona_summary`: one sentence. The role, in plain prose, written for a
  teammate to read at a glance — "Reads competitor pages, writes comparative
  briefs, never sends customer-facing copy."

These three fields together MUST uniquely identify the operator inside its host.
Two operators with the same `id` is a registration error.

### 2. Author the profile

`profile` is the long-form prose the runtime stitches into the operator's system
prompt. It has three required parts:

- `role` — the job title and primary responsibility.
- `voice` — tone + register + first-person pronouns vs neutral.
- `boundaries` — what the operator MUST NOT do, in imperative voice. Boundaries
  are NORMATIVE — they show up at every turn.

A strong profile reads like a real role description. A weak one reads like a
marketing tagline. Avoid the latter.

### 3. Wire the skills

`skills[]` is an array of [AIP-3 SKILL.md](/docs/aip-3) refs the operator loads.
Each entry is either:

- A string id (`competitive-analysis`) resolved from the host's skill catalog,
  or
- An object `{ id, source?: <url|path>, version?, allow? }` for per-skill
  overrides.

Rules:

- **Skills are additive** — multiple skills can register tools against the same
  operator. The host de-duplicates by tool id.
- **Skill provenance matters** — a skill from an untrusted source could subvert
  the operator's role (see AIP-9 Security Considerations). Pin `source` and,
  where possible, `version`.
- **No skill chaining at author time** — if skill A requires skill B, the host
  resolves transitively at registration. Authors list only top-level skills.

Don't bundle a "do everything" mega-skill. One operator, several focused skills.

### 4. Wire the tools

`tools[]` is an array of [AIP-14 TOOL.md](/docs/aip-14) refs plus **MCP
servers** the operator may invoke. Each entry is:

- A string id (`pricing-snapshot`) for catalog tools, or
- `{ id, source?, scope? }` to narrow a tool's scope to this operator (e.g.
  `scope: { workspace: "/notes/research/*" }`).
- `{ kind: "mcp", server: <url>, allow?: [<tool-id>...] }` for an MCP server.
  `allow` narrows which of the server's tools this operator can see.

Rules:

- **Tools loaded by skills are merged in.** You don't need to re-list them; the
  host de-duplicates.
- **Tool scope tightening is allowed; widening is not.** A tool with
  `mutates: ["workspace:/*"]` can be narrowed to `["workspace:/notes/*"]` here,
  never widened.
- **Approval class is preserved.** A tool authored as `approval: always` stays
  `always` even if the operator's governance policy is permissive.

### 5. Configure memory

`memory` declares what the operator carries across turns. Three sub-fields:

- `kind` — `none` | `thread` | `operator-context` | `external`.
  - `none` — stateless. Each turn is fresh.
  - `thread` — operator remembers the current conversation only.
  - `operator-context` — operator carries facts across all threads it
    participates in (the default for a "real" role).
  - `external` — host-defined backend (vector store, KV, …). Specify
    `external.uri` + `external.namespace`.
- `policy` — `append-only` | `redactable` | `summarising`. Most operators use
  `summarising` (long-running operators that compact old turns into rolling
  summaries).
- `share_with[]` — operator ids that may **read** this operator's memory. Empty
  by default. Sharing is one-way; declare it on the source side.

Memory is per-operator on purpose. An operator's "personality through history"
is what makes a coordinator different from a researcher even when both run the
same shell.

### 6. Bind governance

`governance` is the [AIP-7](/docs/aip-7) binding. Three required parts:

- `policies[]` — policy refs the operator MUST consult before privileged
  actions. Format `policy:<ref>` resolved against the host's policy registry.
- `audit_log` — the audit channel the operator writes to. Format `audit:<ref>`
  (`audit:default`, `audit:legal-actions`, …).
- `autonomy` — `autonomous` | `supervised` | `gated`.
  - `autonomous` — runs on its own; gated tools still prompt.
  - `supervised` — every privileged action prompts.
  - `gated` — operator does not run at all without per-turn human approval.
    Reserved for highest-risk roles.

The governance binding gives the operator **awareness** of what it can and
cannot do, not just runtime rejection. The system prompt synthesised from
`profile` MUST reflect the boundaries the binding implies.

### 7. Set capabilities + participation

`capabilities` is a flat array of capability strings the operator declares it
CAN do (`research`, `summarisation`, `email-drafting`). The host matches against
tool / skill capability requirements and surfaces `unmet-capability` at
registration if any required capability is missing.

`participation` controls conversation behaviour:

- `mode` — `mention-only` | `proactive` | `silent`. `mention-only` is the
  default and the safest. `proactive` lets the operator speak unprompted
  (rate-limited by the host). `silent` joins threads to read only.
- `pass_when` — predicate string (host-evaluated) for when to emit a `pass`
  instead of a turn. Default `"!message.matchesRole(self)"`.
- `reactions` — boolean; whether the operator emits 👍 / ✅ / 🚧 reactions in
  addition to (or instead of) full turns.

### 8. Compose + validate

Author `OPERATOR.md`:

```md
---
name: <Display Name>
id: <kebab-id>
persona_summary: <one-line>
version: 1.0.0
entry: operator.ts
profile:
  role: <…>
  voice: <…>
  boundaries: [<…>]
skills: [<skill-ref>, …]
tools: [<tool-ref>, …]
memory:
  kind: <…>
  policy: <…>
  share_with: [<…>]
governance:
  policies: [<…>]
  audit_log: <…>
  autonomy: <…>
capabilities: [<…>]
participation:
  mode: <…>
  pass_when: <…>
  reactions: <bool>
tags: [<…>]
---

## Profile (long-form)

<full prose the runtime stitches into the system prompt>

## Skills

<table mapping each skill ref to what it adds>

## Tools

<table mapping each tool ref to what it lets the operator do>

## Boundaries

<numbered list of MUST-NOT rules>

## Examples

<sample turn or two showing the operator in voice>
```

Author `operator.ts`:

```ts
import { defineOperator } from "<host-runtime>"

export default defineOperator({
  id: "research-analyst",
  personaSummary: "...",
  profile: { role: "...", voice: "...", boundaries: ["..."] },
  skills: ["competitive-analysis"],
  tools: ["pricing-snapshot", "append-to-notes"],
  memory: { kind: "operator-context", policy: "summarising" },
  governance: {
    policies: ["policy:research-public-only"],
    auditLog: "audit:default",
    autonomy: "supervised",
  },
  capabilities: ["research", "summarisation"],
  participation: { mode: "mention-only", reactions: true },
})
```

Validate the manifest against
[`./OPERATOR.schema.json`](./OPERATOR.schema.json):

```bash
npx ajv validate -s ./OPERATOR.schema.json -d ./OPERATOR.md
```

Fix every error. Specifically check:

- All skill refs resolve against the host's [AIP-3](/docs/aip-3) skill catalog.
- All tool refs resolve against the host's [AIP-14](/docs/aip-14) tool catalog
  (or are valid MCP server bindings).
- `governance.policies[]` resolve against the host's [AIP-7](/docs/aip-7) policy
  registry.
- `capabilities` cover everything the loaded skills + tools require. Missing
  capabilities surface as `unmet-capability` at registration.
- `memory.share_with[]` references are operators that exist (or remove the
  entry).

## Output

Produce two files in the chosen folder:

```
<folder>/
  OPERATOR.md     # the manifest
  operator.ts     # (or operator.py / …) — the entry exposing defineOperator
```

Reply to the user with:

1. The folder you wrote to.
2. A one-line **identity recap**: `<id>` — `<persona_summary>`.
3. The **autonomy class** (`autonomous` / `supervised` / `gated`) so they verify
   the safety dial.
4. Skills + tools wired in, as a flat list.
5. **Open assumptions** — defaults you guessed (memory policy, participation
   mode, audit channel) the user might want to override.

Do NOT install or invoke the operator yourself. Authoring ends with the files
written.

## See also

- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-3 — SKILL.md](/docs/aip-3) — skills the operator wires in
- [AIP-14 — TOOL.md](/docs/aip-14) — tools the operator wires in
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — file representation
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference OPERATOR.md files (minimal,
  with-tools, with-skills, with-workflow, governed, specialised, composing)
