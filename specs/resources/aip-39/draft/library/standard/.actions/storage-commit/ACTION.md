---
schema: action/v1
id: storage:commit
version: 1.0.0
description: "Atomically record pending writes to a sync-aware storage backend (github commit-tree, S3 snapshot manifest). Bare commit — does NOT push to remote."
category: filesystem
verb: commit
target_kind: storage
mutates: ["storage:*"]
risk_level: 1
approval: auto
fires_events: ["write", "commit-completed"]
tags: [filesystem, vcs, sync]
examples:
  - name: Per-turn commit batching
    scenario: "Agent finishes a turn that wrote 3 files. Sync layer fires this action at turn-end with auto-generated message per STORAGE.md.sync.commit policy."
  - name: Manual commit
    scenario: "User clicks 'Save' button; UI calls a TOOL implementing this action with a custom message."
---

## Description

Use when pending writes need to be atomically recorded as a single
unit. Implementations vary by storage backend:

- `github` provider — creates a git commit object on the working branch
- `cloud-bucket` — writes a snapshot manifest under storage prefix
- `canonical` providers (no commit semantics) — no-op (resolver MAY refuse)

## Approval rationale

`approval: auto` — commits are intermediate. The user-facing moment
is `storage:push`. A typing agent making 50 commits per session
shouldn't prompt 50 times.
