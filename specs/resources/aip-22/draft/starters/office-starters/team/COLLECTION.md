---
schema: collection.schema/v1
name: team
title: Team
description: |
  A smaller group within a department — frontend team, growth
  team, talent team, etc. NEW in v2 — implicit-only in AIP-6,
  made first-class so the org tree has a department-→-team-→-role
  decomposition. Teams parent under departments per the
  workspace's orgTree.containment rules; they contain roles.
version: 1.0.0
fields:
  - name: lead
    type: ref
    refKind: role
    description: |
      Role acting as the team lead. The workspace's ownership axis
      reads this through ownership.role=lead.
  - name: focus
    type: string
    description: |
      OPTIONAL — short prose describing the team's focus area
      (e.g. "Backend platform — APIs, identity, data").
  - name: chargingCode
    type: string
    description: |
      OPTIONAL — internal charging / cost-centre code, often
      inheriting the department's prefix (ENG-001-FE for the
      engineering frontend team).
  - name: maxSize
    type: number
    description: |
      OPTIONAL — soft headcount cap. Used by lints to flag teams
      that have grown past their intended size.
  - name: labels
    type: array
    items:
      type: string

statuses:
  - { id: forming, label: Forming, transitionsTo: [active, archived] }
  - { id: active, label: Active, transitionsTo: [restructuring, archived] }
  - {
      id: restructuring,
      label: Restructuring,
      transitionsTo: [active, archived],
    }
  - { id: archived, label: Archived, terminal: true }

initialStatus: forming

ownership:
  cardinality: single
  role: lead
  required: true

lints:
  - id: team-missing-lead
    kind: missing-owner
    appliesTo: "*"
    severity: error

identity:
  slugSource: title
  filingPath: items/{collection}/{slug}.md

metadata: {}
---

# Team

## Purpose

A `team` is a smaller group within a department — frontend team, growth team,
talent team. Teams contain roles; they parent under departments. Teams are the
level at which day-to-day collaboration happens; departments are the structural
sub-unit, teams are the working unit.

This collection is **NEW in v2**. AIP-6 had no first-class team type — teams
were modelled via informal parent refs or via tags. AIP-22 lifts teams to
first-class items so the containment matrix can express the typical org shape:
department → team → role.

## Conventions

- Every team has ONE lead (typically a manager-level or lead-level role).
- Teams MAY parent only under departments (per the typical workspace
  `allowedParentKinds.team: [department]`); they do NOT nest within other teams.
  If a sub-team is needed, model it as a sibling team or as a sub-department.
- `forming` is for new teams being stood up. `active` is the steady state.

## Field guide

`lead` is the ownership field. The workspace's default ownership field (`owner`)
is overridden here to `lead` via `ownership.role: lead`. The team lead is
typically a role within the team itself (the lead is one of the team members).

`focus` is short prose — useful for org-chart rendering and for new-hire
onboarding so people understand what each team does.

`maxSize` is a soft cap. The host SHOULD surface a warning when the team's role
count exceeds `maxSize`; it does not enforce.

## Examples

```yaml
---
schema: collection.item/v1
collection: team
id: TEAM-frontend
title: Frontend team
parent: DEPT-engineering
status: active
lead: ROLE-frontend-tech-lead
focus: Frontend platform — Next.js, UI library, design system integration.
chargingCode: ENG-001-FE
maxSize: 8
labels: [eng, frontend]
---
# Frontend team

Owns the Next.js apps, the shared UI library, and the design system integration.
Reports up to engineering. Sits under DEPT-engineering in the org tree.
```
