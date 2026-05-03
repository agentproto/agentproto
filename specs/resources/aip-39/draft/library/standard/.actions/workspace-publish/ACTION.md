---
schema: action/v1
id: workspace:publish
version: 1.0.0
description: "Publish the workspace to a registry — sets `publish.visibility` to `unlisted` or `public`, indexes the workspace's addressable id (@<owner>/<slug>), makes it referenceable from other workspaces."
category: workspace
verb: publish
target_kind: workspace
mutates: ["workspace:metadata", "external:registry"]
risk_level: 3
approval: always
fires_events: ["workspace-published"]
requires:
  network: ["*"]
tags: [workspace, registry, publish, irreversible]
examples:
  - name: Org publishes a shared action library
    scenario: "Org admin publishes `@acme/actions/internal` workspace to the registry. Other Acme workspaces can now ref its actions."
---

## Description

Use to make a workspace's contents (actions, code, policies, etc.)
referenceable by other workspaces via the `@<owner>/<slug>` registry
address. Switching visibility from `private` → `unlisted` → `public`
is itself a `workspace:publish` invocation.

## Side effects

`mutates: workspace:metadata + external:registry` — sets fields on
WORKSPACE.md AND notifies the registry. Once published, the workspace's
addressable id is reserved.

## Approval rationale

`approval: always` — publishing is hard to undo (registry consumers
may already have lockfile pins to the SHA at publish time). ALWAYS
prompt.
