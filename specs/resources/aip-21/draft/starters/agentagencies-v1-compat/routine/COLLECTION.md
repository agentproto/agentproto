---
schema: collection.schema/v1
name: routine
title: Routine
description: |
  A scheduled recurring activity (a nightly invoice sweep, a
  weekly engagement-status review, a quarterly capacity audit).
  Mirrors AIP-8's hardcoded `ROUTINE.md` doctype as an AIP-18
  collection. Routines bind an AIP-15 workflow for execution and
  carry their schedule, last run timestamp, and execution
  history at the workspace level.
version: 1.0.0
fields:
  - name: workflow
    type: string
    description: |
      Path or ws:// ref to the AIP-15 WORKFLOW.md that runs on
      schedule. REQUIRED for an active routine.
  - name: cron
    type: string
    description: |
      Cron expression (5-field standard) declaring when the
      routine runs. Hosts MUST validate the expression at item
      write time.
  - name: timezone
    type: string
    description: |
      IANA timezone for the cron expression (e.g. "Europe/Paris",
      "UTC"). Defaults to UTC when unset.
  - name: lastRunAt
    type: date
    description: Timestamp of the most recent execution.
  - name: lastRunStatus
    type: enum
    enum: [success, failure, skipped]
    description: Outcome of the most recent execution.
  - name: nextRunAt
    type: date
    description: |
      Computed timestamp of the next scheduled run. Hosts SHOULD
      keep this fresh as part of the routine's tick.
  - name: triggers
    type: array
    items:
      type: string
    description: |
      OPTIONAL — additional non-cron triggers (e.g. "engagement
      created", "invoice past due"). Hosts MAY combine cron and
      event triggers.

statuses:
  - { id: paused, label: Paused, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [paused, archived] }
  - { id: archived, label: Archived, terminal: true }

initialStatus: paused

ownership:
  cardinality: single
  role: owner
  required: false

deadline:
  kind: none
  required: false

lints:
  - id: routine-failed-last-run
    kind: custom
    appliesTo: "status=active"
    severity: error
    params:
      check: lastRunStatus-equals-failure
  - id: routine-stale-30d
    kind: stale
    appliesTo: "status=active"
    severity: warn
    params:
      days: 30

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Routine

## Purpose

A `routine` is a scheduled recurring agency activity — a nightly invoice-overdue
sweep, a weekly engagement-status review, a quarterly capacity audit. The
routine record carries the schedule and bookkeeping; the bound AIP-15 workflow
carries the actual logic.

This collection is part of the **agentagencies-v1-compat** starter library.
Cross-AIP-15 binding is the central feature: the `workflow` field is a typed
reference to a `WORKFLOW.md`, not an inline script — AIP-15 owns the workflow
definition format.

## Conventions

- An active routine MUST have `workflow` populated.
- Cron expressions follow the 5-field standard (minute hour day-of-month month
  day-of-week). Hosts MAY accept the 6-field variant with seconds; the spec
  keeps the canonical 5.
- `lastRunStatus: failure` triggers the `routine-failed-last-run` lint;
  operators SHOULD investigate before the next scheduled run.
- Pausing a routine is reversible; archiving is terminal.

## Field guide

`workflow` resolves through the workspace's bindings. Path forms
(`./workflows/<name>/WORKFLOW.md`) are local; `ws://workflows/<slug>` is the
registry form.

## Examples

```yaml
---
schema: collection.item/v1
collection: routine
id: ROU-nightly-invoice-sweep
title: Nightly invoice overdue sweep
status: active
owner: ws://operators/finance-controller
workflow: ./workflows/invoice-overdue-sweep/WORKFLOW.md
cron: "0 2 * * *"
timezone: "Europe/Paris"
lastRunAt: 2026-04-27T02:00:12Z
lastRunStatus: success
nextRunAt: 2026-04-28T02:00:00Z
triggers:
  - "invoice past dueAt + gracePeriodDays"
---
# Nightly invoice overdue sweep

Runs every night at 02:00 Europe/Paris. Walks the invoice collection,
transitions sent invoices past their grace period to overdue, and surfaces a
digest to the finance controller.
```
