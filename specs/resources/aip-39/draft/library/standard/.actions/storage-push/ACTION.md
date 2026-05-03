---
schema: action/v1
id: storage:push
version: 1.0.0
description: "Push committed changes to a remote storage destination (github remote, mirror replica). User-visible operation — triggers reviewer notifications, CI runs, etc."
category: filesystem
verb: push
target_kind: storage
mutates: ["storage:*", "network:*"]
risk_level: 2
approval: on-mutate
fires_events: ["push-started", "push-completed"]
tags: [filesystem, vcs, sync, remote]
examples:
  - name: Per-conversation push
    scenario: "Agent finishes a long working session. At conversation-end, sync layer fires push to PR branch per STORAGE.md.sync.push policy."
---

## Description

Use to publish committed changes externally. Differs from
`storage:commit` in that the changes become visible to other
consumers (reviewers, CI, mirrors).

## Side effects

Network egress to the remote storage host (`mutates: network:*`).
Triggers downstream consumers.

## Approval rationale

`approval: on-mutate` — push is the user-visible moment; prompt
when there are unpushed changes by default. Implementors MAY narrow
to `always` for production branches.
