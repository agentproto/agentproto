---
schema: action/v1
id: workspace:read
version: 1.0.0
description: "Read workspace metadata — its WORKSPACE.md, owner, storage provider, sandbox provider, etc. Does NOT include reading workspace files (use storage:read for that)."
category: workspace
verb: read
target_kind: workspace
mutates: []
risk_level: 0
approval: auto
fires_events: []
tags: [workspace, metadata, read-only]
examples:
  - name: List workspace's connected storage
    scenario: "Operator dashboard fetches WORKSPACE.md to display 'Storage: GitHub @acme/marketing'. No secrets revealed."
---

## Description

Use to read non-secret workspace metadata. The WORKSPACE.md is
public within the workspace's owner scope — no secrets leak.

## Approval rationale

`approval: auto` — metadata reads are low-risk. The workspace's
secrets and contents are protected by their own actions
(`secrets:reveal`, `storage:read`).
