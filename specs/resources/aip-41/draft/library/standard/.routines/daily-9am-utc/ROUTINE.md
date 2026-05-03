---
schema: routine/v1
id: daily-9am-utc
version: 1.0.0
description: "Fire daily at 09:00 UTC. Placeholder target — typical use: morning brief, daily report, nightly sweep."
schedule:
  kind: cron
  cron: "0 9 * * *"
  timezone: "UTC"
  jitter_seconds: 60
  catchup: one
target:
  action: "@agentik/actions-standard/lifecycle-noop"
retry:
  max_attempts: 3
  backoff: exponential
  initial_ms: 60000
on_failure:
  create_work_item: true
history:
  retain_runs: 90
  retain_failed: 30
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [daily, morning, brief, library]
---

## Description

Fires once a day at 09:00 UTC. Use for daily reports, morning briefs,
nightly cleanup runs (timezone-shifted as needed via override).

`catchup: one` — if the host was down at 09:00, run the latest missed
slot once on recovery (don't replay multiple days).
