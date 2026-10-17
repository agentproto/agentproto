---
schema: collection.schema/v1
name: initiative
title: Initiative
description: |
  A bounded outcome inside a project that groups tasks. Extends the AIP-20
  `work-item` base; its rolled status is derived from its child tasks
  (WORK.md statusRollup). The project itself is the AIP-34 workspace node,
  not an item.
version: 1.0.0
extends: ../work-item/COLLECTION.md
fields:
  - name: outcome
    type: text
    description: What is true when this initiative is done.
  - name: dueAt
    type: date
deadline:
  kind: target-date
  required: false
  fieldName: dueAt
---

# Initiative

Use for multi-task outcomes. Keep `containment.allowedParents.initiative`
empty in WORK.md so initiatives sit directly under the project's work root.
