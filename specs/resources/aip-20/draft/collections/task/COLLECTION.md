---
schema: collection.schema/v1
name: task
title: Task
description: |
  An atomic unit of work owned by one principal at a time. Extends the
  AIP-20 `work-item` base unchanged except for an optional priority and
  due date. Tasks may parent under an initiative or another task.
version: 1.0.0
extends: ../work-item/COLLECTION.md
fields:
  - name: priority
    type: enum
    enum: [low, normal, high, critical]
  - name: dueAt
    type: date
deadline:
  kind: target-date
  required: false
  fieldName: dueAt
---

# Task

The default work kind. Most boards need nothing else.
