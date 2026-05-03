---
schema: routine/v1
id: hourly
version: 1.0.0
description: "Fire every hour at minute 0 UTC. Placeholder target — fork and override `target` per use case (typical: hourly polling, lightweight sync, queue drain)."
schedule:
  kind: cron
  cron: "0 * * * *"
  timezone: "UTC"
  jitter_seconds: 30
  catchup: skip
target:
  action: "@agentik/actions-standard/lifecycle-noop"
retry:
  max_attempts: 2
  backoff: exponential
  initial_ms: 30000
history:
  retain_runs: 168
  retain_failed: 30
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [hourly, polling, sweep, library]
---

## Description

Fires every hour. Use for: hourly metric polls, queue drains,
lightweight cache invalidations.

## Override pattern

```yaml
# In your workspace, ref this routine and override target
routines:
  - ref: "@agentik/routines-standard/hourly"
    overrides:
      target:
        action: "@me/actions/poll-pricing"
```

Or fork the file and customise inline.
