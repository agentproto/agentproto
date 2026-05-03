---
schema: routine/v1
id: weekly-friday-eod
version: 1.0.0
description: "Fire every Friday at 17:00 UTC. Placeholder target — typical use: weekly wrap-up, Friday status report, week-summary."
schedule:
  kind: cron
  cron: "0 17 * * FRI"
  timezone: "UTC"
  jitter_seconds: 60
  catchup: skip
target:
  action: "@agentik/actions-standard/lifecycle-noop"
retry:
  max_attempts: 3
  backoff: exponential
  initial_ms: 60000
history:
  retain_runs: 52
  retain_failed: 26
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [weekly, friday, wrap-up, library]
---

## Description

Fires every Friday at 17:00 UTC. Use for end-of-week reports,
weekly retros, weekend handoff summaries.

`catchup: skip` — if missed, the slot is gone; we don't run a Friday
report on Saturday.
