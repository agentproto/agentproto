# EXAMPLES.md — WORKFLOW.md reference patterns

Reference `WORKFLOW.md` files exemplifying common patterns. Each example is a
self-contained manifest a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Sequential pipeline](#1-sequential-pipeline)
2. [Branching on a condition](#2-branching-on-a-condition)
3. [Parallel fan-out + join](#3-parallel-fan-out--join)
4. [Human approval gate](#4-human-approval-gate)
5. [Suspend + resume on external event](#5-suspend--resume-on-external-event)
6. [Compensating saga](#6-compensating-saga)
7. [Map over a collection](#7-map-over-a-collection)
8. [Refinement loop](#8-refinement-loop)
9. [Sub-workflow composition](#9-sub-workflow-composition)
10. [File contract — files-in / files-out](#10-file-contract--files-in--files-out)
11. [Sandboxed workflow with explicit env + egress](#11-sandboxed-workflow-with-explicit-env--egress)
12. [Shaped output with `result`](#12-shaped-output-with-result)

---

## 1. Sequential pipeline

Three tools in order. The simplest workflow shape — most useful when each step's
output feeds the next.

```md
---
name: Pricing Snapshot Brief
id: pricing-snapshot-brief
description:
  Fetch a SaaS pricing page, parse it, write a markdown summary into the
  workspace. Read-only network, single-file write.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    productUrl: { type: string, format: uri }
  required: [productUrl]
outputs:
  type: object
  properties:
    notePath: { type: string }
  required: [notePath]
steps:
  - id: fetch
    kind: tool
    tool: pricing-snapshot
    inputs: { productUrl: $input.productUrl }
    outputs: { type: object, properties: { tiers: { type: array } } }
    next: summarise
  - id: summarise
    kind: tool
    tool: text-summarise
    inputs: { content: $steps.fetch.tiers }
    outputs: { type: object, properties: { markdown: { type: string } } }
    next: write
  - id: write
    kind: tool
    tool: append-to-notes
    inputs:
      filename: pricing.md
      line: $steps.summarise.markdown
    outputs: { type: object, properties: { path: { type: string } } }
    next: $end
timeout_ms: 60000
tags: [pricing, brief, sequential]
---
```

---

## 2. Branching on a condition

A `kind: "branch"` step routes based on prior output. The branch step itself
does no work — it only decides where to go next.

```md
---
name: Lead Triage
id: lead-triage
description:
  Look up a lead's company size, route enterprise leads to sales-ops, SMB leads
  to self-serve email flow.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    email: { type: string, format: email }
  required: [email]
outputs:
  type: object
  properties:
    route: { enum: [enterprise, smb] }
steps:
  - id: enrich
    kind: tool
    tool: clearbit-enrich
    inputs: { email: $input.email }
    outputs:
      type: object
      properties:
        companySize: { type: integer }
    next: route

  - id: route
    kind: branch
    branches:
      - when: $steps.enrich.companySize >= 500
        next: assign-ae
      - when: true
        next: smb-email
    default: $end

  - id: assign-ae
    kind: tool
    tool: salesforce-assign-account-exec
    inputs: { email: $input.email }
    outputs: { type: object, properties: { ownerId: { type: string } } }
    approval: on-mutate
    next: $end

  - id: smb-email
    kind: tool
    tool: send-email-brevo
    inputs:
      to: $input.email
      subject: "Welcome to <product>"
      body: <…template…>
    approval: always
    next: $end
tags: [crm, branching, lead]
---
```

---

## 3. Parallel fan-out + join

Three lookups concurrently, merge the results.

```md
---
name: Customer 360
id: customer-360
description:
  Pull a customer's data from Stripe, HubSpot, and Linear in parallel; merge
  into one summary card.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    customerEmail: { type: string, format: email }
  required: [customerEmail]
outputs:
  type: object
  properties:
    summary: { type: object }
steps:
  - id: enrich
    kind: parallel
    branches:
      - id: stripe
        steps:
          - id: stripe-lookup
            kind: tool
            tool: stripe-customer-lookup
            inputs: { email: $input.customerEmail }
            outputs: { type: object }
            next: $end
        next: merge
      - id: hubspot
        steps:
          - id: hubspot-lookup
            kind: tool
            tool: hubspot-contact-lookup
            inputs: { email: $input.customerEmail }
            outputs: { type: object }
            next: $end
        next: merge
      - id: linear
        steps:
          - id: linear-search
            kind: tool
            tool: linear-issues-by-customer
            inputs: { email: $input.customerEmail }
            outputs: { type: object }
            next: $end
        next: merge
    next: merge

  - id: merge
    kind: tool
    tool: merge-objects
    inputs:
      stripe: $steps.enrich.stripe
      hubspot: $steps.enrich.hubspot
      linear: $steps.enrich.linear
    outputs: { type: object }
    next: $end
timeout_ms: 30000
tags: [crm, parallel, customer]
---
```

---

## 4. Human approval gate

A `kind: "approval"` step pauses for a named approver. The audit log captures
the decision per [AIP-7](/docs/aip-7).

```md
---
name: Contract Send
id: contract-send
description:
  Generate a contract draft, send to legal for review, dispatch to customer on
  approval.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    customerId: { type: string }
    productSku: { type: string }
  required: [customerId, productSku]
outputs:
  type: object
  properties:
    sentAt: { type: string, format: date-time }
steps:
  - id: draft
    kind: tool
    tool: contract-draft
    inputs:
      customerId: $input.customerId
      sku: $input.productSku
    outputs:
      type: object
      properties: { fileId: { type: string } }
    next: legal-review

  - id: legal-review
    kind: approval
    prompt:
      "Legal review required for contract draft. Open the artifact, read the
      body, approve to send to the customer or reject with notes."
    artifacts:
      - $steps.draft.fileId
    approvers:
      - role: legal
      - role: founder
    timeout_ms: 86400000
    on_approve: { next: send }
    on_reject: { next: revise }
    on_timeout: escalate

  - id: revise
    kind: tool
    tool: contract-revise
    inputs:
      fileId: $steps.draft.fileId
    outputs: { type: object, properties: { fileId: { type: string } } }
    next: legal-review

  - id: escalate
    kind: tool
    tool: notify-founder
    inputs:
      message: "Contract draft pending review for >24h"
    next: $end

  - id: send
    kind: tool
    tool: send-contract-to-customer
    inputs:
      customerId: $input.customerId
      fileId: $steps.draft.fileId
    outputs: { type: object, properties: { sentAt: { type: string } } }
    approval: always
    next: $end
timeout_ms: 604800000 # 7 days — handles the human-in-the-loop wait
tags: [legal, contract, approval, hitl]
---
```

---

## 5. Suspend + resume on external event

The workflow pauses waiting for `stripe.charge.succeeded`. Run state persists;
when the event arrives, the runtime resumes from the next step.

```md
---
name: Onboarding After Payment
id: onboarding-after-payment
description:
  Send a welcome email immediately, then wait for the first successful charge,
  then provision the customer's workspace.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    customerId: { type: string }
    email: { type: string, format: email }
  required: [customerId, email]
outputs:
  type: object
  properties:
    workspaceId: { type: string }
steps:
  - id: welcome
    kind: tool
    tool: send-email-brevo
    inputs:
      to: $input.email
      subject: "Welcome — set up your workspace"
      body: <…template…>
    approval: always
    next: wait-payment

  - id: wait-payment
    kind: suspend
    resume:
      on: ["stripe.charge.succeeded", "stripe.subscription.cancelled"]
      timeout_ms: 2592000000 # 30 days
      on_timeout: cancel
    outputs:
      type: object
      properties:
        eventName: { type: string }
        chargeId: { type: string }
    next: route-event

  - id: route-event
    kind: branch
    branches:
      - when: $steps.wait-payment.eventName == "stripe.charge.succeeded"
        next: provision
      - when: true
        next: $end

  - id: provision
    kind: tool
    tool: provision-workspace
    inputs: { customerId: $input.customerId }
    outputs: { type: object, properties: { workspaceId: { type: string } } }
    next: $end
timeout_ms: 2592000000
suspendable: true
tags: [onboarding, async, suspend]
---
```

---

## 6. Compensating saga

Each mutating step has a compensation. If a downstream step throws, the runtime
walks back through completed steps in reverse and runs each compensation.

```md
---
name: Order Fulfillment Saga
id: order-fulfillment-saga
description:
  Reserve inventory, charge card, ship. If any step fails after the previous
  succeeded, undo the predecessors via compensations.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    orderId: { type: string }
  required: [orderId]
outputs:
  type: object
  properties:
    status: { enum: [shipped, rolled-back] }
steps:
  - id: reserve
    kind: tool
    tool: inventory-reserve
    inputs: { orderId: $input.orderId }
    outputs: { type: object, properties: { reservationId: { type: string } } }
    compensation: release-reservation
    next: charge

  - id: release-reservation
    kind: tool
    tool: inventory-release
    inputs: { reservationId: $steps.reserve.reservationId }
    outputs: { type: object }
    next: $end

  - id: charge
    kind: tool
    tool: stripe-charge
    inputs:
      orderId: $input.orderId
      amountUsd: 100 # placeholder — real amount comes from prior step in production
    outputs: { type: object, properties: { chargeId: { type: string } } }
    approval: always
    compensation: refund
    next: ship

  - id: refund
    kind: tool
    tool: stripe-refund
    inputs: { chargeId: $steps.charge.chargeId }
    outputs: { type: object }
    next: $end

  - id: ship
    kind: tool
    tool: ship-package
    inputs:
      orderId: $input.orderId
      reservationId: $steps.reserve.reservationId
    outputs: { type: object, properties: { trackingId: { type: string } } }
    approval: on-mutate
    next: $end
tags: [order, saga, compensation, irreversible]
---
```

---

## 7. Map over a collection

Run the same nested graph for each item in an array.

```md
---
name: Bulk Lead Triage
id: bulk-lead-triage
description:
  For each email in the input list, run the lead-triage workflow.
  Concurrency-capped at 5 to stay under upstream rate limits.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    emails:
      { type: array, items: { type: string, format: email }, maxItems: 100 }
  required: [emails]
outputs:
  type: object
  properties:
    results: { type: array }
steps:
  - id: triage-each
    kind: map
    over: $input.emails
    parallelism: 5
    steps:
      - id: triage
        kind: subworkflow
        workflow: lead-triage
        inputs: { email: $item }
        outputs: { type: object }
        next: $end
    outputs:
      type: array
      items: { type: object }
    next: $end
tags: [bulk, map, lead]
---
```

---

## 8. Refinement loop

Repeat a generate-then-evaluate cycle until the score crosses a threshold OR
`max_iterations` is reached.

```md
---
name: Iterative Copy Refinement
id: iterative-copy-refinement
description:
  Generate marketing copy, score it against brand guidelines, refine until the
  score is ≥0.8 or 5 iterations elapse.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    brief: { type: string }
  required: [brief]
outputs:
  type: object
  properties:
    finalCopy: { type: string }
    score: { type: number }
steps:
  - id: refine
    kind: loop
    while: $steps.evaluate.score < 0.8
    max_iterations: 5
    steps:
      - id: generate
        kind: tool
        tool: copy-generate
        inputs:
          brief: $input.brief
          previousAttempt: $steps.evaluate.feedback
        outputs: { type: object, properties: { copy: { type: string } } }
        next: evaluate

      - id: evaluate
        kind: tool
        tool: brand-score
        inputs: { copy: $steps.generate.copy }
        outputs:
          type: object
          properties:
            score: { type: number }
            feedback: { type: string }
        next: $end
    next: $end
tags: [generation, loop, marketing]
---
```

---

## 9. Sub-workflow composition

A workflow that calls another workflow as a black box.

```md
---
name: Customer Renewal
id: customer-renewal
description:
  At renewal time, run a customer-360 lookup, then dispatch the contract-send
  workflow with the renewed terms.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    customerId: { type: string }
    customerEmail: { type: string, format: email }
  required: [customerId, customerEmail]
outputs:
  type: object
  properties:
    sentAt: { type: string, format: date-time }
steps:
  - id: lookup
    kind: subworkflow
    workflow: customer-360
    inputs: { customerEmail: $input.customerEmail }
    outputs:
      type: object
      properties: { summary: { type: object } }
    next: send-contract

  - id: send-contract
    kind: subworkflow
    workflow: contract-send
    inputs:
      customerId: $input.customerId
      productSku: "annual-renewal"
    outputs:
      type: object
      properties: { sentAt: { type: string } }
    next: $end
tags: [renewal, composition, subworkflow]
---
```

---

## 10. File contract — files-in / files-out

The host stages declared workspace files into a per-run scratch directory before
the workflow starts, then syncs declared outputs back at the end. The body
reads/writes plain paths under `<inputData._workflowFsRoot>/<key>` — it never
imports a host-specific filesystem driver.

```md
---
name: Report Writer
id: report-writer
description:
  Read a draft markdown file from the workspace, generate a report, and write it
  back to the workspace as a dated file. Demonstrates the file contract.
version: 1.1.0
entry: workflow.ts
inputs:
  type: object
  properties:
    title: { type: string }
    content: { type: string }
    _workflowFsRoot: { type: string } # required: reserved field for the host
  required: [title]
outputs:
  type: object
  properties:
    success: { type: boolean }
    reportPath: { type: string }
    timestamp: { type: string, format: date-time }
inputsFiles:
  source:
    path: drafts/input.md # workspace-relative
    mode: ro
    contentType: text/markdown
outputsFiles:
  report:
    path: reports/<workflowId>-<isoDate>.md # tokens interpolated by the host
    contentType: text/markdown
steps:
  - id: write-report
    kind: tool
    tool: { entry: ./workflow.ts#writeReportStep }
    inputs:
      title: $input.title
      content: $input.content
      _workflowFsRoot: $input._workflowFsRoot
    outputs:
      type: object
      properties:
        success: { type: boolean }
        reportPath: { type: string }
        timestamp: { type: string }
    next: $end
tags: [docs, file-contract, demo]
---
```

Step body (`workflow.ts`):

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { defineStep } from "<host-package>"

export const writeReportStep = defineStep({
  id: "write-report",
  kind: "tool",
  inputSchema: /* zod or JSON Schema */,
  outputSchema: /* … */,
  execute: async ({ inputData }) => {
    const fsRoot = inputData._workflowFsRoot
    if (!fsRoot) throw new Error("host must inject _workflowFsRoot")

    // Read the staged input (matches `inputsFiles.source.path`).
    let sourceContent = ""
    const sourcePath = path.join(fsRoot, "source")
    if (fs.existsSync(sourcePath)) {
      sourceContent = fs.readFileSync(sourcePath, "utf-8")
    }

    // Write the declared output (matches `outputsFiles.report`).
    const reportPath = path.join(fsRoot, "report")
    const body = `# ${inputData.title}\n\n${inputData.content ?? sourceContent}\n`
    fs.writeFileSync(reportPath, body, "utf-8")

    return {
      success: true,
      reportPath,
      timestamp: new Date().toISOString(),
    }
  },
})
```

Run trace (host logs):

```
[host] stage input source ← workspace:drafts/input.md (152 bytes)
[host] inject _workflowFsRoot=/tmp/runs/<runId> into inputData
[host] step write-report → ok
[host] sync output report → workspace:reports/report-writer-2026-04-29.md (174 bytes)
[host] cleanup /tmp/runs/<runId>
```

---

## 11. Sandboxed workflow with explicit env + egress

A workflow that needs ONE third-party credential and ONE outbound host. The
`runtime` block declares both up front so the host can isolate the workflow body
from the rest of the host's process.

```md
---
name: Stripe Invoice Sync
id: stripe-invoice-sync
description:
  Pull yesterday's invoices from Stripe and write a CSV summary back into the
  workspace. Sandboxed — no env beyond STRIPE_API_KEY, no network beyond
  api.stripe.com.
version: 1.2.0
entry: workflow.ts
inputs:
  type: object
  properties:
    _workflowFsRoot: { type: string }
outputs:
  type: object
  properties:
    invoiceCount: { type: integer }
    csvPath: { type: string }
outputsFiles:
  invoices:
    path: finance/stripe-<isoDate>.csv
    contentType: text/csv
runtime:
  mode: sandbox
  env: [STRIPE_API_KEY]
  network:
    egress:
      - api.stripe.com:443
  resources:
    timeoutMs: 60000
    memoryMb: 256
steps:
  - id: pull
    kind: tool
    tool: { entry: ./workflow.ts#pullInvoicesStep }
    outputs: { type: object, properties: { rows: { type: array } } }
    next: write
  - id: write
    kind: tool
    tool: { entry: ./workflow.ts#writeCsvStep }
    inputs:
      rows: $steps.pull.rows
      _workflowFsRoot: $input._workflowFsRoot
    outputs:
      type: object
      properties:
        invoiceCount: { type: integer }
        csvPath: { type: string }
    next: $end
tags: [finance, stripe, sandbox]
---
```

What the host does at registration time:

1. Validates `runtime.env` against the credential store — refuses registration
   if `STRIPE_API_KEY` isn't grantable to this author.
2. Validates `runtime.network.egress` against the host's egress policy — refuses
   if the policy disallows `api.stripe.com`.
3. Confirms it can enforce filesystem scoping (per-run fs root + capability
   flags or container mount).

What the host does at run time:

1. Stages `outputsFiles` declarations + per-run fs root.
2. Spawns the workflow body in an isolated process / container with:
   - `process.env = { HOME, PATH, …safe defaults, STRIPE_API_KEY }` (host's own
     env stripped)
   - filesystem capability: read+write `<fsRoot>` only
   - network capability: connect to `api.stripe.com:443` only
3. Awaits the workflow result.
4. Syncs `outputsFiles.invoices` from `<fsRoot>/invoices` back to the workspace
   at `finance/stripe-<isoDate>.csv`.
5. Tears down the sandbox.

---

## 12. Shaped output with `result`

Compose the workflow output from several steps instead of surfacing whatever the
last step returned. A search → shortlist → enrich → report → notify pipeline
whose caller wants `{ count, reportPath, delivery }` — each field pulled from the
step that produced it. The `details` map enriches every shortlisted listing
before the report renders.

```md
---
name: Listing Search Report
id: listing-search-report
description:
  Search a marketplace, shortlist by commute, enrich each hit with its detail
  page, render a report, and deliver it. Output is mapped explicitly via
  `result` so the caller gets a stable contract, not the notify step's envelope.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    query: { type: string }
    recipient: { type: string }
  required: [query, recipient]
outputs:
  type: object
  properties:
    count: { type: integer }
    reportPath: { type: string }
    delivery: { type: object }
  required: [count, reportPath]
steps:
  - id: search
    kind: tool
    tool: marketplace-search
    inputs: { query: $input.query }
    outputs: { type: object, properties: { ads: { type: array } } }
    next: shortlist
  - id: shortlist
    kind: tool
    tool: listings-shortlist
    inputs: { ads: $steps.search.ads }
    outputs:
      type: object
      properties:
        items: { type: array }
        count: { type: integer }
    next: details
  - id: details
    kind: map
    over: $steps.shortlist.items
    parallelism: 2
    steps:
      - id: detail
        kind: tool
        tool: marketplace-detail
        inputs: { ref: $item.url }
    next: enrich
  - id: enrich
    kind: tool
    tool: listings-enrich
    inputs:
      items: $steps.shortlist.items
      details: $steps.details
    outputs: { type: object, properties: { items: { type: array } } }
    next: report
  - id: report
    kind: tool
    tool: report-render
    inputs: { items: $steps.enrich.items }
    outputs: { type: object, properties: { path: { type: string } } }
    next: notify
  - id: notify
    kind: tool
    tool: messaging-send
    inputs:
      to: $input.recipient
      document: $steps.report.path
    outputs: { type: object, properties: { id: { type: string } } }
    next: $end
result:
  count: $steps.shortlist.count
  reportPath: $steps.report.path
  delivery: $steps.notify
timeout_ms: 120000
tags: [marketplace, report, result-mapping]
---
```

Without `result`, the workflow would surface `notify`'s `{ id }` — the final
step's output. `result` instead returns the declared `outputs` contract: the
shortlist `count`, the rendered `reportPath`, and the full `delivery` envelope,
each `$steps.<id>.<field>` reference resolved against the step that produced it.

---

## Anti-patterns to avoid

- **Mutating step without `compensation`** — silent data corruption on failure.
  If undo is impossible, document why in the body and set `approval: always` to
  make every call deliberate.
- **`approval: auto` on a mutating step** — schema rejects this combination
  upstream (TOOL.md), but workflows can re-introduce it via step-level
  overrides. Don't.
- **Forward references in `inputs`** — `$steps.<later-id>` for a step
  that hasn't run yet. Spec violation; validators catch it.
- **Branches with no `default`** — if no `when` matches, what happens? Always
  set `default` (or use `default: $end` for no-op).
- **`kind: "loop"` without `max_iterations`** — infinite-loop bug waiting to
  happen. The schema requires it.
- **`triggers: [{ kind: "schedule" }]` without explicit capability gating** —
  recurring cost surface. The host MUST refuse if quota policy doesn't permit
  it; authors should expect registration-time errors.
- **Sub-workflow cycle** — A calls B calls A. The host SHOULD detect at
  registration; authors should never write it.

## See also

- [AIP-15 — WORKFLOW.md spec](/docs/aip-15)
- [AIP-14 — TOOL.md spec](/docs/aip-14)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide
- [`./WORKFLOW.schema.json`](./WORKFLOW.schema.json) — manifest validator
