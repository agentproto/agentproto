---
schema: skills/v1
name: author-skill
title: Author a SKILL.md (AIP-3)
description:
  Walk through authoring a portable SKILL.md manifest plus optional defineSkill
  entry for any agent runtime. Covers identity, capabilities, inputs, install
  location, and validation. This skill IS itself a valid AIP-3 skill — eat the
  dogfood.
version: 1.0.0
tags: [aip-3, skills, authoring, manifest, agentproto]
inputs:
  - name: purpose
    type: string
    required: true
    description:
      One-sentence statement of what the skill teaches the agent to do. The
      skill turns this into name + title + description + tags.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the optional entry file. Default "ts". Accepts "ts",
      "py", "go", "rs", "js". If omitted, the manifest is body-only (no entry
      required).
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new folder under `.skills/<name>/`.
examples:
  - input:
      purpose:
        Teach the agent to draft GitHub PR descriptions in our house style.
    output:
      - .skills/draft-pr-description/SKILL.md
---

# Author a SKILL.md (AIP-3)

Use this skill when the user asks to **build, draft, or define a skill** — a
reusable instruction package that another agent will load and follow. The skill
produces a valid [AIP-3 SKILL.md](/docs/aip-3) manifest and, optionally, a thin
entry file exposing the standard `defineSkill` signature.

## When to use

- "Make a skill that walks the agent through writing a release note."
- "Wrap our company's content style guide as a skill."
- "I have a procedure document — turn it into a portable skill."

## When NOT to use

- The user wants a **single function call** the agent invokes → use the
  [AIP-14 tool-authoring skill](../../../aip-14/skills/author-tool/SKILL.md)
  instead.
- The user wants a **multi-step branching automation** → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/skills/author-workflow/SKILL.md).
- The user wants the agent to **load** an existing skill — no authoring needed;
  that's an adapter call, not a new artifact.

## Process

Eight steps. The body of a skill is mostly prose, but the frontmatter is what
makes it portable — so spend the time there.

### 1. Fix identity

Three identity fields. All three are mandatory.

- **`name`**: kebab-case, 2–64 chars, descriptive of the verb the skill teaches.
  (`draft-pr-description`, not `skill-1`.)
- **`title`**: human display label, sentence case.
- **`version`**: semver. `1.0.0` for first publish; bump on breaking change to
  inputs / required tools.

Add `author` if the skill will be redistributed — `Name <email>` is the
conventional shape, mirroring the AIP authorship style.

### 2. Pin the schema version

Set `schema: skills/v1`. This is normative; the host's parser dispatches on it.
A skill with a missing or unknown `schema` value MUST be rejected by the
adapter, so always declare it explicitly.

### 3. Write the description

One sentence, written **to the LLM caller**. Tell it what the skill teaches —
and equally importantly, when NOT to invoke it. The description is what the host
indexes for skill selection; vague descriptions produce wrong-skill picks.

Bad: "Skill for PRs." Good: "Walk the agent through drafting a GitHub PR
description in our house style. Use when the user asks to write/improve a PR
summary; do NOT use for review comments or commit messages."

### 4. Choose tags

Tags are how the host's catalog clusters skills. Lowercase, kebab-case, no
leading symbols. Aim for 3–6 tags covering:

- The **domain** (`marketing`, `engineering`, `support`).
- The **artifact** the skill produces (`pull-request`, `release-note`, `email`).
- The **AIP family** if relevant (`aip-3`, `agentproto`).

Avoid stop-word tags (`general`, `useful`, `agent`). They never help the catalog
disambiguate.

### 5. Sketch the inputs

`inputs` is an array of named parameters the skill expects from its caller. Each
input has `name`, `type`, `required`, and a `description`. The LLM reads these —
empty or vague descriptions train the agent to hallucinate values.

Rules:

- `type` is one of `string`, `number`, `boolean`, `object`. Anything richer goes
  in the body as guidance, not as a typed input.
- Mark `required: true` only when the skill genuinely cannot proceed without the
  value.
- If the skill takes nothing, omit the field entirely — `inputs: []` is valid
  but `inputs` absent is the conventional empty form.

### 6. Declare tools (if any)

If the skill expects specific tools to be available in the host's catalog, list
them under `tools` (array of tool ids). The host MAY refuse activation if a
declared tool is unknown.

```yaml
tools:
  - github-create-pr
  - git-status
```

This is **declaration**, not invocation — the body still drives which tool gets
called when. A skill with no tool dependencies omits the field.

### 7. Add capabilities (if scoped)

If the skill needs host capabilities beyond plain text generation (network
access, secrets, fs scopes), declare them under `capabilities`. Same vocabulary
as AIP-14's `requires`:

```yaml
capabilities:
  network: ["api.github.com"]
  secrets: ["github-token"]
```

The host's [AIP-7](/docs/aip-7) gating runs against these grants before the
skill activates. Be narrow — least-privilege survives audit. A skill that only
emits prose declares no capabilities.

### 8. Compose the body

The body is markdown. Write the skill's instructions for the agent. Sections
that consistently work well:

- **`## When to use`** — concrete triggers, quoted user requests.
- **`## When NOT to use`** — adjacent skills the user might confuse this with.
- **`## Process`** — numbered steps the agent follows.
- **`## Output`** — what the agent reports back when done.

The host typically passes the body verbatim into the agent's context as
instructions. Keep prose tight; long bodies eat the context window.

### 9. Pick install location

Skills live in one of three places:

| Location                           | When                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `.skills/<name>/` in the workspace | Per-workspace skill the agent authors for itself. Versioned with the workspace.                     |
| `~/.skills/<name>/`                | User-level skill, available across workspaces.                                                      |
| Host catalog (DB-backed)           | Org-shared skill installed by an admin. The author commits it; the host syncs from the source repo. |

Default to workspace-scoped during authoring; promote to user/host once the
skill stabilises. The [ADAPTER.md](./ADAPTER.md) describes how each scope is
loaded.

### 10. Validate

Validate the manifest against [`./SKILL.schema.json`](./SKILL.schema.json):

```bash
npx ajv validate -s ./SKILL.schema.json -d ./SKILL.md
```

Fix every error before declaring success. Specifically check:

- `schema: skills/v1` is present.
- `name` matches the kebab-case pattern.
- Every input has a non-empty `description`.
- Tags are lowercase kebab-case.
- If `tools` is declared, every id resolves in the host's catalog (the adapter
  performs this check at registration).

### 11. (Optional) Add an entry file

Most skills are body-only — the markdown IS the skill. But a host MAY accept an
entry file that exposes `defineSkill` for cases where the skill needs runtime
hooks (custom input pre-processing, dynamic body assembly, post-run reporting):

```ts
// skill.ts
import { defineSkill } from "<host-runtime>"
import { z } from "zod"

export default defineSkill({
  name: "draft-pr-description",
  inputSchema: z.object({
    diffSummary: z.string(),
    issueRef: z.string().optional(),
  }),
  body: ({ input }) => `…assembled instruction prose…`,
})
```

The signature is normative across runtimes (Python: `define_skill`, Go:
`DefineSkill`, etc.). If the host language is TS/JS, prefer body-only manifests
unless there's a clear reason for the entry; every additional file is a
maintenance cost.

## Output

Produce one (sometimes two) files in the chosen folder:

```
<folder>/
  SKILL.md       # the manifest (always)
  skill.ts       # (optional) — the entry exposing defineSkill
```

Reply to the user with:

1. The folder you wrote to.
2. A one-line summary of identity (`name@version`) and the top tags so they can
   verify the catalog placement.
3. The `capabilities` block (or "no capabilities required") so they confirm the
   safety surface before installing.
4. **Open assumptions** — defaults you guessed (e.g. tags chosen, install scope)
   the user might want to override.

Do NOT install or invoke the skill yourself. Authoring ends with the files
written; installation is a separate step the user (or another skill) initiates.

## See also

- [AIP-3 — SKILL.md spec](/docs/aip-3)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-14 — TOOL.md spec](/docs/aip-14) — for `tools` references
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference SKILL.md files for common
  patterns (minimal, capability-gated, with-inputs, composing-other-skills,
  tool-authoring, vendor-extension)
