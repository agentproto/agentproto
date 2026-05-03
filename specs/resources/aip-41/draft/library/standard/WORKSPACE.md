---
schema: workspace/v1
id: "@agentik/routines-standard"
version: 0.1.0-alpha
name: "Agentik Standard Routines Library"
description: |
  Reference library of common ROUTINE.md files (AIP-41) covering the
  Day-1 schedule vocabulary — daily, weekly, monthly, hourly, plus
  event-driven routines for conversation lifecycle hooks. Authors
  reference these via `routines: [{ ref: "@agentik/routines-standard/<slug>" }]`
  and supply their own `target` via composition (typically by forking
  and overriding inline in their workspace).

  Note: standard routines in this library default to `target: { action: "..." }`
  with placeholder action ids — fork and override `target` per use case.
owner:
  type: org
  id: "agentik-org-id"
  slug: "agentik"
storage:
  inline:
    provider: github
    config:
      owner: agentik
      repo: routines-standard
      branch: main
publish:
  template: false
  registry: agentik
  visibility: public
tags: [reference, library, routines, standard, schedule]
---

## Description

Common recurring schedules every agentic system needs. Each routine in
this library targets a placeholder action — consumers fork and override
the `target.action` (or swap in `target.workflow` / `target.tool`).

## Routines included

| Slug | Schedule | Use case |
|---|---|---|
| `hourly` | `cron 0 * * * *` UTC | Hourly polling, low-cost sweeps |
| `daily-9am-utc` | `cron 0 9 * * *` UTC | Daily morning sweep |
| `weekly-monday` | `cron 0 9 * * MON` UTC | Weekly Monday brief |
| `weekly-friday-eod` | `cron 0 17 * * FRI` UTC | Weekly Friday wrap-up |
| `monthly-first` | `cron 0 9 1 * *` UTC | Month-1 reports / billing |
| `on-conversation-end` | `event conversation-end` | Per-conversation cleanup hooks |
