---
schema: routine/v1
id: on-conversation-end
version: 1.0.0
description: "Fire after every conversation ends (AIP-37 conversation-end event). Placeholder target — typical use: post-conversation summary, lesson distillation, knowledge wiki update, audit log emission."
schedule:
  kind: event
  on: conversation-end
target:
  action: "@agentik/actions-standard/lifecycle-noop"
retry:
  max_attempts: 2
  backoff: linear
  initial_ms: 5000
history:
  retain_runs: 200
  retain_failed: 50
fires_events:
  - routine-triggered
  - routine-completed
  - routine-failed
tags: [event-driven, conversation, lifecycle, library]
---

## Description

Subscribes to AIP-37 `conversation-end` events. Fires once per ended
conversation. Use for post-conversation processing: distillation of
lessons (AIP-11), knowledge wiki updates (AIP-10), summary generation,
audit log emission.

`max_attempts: 2` with `backoff: linear` — event-driven routines fire
many times per day; long backoff would let runs queue up. Fail fast,
log, move on.

## Filter pattern

To only fire on conversations within a specific workspace, override
inline:

```yaml
schedule:
  kind: event
  on: conversation-end
  filter:
    workspace: "@me/marketing"
```
