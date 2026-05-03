---
schema: action/v1
id: storage:write
version: 1.0.0
description: "Write a file to a storage backend's filesystem. Creates or overwrites; doesn't commit (sync providers buffer until storage:commit fires)."
category: filesystem
verb: write
target_kind: storage
mutates: ["storage:*"]
risk_level: 1
approval: auto
fires_events: ["write"]
tags: [filesystem, mutation]
examples:
  - name: Agent writes a draft
    scenario: "Agent writes /drafts/post.md after generating content. Fires `write` event; sync layer batches commits per STORAGE.md.sync.commit policy."
---

## Description

Use to create or overwrite files in workspace storage. The bytes
land in the backing store immediately; for sync providers (github),
the change is buffered until a `storage:commit` action fires.

## Side effects

`mutates: ["storage:*"]` — any path under the workspace's storage
prefix MAY be modified.

## Approval rationale

`approval: auto` — most agent writes are routine drafts. Implementors
MAY narrow to `on-mutate` for protected paths.
