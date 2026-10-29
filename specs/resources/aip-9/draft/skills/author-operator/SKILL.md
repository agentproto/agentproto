---
schema: skill/v1
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
      who it talks to, what it must NOT do. The skill turns this into a role
      binding + persona + boundaries + skill/tool wiring.
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
an agent holding a role in an organization. The skill produces a valid
[AIP-9 OPERATOR.md](/docs/aip-9) manifest plus an entry file that exposes the
standard `defineOperator` signature.

An operator is **written like an agent and always resolves into one**. It says
which [AIP-47](/docs/aip-47) role it holds and how the role's slots are filled,
where it lives (`home`), and which persona, identity and policy it carries. It
does not say how it runs: that is `runtime`, and only the portable part.

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

Eight steps. The first two fix who the operator is and what job it holds; the
next three attach what it can do; the last three lock the safety contract and
validate.

### 1. Fix identity

- Pick `id`: kebab-case, 2–64 chars, the slug a workflow will dispatch by
  (`research-analyst`, not `operator-1`).
- Write `name`: the human display label.
- Write `persona_summary`: one sentence. The role, in plain prose, written for a
  teammate to read at a glance — "Reads competitor pages, writes comparative
  briefs, never sends customer-facing copy."

These three fields together MUST uniquely identify the operator inside its host.
Two operators with the same `id` is a registration error.

### 2. Bind the role, the persona and the boundaries

The job is a role, not prose in the operator file.

- `role` — the [AIP-47](/docs/aip-47) role held: a slug (`role: research`) or
  `{ ref, bind?, with? }`. `bind` fills the role's slots (one value per slot the
  role declares, each matching the slot's type); `with` carries rare scalar
  parameters. A role is intent, never permission: binding it grants nothing.
  Leave `role` out only for files that predate it; a reader then falls back to
  `metadata.roleSlug` and warns.
- `persona` — the [AIP-25](/docs/aip-25) persona ref that carries the voice
  (tone, register, pronouns). Do not write `profile.voice`: it is deprecated.
- `boundaries` — what the operator MUST NOT do, in imperative voice, as a
  top-level array. Boundaries are NORMATIVE and show up at every turn. Do not
  write `profile.boundaries`: it is dropped.
- `profile.role` — optional position or title prose ("Head of support, Paris
  office"). It is not a role ref.
- `home` — the AIP-54 ref of the workspace node the operator lives in, when it
  has one.

The body of `OPERATOR.md` is only what is specific to this holder of the role.
The mission and responsibilities belong to the role, so every holder shares them.

### 3. Wire the skills

`skills[]` is an array of [AIP-3 SKILL.md](/docs/aip-3) refs the operator loads.
Each entry is either:

- A string id (`competitive-analysis`) resolved from the host's skill catalog,
  or
- An [AIP-54](/docs/aip-54) ref object `{ ref | file | inline }`. A legacy object
  `{ id, source?: <url|path>, version?, allow? }` is still accepted.

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

`memory` is the [AIP-42](/docs/aip-42) block:

- `enabled: false` — stateless. Each turn is fresh.
- `scope` — `per-conversation` | `per-thread` | `per-workspace` | `none`.
- `store`, `anchors`, `retention_turns`, `semantic` — as in AIP-42.

An operator's memory belongs to the operator, not to a session: it survives a
respawned session. Ownership does not widen visibility; an item is visible in a
session only if the session's node projection includes its node.

The earlier `memory.kind` and `memory.policy` are still accepted (see the table
in AIP-9). `memory.share_with[]` is deprecated: share by granting read on the
memory store ([AIP-38](/docs/aip-38)).

### 6. Bind the policy and the autonomy

Access is a policy bound on the operator, never a property of the role:

- `policy` — the [AIP-38](/docs/aip-38) policy ref the operator is bound to. The
  effective policy is this policy composed with the policy of the session's node
  chain, most restrictive wins.
- `autonomy` — the integer 0 to 10 (0 always asks, 10 acts freely). A gated
  operator (0) MUST NOT be proactive: `participation.mode` is `mention-only` or
  `silent`.
- A tool you declare that the policy does not grant refuses registration. A tool
  only the role declares is dropped with `intent_unsatisfied`.

The earlier `governance` block (`policies[]`, `audit_log`, and `autonomy` as
`autonomous` | `supervised` | `gated`) is still accepted; `gated` is 0,
`supervised` is 5, `autonomous` is 10. Audit goes through [AIP-7](/docs/aip-7).

### 7. Set capabilities + participation

`capabilities` is a flat array of capability strings the operator declares it
CAN do (`research`, `summarisation`, `email-drafting`). The host matches against
tool / skill capability requirements and surfaces `unmet-capability` at
registration if any required capability is missing.

`participation` is optional (an operator that never joins a shared thread omits
it) and controls conversation behaviour:

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
entry: operator.ts
role:
  ref: <role-ref>
  bind: { <slot>: <value>, … }
home: <node-ref>
persona: <persona-ref>
identity: <identity-ref>
policy: <policy-ref>
autonomy: <0..10>
boundaries: [<…>]
skills: [<skill-ref>, …]
tools: [<tool-ref>, …]
memory:
  scope: <…>
runtime:
  kind: <in-process | agent-cli>
capabilities: [<…>]
participation:
  mode: <…>
  pass_when: <…>
  reactions: <bool>
tags: [<…>]
---

<what is specific to this holder of the role>

## Skills

<table mapping each skill ref to what it adds>

## Tools

<table mapping each tool ref to what it lets the operator do>

## Examples

<sample turn or two showing the operator in voice>
```

Author `operator.ts`:

```ts
import { defineOperator } from "<host-runtime>"

export default defineOperator({
  id: "research-analyst",
  personaSummary: "...",
  role: { ref: "research" },
  persona: "ws://personas/evidence-first",
  boundaries: ["..."],
  skills: ["competitive-analysis"],
  tools: ["pricing-snapshot", "append-to-notes"],
  memory: { scope: "per-workspace" },
  policy: "ws://policies/research-public-only",
  autonomy: 5,
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
- `role.bind` names only slots the role declares, binds every required slot, and
  each value matches the slot's type.
- `policy` resolves against the host's [AIP-38](/docs/aip-38) policy registry.
- `capabilities` cover everything the loaded skills + tools require. Missing
  capabilities surface as `unmet-capability` at registration.
- Nothing in the file widens access: access comes from `policy` and the node
  chain, not from the role.

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
3. The **autonomy** integer (0 always asks, 10 acts freely) so they verify the
   safety dial.
4. Skills + tools wired in, as a flat list.
5. **Open assumptions** — defaults you guessed (memory policy, participation
   mode, audit channel) the user might want to override.

Do NOT install or invoke the operator yourself. Authoring ends with the files
written.

## See also

- [AIP-9 — OPERATOR (operator/v1)](/docs/aip-9)
- [AIP-47 — ROLE.md](/docs/aip-47) — the role an operator holds
- [AIP-3 — SKILL.md](/docs/aip-3) — skills the operator wires in
- [AIP-14 — TOOL.md](/docs/aip-14) — tools the operator wires in
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-6 — company/v1](/docs/aip-6) — file representation
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference OPERATOR.md files (minimal,
  with-tools, with-skills, with-workflow, governed, specialised, composing,
  role slots with a home node, and the earlier shape)
