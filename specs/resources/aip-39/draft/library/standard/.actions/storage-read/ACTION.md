---
schema: action/v1
id: storage:read
version: 1.0.0
description: "Read a file from a storage backend's filesystem. Pure read — no side effects on storage state."
category: filesystem
verb: read
target_kind: storage
mutates: []
risk_level: 0
approval: auto
fires_events: []
tags: [filesystem, read-only]
examples:
  - name: Agent reads a markdown doc
    scenario: "Agent calls read_file('drafts/post.md') during a writing turn. No side effects."
---

## Description

Use to read files from any storage backend. Implementors (TOOLs)
include native filesystem reads (`read_file`, `cat`), git-aware
reads (`git show`), and S3/Azure object reads.

## Approval rationale

`approval: auto` — read-only operations don't need user prompts.
Implementors MAY narrow if reading from sensitive paths.

## Implementation notes

A TOOL implementing this action MUST honour the storage backend's
read semantics (eventual consistency for cloud-bucket, last-pull
state for github, etc.).
