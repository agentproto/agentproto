---
schema: collection.schema/v1
name: procedure
title: Procedure
description: |
  A vendor-neutral playbook for an agency activity — how to run
  a discovery workshop, how to onboard a new client, how to
  produce a quarterly review. Mirrors AIP-8's hardcoded
  `PROCEDURE.md` doctype as an AIP-18 collection. Procedures
  optionally reference an AIP-15 workflow via the `workflow`
  field for execution; the procedure carries the human-readable
  guidance, the workflow carries the machine-executable steps.
version: 1.0.0
fields:
  - name: workflow
    type: string
    description: |
      OPTIONAL — path or ws:// ref to an AIP-15 WORKFLOW.md that
      executes this procedure. The workspace lint
      `broken-procedure-ref` catches refs that fail to resolve.
  - name: triggers
    type: array
    items:
      type: string
    description: |
      Free-form triggers that warrant running the procedure
      (e.g. "new client signed", "engagement reaches in-progress",
      "monthly").
  - name: durationEstimate
    type: number
    description: OPTIONAL — estimated duration in hours.
  - name: requiredSkills
    type: array
    items:
      type: ref
      refKind: skill
    description: |
      OPTIONAL — AIP-3 skills required to execute this procedure.
  - name: applicableServices
    type: array
    items:
      type: ref
      refKind: service
    description: Services this procedure supports.

statuses:
  - { id: draft, label: Draft, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: draft

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none
  required: false

lints:
  - id: procedure-stale-365d
    kind: stale
    appliesTo: "status=active"
    severity: info
    params:
      days: 365

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Procedure

## Purpose

A `procedure` is a documented agency play — the human-readable guidance for how
to run a recurring or repeatable activity. Each procedure may bind an AIP-15
workflow for execution; the procedure is the _what / why_, the workflow is the
_how_.

This collection is part of the **agentagencies-v1-compat** starter library.

## Conventions

- A procedure without a `workflow` is purely documentation.
- A procedure with a `workflow` is executable — the bound workflow carries the
  steps, gates, and outputs.
- The `broken-procedure-ref` workspace-spanning lint catches procedures whose
  `workflow` ref fails to resolve.
- Status `active` means the procedure is current and recommended; `draft` is
  work in progress; `archived` is superseded.

## Field guide

`workflow` is the AIP-15 cross-AIP reference. Use a path
(`./workflows/<name>/WORKFLOW.md`) for in-tree workflows or a
`ws://workflows/<slug>` for registry imports.

`requiredSkills` references AIP-3 skills — execution gates can be expressed by
checking the executor's skill set against this list.

## Examples

```yaml
---
schema: collection.item/v1
collection: procedure
id: PROC-onboard-new-client
title: Onboard a new client
status: active
owner: ws://operators/managing-director
workflow: ./workflows/onboard-new-client/WORKFLOW.md
triggers:
  - "agreement signed"
  - "first engagement accepted"
durationEstimate: 4
requiredSkills:
  - ws://skills/account-onboarding
  - ws://skills/discovery-workshop
applicableServices:
  - SVC-strategy-workshop
  - SVC-quarterly-review
---

# Onboard a new client

Standard onboarding flow for new clients: kickoff call, access
provisioning, expectation alignment, first deliverable scoping.
Runs once per agreement; the bound workflow handles the
mechanics.
```
