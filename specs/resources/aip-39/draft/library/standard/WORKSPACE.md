---
schema: workspace/v1
id: "@agentik/actions-standard"
version: 0.1.0-alpha
name: "Agentik Standard Actions Library"
description: |
  Reference library of common ACTION.md files (AIP-39) covering the
  Day-1 verb vocabulary across storage / sandbox / secrets / workspace
  domains. Implementors (TOOLs, drivers) reference these via
  `implements: "@agentik/actions-standard/<slug>"`. POLICY grants
  reference them in `actions: [{ action: "@agentik/actions-standard/<slug>" }]`.
owner:
  type: org
  id: "agentik-org-id"
  slug: "agentik"
storage:
  inline:
    provider: github
    config:
      owner: agentik
      repo: actions-standard
      branch: main
publish:
  template: false
  registry: agentik
  visibility: public
tags: [reference, library, actions, standard]
---

## Description

The Day-1 set of standard agent verbs. Curated by the agentproto
maintainers; tracks AIP-39 spec evolution. Workspaces ref individual
actions, not the whole library — the library exists for discoverability.

## Layout

```
.actions/
├── storage-read/ACTION.md           ← read files via filesystem
├── storage-write/ACTION.md          ← write files
├── storage-commit/ACTION.md         ← commit changes (sync providers)
├── storage-push/ACTION.md           ← push commits (sync providers)
├── sandbox-execute/ACTION.md        ← execute commands in sandbox
├── sandbox-network-egress/ACTION.md ← outbound network from sandbox
├── secrets-reveal/ACTION.md         ← reveal a secret value
├── secrets-rotate/ACTION.md         ← rotate a secret
├── workspace-read/ACTION.md         ← read workspace metadata
└── workspace-publish/ACTION.md      ← publish a workspace to a registry
```

## Versioning

Actions are versioned per AIP-39 (semver in each ACTION.md frontmatter).
Library slug `@agentik/actions-standard` versions as a whole — bumps
on any breaking change to any contained action.
