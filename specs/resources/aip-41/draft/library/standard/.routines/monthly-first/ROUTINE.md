---
schema: routine/v1
id: monthly-first
version: 1.0.0
description: "Fire on the 1st of every month at 09:00 UTC. Placeholder target — typical use: monthly billing reports, monthly retros, month-1 reset routines."
schedule:
  kind: cron
  cron: "0 9 1 * *"
  timezone: "UTC"
  jitter_seconds: 120
  catchup: one
target:
  action: "@agentik/actions-standard/lifecycle-noop"
retry:
  max_attempts: 5
  backoff: exponential
  initial_ms: 300000
on_failure:
  create_work_item: true
history:
  retain_runs: 24
  retain_failed: 24
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [monthly, first, billing, report, library]
---

## Description

Fires on the 1st of each month at 09:00 UTC. Use for monthly billing
reports, retro prompts, period-1 reset routines.

Higher retry count (5) and longer initial backoff (5min) — monthly
runs are higher-stakes and worth more patient retries before opening
a WORK item.
