---
schema: routine/v1
id: weekly-monday
version: 1.0.0
description: "Fire every Monday at 09:00 UTC. Placeholder target — typical use: weekly kickoff brief, weekly review report."
schedule:
  kind: cron
  cron: "0 9 * * MON"
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
  retain_runs: 52
  retain_failed: 26
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [weekly, monday, kickoff, library]
---

## Description

Fires every Monday at 09:00 UTC. Use for weekly kickoff briefs,
new-week planning prompts, sprint setup tasks.
