---
schema: skills/v1
name: author-workflow
title: Author a WORKFLOW.md (AIP-15)
description:
  Walk through authoring a portable WORKFLOW.md manifest plus a defineWorkflow /
  defineStep entry for any agent runtime. Covers branching, parallelism,
  suspend/resume, approval gates, and compensation.
version: 1.0.0
tags: [aip-15, workflows, authoring, manifest, agentproto]
inputs:
  - name: goal
    type: string
    required: true
    description:
      One-paragraph description of the multi-step automation to express. The
      skill turns this into a step graph.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for step bodies. Default "ts". Accepts "ts", "py", "go",
      "rs", "js".
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new folder under `.workflows/<id>/`.
examples:
  - input:
      goal:
        When a contract is drafted, send it to legal for review; on approval
        send to the customer; on rejection loop back for revision.
    output:
      - .workflows/contract-review/WORKFLOW.md
      - .workflows/contract-review/workflow.ts
---

# Author a WORKFLOW.md (AIP-15)

Use this skill when the user asks to **build, draft, or define a workflow** that
orchestrates multiple steps with branching, parallelism, approvals,
suspend/resume, or compensation. The skill produces a valid
[AIP-15 WORKFLOW.md](/docs/aip-15) manifest plus an entry file that exposes the
standard `defineWorkflow` / `defineStep` signatures.

## When to use

- "When X happens, do A, then B, then if condition C continue with D else E."
- "I need a process where someone has to approve before we send the email."
- "Loop until the score is above threshold."
- "Run these three lookups in parallel, then merge their results."

## When NOT to use

- The automation is **a single tool call** → use the
  [AIP-14 tool-authoring skill](../../../aip-14/skills/author-tool/SKILL.md)
  instead.
- The automation is **read-only data shaping with no time-bounded steps** → it's
  probably a tool, not a workflow.
- The user wants to **call** an existing workflow — no authoring needed.

## Process

Eight steps. Each one matters; skipping the safety steps (approval,
compensation) produces workflows that look fine until they cause real damage on
bad input.

### 1. Decompose the goal into named steps

Read the user's goal. Identify each **discrete unit of work**. Naming
convention: kebab-case verb-phrases (`fetch-customer`, `send-invoice`,
`review-by-legal`).

Reject these anti-decompositions:

- One mega-step that does everything (defeats the format's value).
- Steps that combine unrelated work (a single step shouldn't both query _and_
  mutate).
- Steps named after their HOW instead of their WHAT (`fetch-with-axios` is
  wrong; `fetch-customer` is right).

### 2. Pick `kind` for each step

Eight kinds available — pick the most specific that fits:

| Kind          | When                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tool`        | A single tool call (most steps). Reference an existing [TOOL.md](../aip-14/) by id, or write the body in the entry.      |
| `branch`      | Conditional routing. The step itself does no work — it picks the next step from `branches[]` based on `when` conditions. |
| `parallel`    | Run N child step graphs concurrently; rejoin when all complete.                                                          |
| `suspend`     | Pause until an external event arrives (webhook, signal). State persists.                                                 |
| `approval`    | Pause for a human decision. Specialised suspend with named approvers.                                                    |
| `map`         | For-each over an array — same nested graph for each item.                                                                |
| `loop`        | Repeat a nested graph while a condition holds. Bounded by `max_iterations`.                                              |
| `subworkflow` | Invoke another `WORKFLOW.md`. Inputs/outputs are mapped through.                                                         |

If the user's description has an ambiguity (could be `branch` or
`if-else inside a tool`), prefer the explicit step. Each step is one audit-row.

### 3. Wire the input mappings

Each step's `inputs` field maps upstream values to that step's input schema. Use
the path grammar:

- `$workflow.inputs.<field>` — workflow-level input.
- `$steps.<step-id>.outputs.<field>` — output of an earlier step.
- Literals: `{ "kind": "literal", "value": <any> }`.

Rules:

- A step MAY only reference outputs of steps that have **already completed** in
  the graph order. Forward references are spec bugs.
- Inside a `parallel` branch, sibling-branch outputs are **not** visible until
  after the join.
- Inside a `map` body, `$item` and `$index` are reserved references to the
  current iteration.

### 4. Decide approvals for every mutating step

This is the safety contract. Walk every step and ask:

- Does this step mutate state? (Check the underlying tool's `mutates`.)
- If yes, does the user want every call gated, or only when input matches a
  policy?

Pick `approval` from:

- `auto` — read-only or low-risk-bounded mutations.
- `on-mutate` — gate when `mutates` is non-empty (default for unknown).
- `always` — gate every call (irreversible side effects: emails sent, payments
  charged, branches deleted).
- `policy:<ref>` — defer to a named host policy.

Default to **stricter** when uncertain. Workflow authors lose nothing by
over-gating during draft; under-gating loses real money.

### 5. Add compensation for mutating steps

Every step that mutates external state SHOULD declare a
`compensation: <step-id>` whose body undoes the mutation. The host walks back
through completed steps in reverse on failure.

Compensation steps:

- Take the original step's outputs as inputs.
- MUST be idempotent — the host MAY retry.
- Are themselves regular steps in the graph (`kind: "tool"` or
  `kind: "subworkflow"`).

Workflows that don't compensate leak partial state on failure. If a mutating
step CAN'T be undone (e.g. a sent email), document why in the body and accept
the risk explicitly — don't silently skip.

### 6. Set workflow-level policies

| Field                          | When to set                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout_ms`                   | Always. Default 600000 (10 min). Long-running workflows: bump to a sane upper bound.                                                   |
| `max_steps`                    | Defends against infinite loops. Default 100.                                                                                           |
| `risk_level`                   | Workflow-level autonomy gate. Use the max of step risks, or stricter.                                                                  |
| `triggers`                     | Only if the workflow runs on schedule / webhook / event. Manual-only is the default.                                                   |
| `approval`                     | Default applied when a step doesn't declare its own. Default `per-step`; pick `always` for fully gated workflows.                      |
| `inputsFiles` / `outputsFiles` | The workflow reads or writes files in the user's workspace. Declare each file by key + workspace path; the host stages and syncs them. |
| `runtime`                      | The workflow needs an explicit credential or outbound host. Default mode `sandbox` is safe; bump only when you need to opt out.        |

### 6a. Decide what files the workflow reads or writes

If the workflow reads or writes files in the user's workspace, declare them in
`inputsFiles` / `outputsFiles` instead of calling a workspace tool inside a
step. The host then stages each declared input from the workspace into a per-run
scratch directory before the workflow starts, and syncs each declared output
back to the workspace after it finishes.

Step bodies access files at `<inputData._workflowFsRoot>/<key>` — plain
`fs.readFile` / `fs.writeFile` against the manifest key, no host imports.

Always include `_workflowFsRoot: { type: string }` (optional) in the workflow's
`inputs` schema and in any step that reads it, so the host's schema validation
accepts the injected field.

```yaml
inputsFiles:
  source: { path: drafts/input.md, mode: ro }
outputsFiles:
  report:
    path: reports/<workflowId>-<isoDate>.md # tokens interpolated by host
    contentType: text/markdown
```

Use this whenever the work is "read X from the workspace, do Y, write Z to the
workspace." Calling a workspace tool inside a step still works for ad-hoc
access; the file contract is the right shape for _declared_ I/O.

### 6b. Decide on `runtime` mode

Default `runtime.mode` is `sandbox` — the host strips its own env, scopes the
filesystem to the per-run fs root, and blocks network. **Leave it implicit** for
the common case (no third-party credentials, no outbound calls). The workflow
body still uses tools to reach the host's services; sandboxing only affects what
the body itself can directly access.

Set `runtime` explicitly only when you need to:

- expose a credential to the body (`runtime.env: [STRIPE_API_KEY]`),
- allow outbound HTTP to a specific host (`runtime.network.egress`),
- raise the resource caps (`runtime.resources.timeoutMs / memoryMb`),
- or — only for host-vendor-shipped workflows, never for user-authored — request
  `runtime.mode: "in-process"`. The host will refuse this for workflows under a
  workspace folder, so don't bother for user code.

```yaml
runtime:
  mode: sandbox
  env: [STRIPE_API_KEY]
  network:
    egress: [api.stripe.com:443]
  resources:
    timeoutMs: 60000
```

When in doubt: omit `runtime` entirely. The default is the secure choice.

### 7. Compose the manifest + entry

Author `WORKFLOW.md`:

```md
---
name: <Display Name>
id: <kebab-id>
description: <…>
version: 1.0.0
entry: workflow.ts
inputs:  <jsonschema>
outputs: <jsonschema>
steps:
  - id: <step-id>
    kind: <tool|branch|parallel|suspend|approval|map|loop|subworkflow>
    ...
timeout_ms: <int>
max_steps: <int>
triggers: [...]
tags: [...]
---

## Overview

<narrative>

## Diagram

\`\`\`mermaid graph TD A[fetch] --> B{is paid?} B -->|yes| C[send-invoice] B
-->|no| D[mark-trial] \`\`\`

## Step responsibilities

<table>

## Errors & recovery

<table of error → recovery path>

## Examples

<sample run with input + step trace + output>
```

Author `workflow.ts` exposing the standard signatures:

```ts
import { defineWorkflow, defineStep } from "<host-runtime>"
import { z } from "zod"

const fetch = defineStep({
  id: "fetch-customer",
  kind: "tool",
  tool: "stripe-customer-lookup",
  inputs: { email: "$workflow.inputs.customerEmail" },
  outputs: z.object({ customerId: z.string(), pastDue: z.boolean() }),
  next: "route",
})

const route = defineStep({
  id: "route",
  kind: "branch",
  branches: [
    { when: "$steps.fetch-customer.outputs.pastDue == true", next: "dunning" },
    { when: "true", next: "send" },
  ],
})

// … other steps …

export default defineWorkflow({
  id: "invoice-flow",
  description: "...",
  inputSchema: z.object({ customerEmail: z.string().email() }),
  outputSchema: z.object({ status: z.string() }),
})
  .step(fetch)
  .branch(route)
  .step(send)
  .commit()
```

Mirror the manifest exactly. Drift between manifest and entry is a spec bug.

### 8. Validate

Validate the manifest against
[`./WORKFLOW.schema.json`](./WORKFLOW.schema.json):

```bash
npx ajv validate -s ./WORKFLOW.schema.json -d ./WORKFLOW.md
```

Fix every error before declaring success. Specifically check:

- All `next` references point to step ids that exist.
- All `$steps.<id>.outputs.<field>` references point to upstream steps with that
  field in their `outputs`.
- Every mutating step has either `compensation: <id>` set OR a body comment
  explaining why compensation is impossible.
- `triggers` only declares manual unless the user explicitly asked for cron /
  webhook / event.

## Output

Produce two files in the chosen folder:

```
<folder>/
  WORKFLOW.md     # the manifest
  workflow.ts     # (or workflow.py / …) — the entry exposing defineWorkflow/defineStep
```

Reply to the user with:

1. The folder you wrote to.
2. A diagram (ASCII or mermaid) of the step graph so they can verify routing.
3. **Highlight every step that mutates** with its `approval` class so they can
   confirm the safety contract.
4. List of compensations or — for steps that can't be undone — the explicit "no
   compensation, irreversible" caveat.
5. **Open assumptions**: defaults you guessed (timeouts, retry strategies, who
   the approvers are for `kind: "approval"` steps) the user might want to
   override.

Do NOT install or trigger the workflow yourself. Authoring ends with the files
written.

## See also

- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [AIP-14 — TOOL.md spec](/docs/aip-14) — workflows reference tools
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-13 — agentwork/v1](/docs/aip-13) — work-item linkage
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference WORKFLOW.md files (sequential,
  branched, parallel, with-approval, with-compensation)
