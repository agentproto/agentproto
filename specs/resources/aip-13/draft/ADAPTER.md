# ADAPTER.md — implementing AIP-13 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, resolve, and mutate** AIP-13
[`agentwork/v1`](/docs/aip-13) doctypes — `WORK.md` (workspace manifest or
per-consumer view), `PROJECT.md`, `INITIATIVE.md`, and `TASK.md`. It is
normative for the parts marked MUST and informative for the parts marked SHOULD.

The audience is a runtime author — someone exposing `defineWorkWorkspace`,
`defineProject`, `defineInitiative`, and `defineTask` to authors. Doctype
authors themselves should read [`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements six responsibilities in order when a work folder is
registered or mutated:

1. **Load the workspace manifest** — read `WORK.md` at the work-tree root,
   validate against the `workspace` `$def` in
   [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json), resolve any `extends:`
   chain, expose both the merged effective config and the resolution chain. See
   [Loading `WORK.md`](#loading-workmd) below.
2. **Parse each doctype** — read the `*.md` file, validate frontmatter against
   the `workItem` `$def` in
   [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json), surface errors.
3. **Resolve the three axes** — climb the `parent` chain to inherit scope;
   verify `assignee` / `lead` resolve to AIP-9 operators or users; verify
   `parent.ref` resolves to a sibling doctype.
4. **Resolve cross-AIP refs** — verify `attachments.wiki[]` against AIP-10,
   `attachments.lessons[]` against AIP-11, etc. Surface warnings (not failures)
   for unresolvable refs — they may be intentional placeholders during
   authoring.
5. **Enforce the status state machine** — reject invalid transitions at
   write-time. The legal transitions come from the active workspace's merged
   `statuses` (or, when no workspace is loaded, from the spec's default state
   machine documented below).
6. **Regenerate `_index/work.json`** — write-time guarantee per the spec;
   readers MUST treat the index as stale otherwise.

The four signatures `defineWorkWorkspace`, `defineProject`, `defineInitiative`,
`defineTask` are the boundary between the host and the author. The host MAY
internally translate to its own work-item type after the call, but the
signatures are what authors call.

## Loading `WORK.md`

The workspace manifest is the host's first read on every work-tree load and on
every consumer (operator/company/skill) activation. The host exposes the merged
effective config to the rest of the work pipeline — status validation, lints,
scope defaults, governance binding — so per-item adapters never re-read the
chain.

### Resolution algorithm

When a host reads a `WORK.md`:

1. **Parse the frontmatter** as YAML. Validate against the `workspace` `$def` in
   [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json). On failure, surface
   `work_workspace_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the merged effective config. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `work_extends_missing` as a WARNING
     (not an error), use the local manifest only, mark the chain as broken, and
     proceed.
   - If the parent has already appeared in the visited set: emit
     `work_extends_cycle` as a WARNING, break the chain at the cycle point, use
     the partial chain, and proceed.
   - If the chain depth would exceed eight: emit `work_extends_depth_exceeded`
     as a WARNING, break the chain at the eighth ancestor, use the partial
     chain, and proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (workspace root first, leaf view last) using the
   strategy table below. Child wins on overrides.
5. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists. Refuse the view (do NOT degrade)
   with `work_appliesto_unresolvable` if any binding fails to resolve. Unlike
   chain warnings, this is a hard failure: a view that binds to a non-existent
   consumer is semantically broken.

The host MUST NOT execute any code in `WORK.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                     | Strategy                  | Notes                                                                                                                                            |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `title`, `description`, `version` | override                  | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                    |
| `extends`                                 | local-only                | Not inherited.                                                                                                                                   |
| `appliesTo`                               | local-only                | Not inherited. Each view declares its own scope.                                                                                                 |
| `executor`, `governance`, `knowledge`     | override                  | Child can rebind. Governance bindings flow through [AIP-7](/docs/aip-7); a parent's policy MAY restrict whether a child can rebind `governance`. |
| `itemKinds`                               | merge-by-name             | Same `name` → child replaces parent. New names → appended. A child setting `enabled: false` disables the parent's kind.                          |
| `itemKinds[].fields`                      | union                     | Child fields are appended to the parent's set; duplicates collapsed.                                                                             |
| `statuses`                                | merge-by-id               | Same `id` → child replaces parent. New ids → appended.                                                                                           |
| `statuses[].transitionsTo`                | replace wholesale         | Child replaces the parent's transition list if present.                                                                                          |
| `statuses[].terminal`                     | child wins, drift warning | A child that flips a parent status's `terminal` flag SHOULD trigger a `work_status_drift` warning so reviewers notice the semantic change.       |
| `lints`                                   | merge-by-id               | Same `id` → child replaces parent. New ids → appended.                                                                                           |
| `lints[].severity`                        | child wins                | Subject to governance: a policy MAY forbid softening a parent lint below `error`.                                                                |
| `scope.*`                                 | leaf-field override       | `defaultContainment`, `defaultApplicability`, `defaultOwner`, `ownershipPolicy` each override independently.                                     |
| `defaults.*`                              | leaf-field override       | `workflow` and `approvalClass` each override independently.                                                                                      |
| `display.*`                               | leaf-field override       |                                                                                                                                                  |
| `metadata`                                | deep-merge                | Recursive merge; vendor namespaces accumulate.                                                                                                   |

### Cross-AIP ref resolution

| Ref                               | AIP                    | Resolver                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ws://operators/<slug>`           | [AIP-9](/docs/aip-9)   | Look up the operator workspace; verify it exists and the host can activate it.                                                                                                                                                                |
| `ws://companies/<slug>`           | [AIP-6](/docs/aip-6)   | Look up the company workspace.                                                                                                                                                                                                                |
| `ws://skills/<slug>`              | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                                                                                                                                                                                                                   |
| `executor: ws://operators/<slug>` | [AIP-9](/docs/aip-9)   | Resolve the named operator. The host activates this operator for run-passes (claim open tasks, drive transitions). MAY be lazily resolved — unresolvable at load time surfaces a runtime warning when activation actually attempts to use it. |
| `governance: <path>`              | [AIP-7](/docs/aip-7)   | Resolve as a relative path to a policy/audit binding.                                                                                                                                                                                         |
| `knowledge: <ref>`                | [AIP-10](/docs/aip-10) | Resolve as a `ws://wikis/<slug>/KNOWLEDGE.md` ref or a relative path. Lets `attachments.wiki[]` on items resolve against the bound wiki by default.                                                                                           |
| `defaults.workflow: <ref>`        | [AIP-15](/docs/aip-15) | Resolve as a path to a `WORKFLOW.md`.                                                                                                                                                                                                         |
| `extends: <path>`                 | AIP-13                 | Resolve as a relative path to another `WORK.md`.                                                                                                                                                                                              |

`appliesTo` enforcement: a host MUST refuse to activate a view whose `appliesTo`
references a non-existent consumer. This is the only unresolvable cross-AIP ref
that triggers a hard failure during manifest load — `executor:`, `governance:`,
and `knowledge:` MAY be unresolvable at load time (they're activated lazily) and
surface a runtime warning when activation actually attempts to use them.

`executor` enforcement: when the workspace is activated for a run-pass, the host
MUST verify the named operator exists in the [AIP-9](/docs/aip-9) registry and
that the active caller has the authority to act AS that operator. A workspace
that names an unauthorized executor degrades to "no auto-claim" (the workspace
loads, queries work, but the host does not auto-assign open items).

### View activation

When an [AIP-9](/docs/aip-9) operator (or [AIP-6](/docs/aip-6) company, or
[AIP-3](/docs/aip-3) skill) loads, the host SHOULD:

1. Look for a `WORK.md` in the consumer's workspace folder.
2. If present, run the resolution algorithm above.
3. Pass the merged effective config to the consumer's runtime context: work-item
   queries SHOULD use the view's scope defaults and `itemKinds` filter; status
   transitions SHOULD validate against the view's merged `statuses`; lint passes
   SHOULD use the view's merged `lints`.
4. Expose the resolution chain on a debug surface keyed by the consumer's id
   (e.g. `defineWorkWorkspace().resolved.chain`) so reviewers can audit which
   manifest contributed which field.

When no view exists for a consumer, the host falls back to the workspace-root
`WORK.md` directly. Consumers without their own view inherit the tracker's
default lens — explicitly, via the merge algorithm, not implicitly.

### Effective config exposure

A conforming host MUST expose, for every loaded manifest:

```ts
type ResolvedWorkWorkspace = {
  effective: WorkWorkspace // merged config
  chain: Array<{
    // resolution chain (ordered, root → leaf)
    path: string // absolute path to the manifest
    doctype: "work.workspace/v1"
    name: string
    version: string
  }>
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "work_extends_missing"
      | "work_extends_cycle"
      | "work_extends_depth_exceeded"
      | "work_status_drift"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

The merged `effective` is what consumers use; the `chain` is what tooling uses
to explain _where_ a field came from. The `warnings` list is empty on a healthy
load.

### Conflict cases

The following examples illustrate the merge rules with concrete parent/child
manifests. Each is a minimal pair, not a full manifest.

**1. Status transition narrowed by child.**

Parent (`<work-root>/WORK.md`):

```yaml
statuses:
  - id: in-progress
    label: In progress
    terminal: false
    transitionsTo: [done, blocked, archived]
```

Child (`operators/triage/WORK.md`):

```yaml
extends: ../../<work-root>/WORK.md
statuses:
  - id: in-progress
    label: In progress
    terminal: false
    transitionsTo: [blocked, archived] # 'done' removed — triage view can't close
```

Effective: triage operators can mark items `blocked` or `archived` but cannot
close them. The host MUST refuse a `done` transition for an item loaded under
this view.

**2. Lint severity softened by child.**

Parent:

```yaml
lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: task
    severity: error
```

Child:

```yaml
extends: ../../<work-root>/WORK.md
lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: task
    severity: warn
```

Effective: `severity: warn`. The host MUST allow the override unless the
parent's `governance:` policy forbids softening lints — in which case the host
emits `governance:lint_softening_refused` and uses the parent's
`severity: error`.

**3. Item kind disabled by child.**

Parent:

```yaml
itemKinds:
  - name: project
    enabled: true
  - name: initiative
    enabled: true
  - name: task
    enabled: true
```

Child:

```yaml
extends: ../../<work-root>/WORK.md
itemKinds:
  - name: initiative
    enabled: false # this view doesn't track initiatives
```

Effective: `project` and `task` are enabled; `initiative` is disabled. The host
MUST refuse `defineInitiative` calls in this view's context and SHOULD hide
existing initiatives from list endpoints scoped to this view.

**4. Status terminal-flag flipped — drift warning.**

Parent:

```yaml
statuses:
  - id: done
    label: Done
    terminal: true
    transitionsTo: [archived]
```

Child:

```yaml
extends: ../../<work-root>/WORK.md
statuses:
  - id: done
    label: Done
    terminal: false # child says 'done' is non-terminal
    transitionsTo: [in-progress, archived]
```

Effective: `terminal: false`, with `transitionsTo: [in-progress, archived]`. The
host emits `work_status_drift` to the warnings list — flipping a terminal status
is allowed (a child view of a long-running support tracker may genuinely re-open
done items) but reviewers SHOULD audit the change.

**5. Governance rebinding.**

Parent: `governance: ../policies/work.yaml`. Child:
`governance: ../policies/triage-strict.yaml`.

Effective: `governance: ../policies/triage-strict.yaml` (child wins). The host
applies the child's policy for any governance gate on this view.

### Default state machine — when no `WORK.md` is present

A workspace WITHOUT a `WORK.md` falls back to the spec's default state machine,
identical to earlier drafts of this AIP:

| From          | To (valid)                                   |
| ------------- | -------------------------------------------- |
| `open`        | `claimed`, `blocked`, `archived`             |
| `claimed`     | `in-progress`, `open`, `blocked`, `archived` |
| `in-progress` | `done`, `blocked`, `archived`                |
| `blocked`     | `claimed`, `in-progress`, `archived`         |
| `done`        | `archived`                                   |
| `archived`    | (none)                                       |

Hosts SHOULD emit a one-time `work_workspace_missing` informational notice when
loading a work tree without a `WORK.md` so authors know they're running on the
default machine.

## `defineTask` / `defineInitiative` / `defineProject` — the entry-point functions

### Required behaviour

A host that implements these functions MUST:

1. **Accept the per-kind shape** documented in
   [AIP-13 § Per-kind constraints](/docs/aip-13#per-kind-constraints). Tasks
   accept `assignee`, not `lead`. Projects/initiatives accept `lead`, not
   `assignee`. Other shared fields (`slug`, `title`, `status`, `parent`,
   `scope`, `attachments`, `governance`, `deadline`, `priority`, `labels`,
   `metadata`, `body`) apply to all three.
2. **Reject mismatched fields at registration**, with a clear error.
   `defineTask({ lead: ... })` MUST refuse — a task has an assignee.
3. **Validate the slug** — kebab-case, 2-64 chars, unique within the company
   root for that kind.
4. **Defer the body's I/O to call time.** `defineTask(...)` MUST NOT trigger
   filesystem writes during registration; it returns a handle the work-store
   invokes at persistence time.

### Optional behaviour

A host MAY:

- Re-export the trio under host-idiomatic aliases (`createTask` / `task`, etc.).
  The canonical names MUST be present.
- Accept zod or pydantic in `metadata.<vendor>` extensions — canonicalise to
  JSON for the manifest before hand-off.
- Expose host-specific fields via `metadata.<vendor>.…`. Other hosts MUST
  tolerate unknown vendor keys.

### Canonical signatures

The host exposes four function signatures the author calls:

```ts
// Workspace manifest — root or view.
defineWorkWorkspace({
  schema: "work.workspace/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                     // relative path to parent WORK.md
  appliesTo?: string[]                 // ws:// refs or relative paths
  executor?: string                    // ws://operators/<slug>
  governance?: string                  // path or ref
  knowledge?: string                   // ws://wikis/<slug>/KNOWLEDGE.md or path
  itemKinds?: Array<{ name: string; enabled?: boolean; fields?: string[]; icon?: string; description?: string }>
  statuses?: Array<{ id: string; label: string; terminal?: boolean; transitionsTo?: string[] }>
  scope?: { defaultContainment?: string; defaultApplicability?: string[]; defaultOwner?: string; ownershipPolicy?: "strict" | "inherit" | "open" }
  lints?: Array<{ id: string; kind: "missing-owner" | "overdue" | "orphan" | "broken-ref" | "stale" | "scope-widening" | "custom"; appliesTo: string; severity: "error" | "warn" | "info"; params?: Record<string, unknown> }>
  defaults?: { workflow?: string; approvalClass?: "auto" | "always" | "on-mutate" | `policy:${string}` }
  display?: { homePage?: string; defaultGrouping?: "kind" | "status" | "owner" }
  metadata?: Record<string, unknown>
}): ResolvedWorkWorkspace

// Work items — unchanged from earlier drafts.
defineProject({ ... }): WorkItemResult
defineInitiative({ ... }): WorkItemResult
defineTask({ ... }): WorkItemResult
```

Hosts MAY alias `defineWorkWorkspace` as `defineWorkspace`,
`registerWorkWorkspace`, or `defineWork`. The canonical name MUST be present.
`defineProject` / `defineInitiative` / `defineTask` are unchanged from earlier
drafts; their signatures remain the boundary between the host and per-item
authors.

## Doctype loader rules

The doctype file MUST be safely parseable as a side-effect-free markdown
document with YAML frontmatter:

- **No I/O at parse.** All filesystem / network access happens in the host's
  resolver layer, not in the parser.
- **No reliance on a running host singleton.** Parsing MUST work in isolation —
  for testing, validation, doc generation.
- **Frontmatter is authoritative for axes.** The body is for description /
  acceptance criteria / scratchpad — never as authority for who can see or do
  the work.

## Scope resolver — the three orthogonal axes

This is the hard part. Every other adapter behaviour falls out of getting this
resolver right.

### Axis 1: containment (`parent`)

- `parent` declares cascade-delete semantics: removing the parent SHOULD remove
  the child.
- The resolver climbs `parent` until it hits a node whose `parent` is null. That
  node MUST have `scope.company` set.
- Cycles are spec violations. The host MUST detect and refuse.
- Cross-kind containment is allowed: a task's parent MAY be an initiative or a
  project; an initiative's parent MAY be a project; a project's parent MAY be an
  initiative (project-inside-initiative is unusual but legal).

### Axis 2: applicability (`scope.*`)

The visibility/applicability axis. Resolver responsibilities:

- **Inheritance**: when a child's `scope.<field>` is empty, treat it as the
  parent's value for that field. Climb to the root.
- **Cross-axis combination is AND** — `{ role: design, project: onboarding }` is
  _intersection_, not union. The resolver MUST return the AND set.
- **Most-restrictive wins**: if multiple narrowings are non-empty, the visible
  set is the AND of all narrowings.
- **No widening on inheritance**: a child cannot widen scope it didn't declare.
  The resolver MUST flag widening attempts (e.g. child sets
  `scope.role: marketing` while parent has `scope.role: design`) as
  scope-evasion.
- **Three null states are distinct**: `scope.role: null` (no role narrowing) is
  NOT the same as `scope.role: ""` (literally empty string — invalid) or
  `scope.role` absent (inherits from parent). The resolver MUST treat them
  differently.

### Axis 3: ownership (`assignee` / `lead`)

The mutable axis. Resolver responsibilities:

- **`assignee.ref` and `lead.ref` MUST resolve** against AIP-9 operators or
  AIP-? users. Unresolvable refs SHOULD warn (not reject) — operators can be
  added later.
- **The owner field is independent of scope**. An assignee outside the doctype's
  scope is a configuration error; the resolver MUST warn. (It SHOULD NOT
  auto-widen scope to fit.)
- **null is a real value**, not "missing". `assignee: null` means unclaimed. The
  resolver MUST surface this distinct from `assignee` absent.

### The orthogonality test

A correct resolver answers all three of these independently:

1. _Visibility_: who is allowed to see this doctype? — answered by resolved
   `scope.*` only.
2. _Containment_: what does this doctype belong to? — answered by `parent` chain
   only.
3. _Ownership_: who is doing this work right now? — answered by `assignee` /
   `lead` only.

If any of those queries reads a field from another axis, the resolver is wrong.

## Status state machine

The status field is enforced server-side at write-time. Valid transitions:

| From          | To (valid)                                   | Notes                               |
| ------------- | -------------------------------------------- | ----------------------------------- |
| `open`        | `claimed`, `blocked`, `archived`             | Claim sets `assignee`.              |
| `claimed`     | `in-progress`, `open`, `blocked`, `archived` | Unclaim returns to `open`.          |
| `in-progress` | `done`, `blocked`, `archived`                | Cannot return to `open` directly.   |
| `blocked`     | `claimed`, `in-progress`, `archived`         | Unblock returns to the prior state. |
| `done`        | `archived`                                   | Terminal-ish; archive only.         |
| `archived`    | (none)                                       | Terminal.                           |

A host MUST refuse invalid transitions with `{ code: "invalid_transition", … }`.

`assignee` change rules:

- Setting `assignee` SHOULD transition `open` → `claimed` automatically.
- Clearing `assignee` SHOULD transition `claimed` → `open` automatically.
- These are conveniences, not requirements; hosts MAY require explicit two-step
  changes.

## Dependency resolution

AIP-13 doesn't ship a dedicated `dependsOn` field — dependencies flow through
`parent` (containment) and `attachments.*` (reference). The resolver SHOULD
synthesise a dependency view:

- A task with `attachments.deliverables: [<slug>]` SHOULD be treated as
  depending on that deliverable being `done`.
- A task with `attachments.conversations: [<conv-id>]` is a soft dependency —
  the conversation should reach a conclusion before the task starts.
- An initiative depends on its child tasks: an initiative SHOULD remain
  `in-progress` while any contained task is non-terminal, and SHOULD
  auto-suggest `done` when all are terminal.

These are advisory; the spec doesn't mandate auto-status. Hosts that
auto-suggest MUST surface the suggestion as a UI prompt, not silently mutate.

## Cross-AIP ref resolution

| Field                           | Refs to                                  | Cardinality | Resolver behaviour                                                |
| ------------------------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------------- |
| `assignee.ref` (kind: operator) | [AIP-9](/docs/aip-9) operator slug       | 1           | Warn on miss.                                                     |
| `lead.ref` (kind: operator)     | [AIP-9](/docs/aip-9) operator slug       | 1           | Warn on miss.                                                     |
| `parent.ref`                    | sibling work-item slug                   | 1           | **Reject** on miss — parent must exist.                           |
| `attachments.wiki[]`            | [AIP-10](/docs/aip-10) wiki slug         | N           | Warn on miss.                                                     |
| `attachments.lessons[]`         | [AIP-11](/docs/aip-11) lesson slug       | N           | Warn on miss.                                                     |
| `attachments.deliverables[]`    | [AIP-8](/docs/aip-8) deliverable slug    | N           | Warn on miss.                                                     |
| `attachments.artifacts[]`       | fileId or path                           | N           | Warn on miss.                                                     |
| (body) link to objective        | [AIP-6](/docs/aip-6) `OBJECTIVE.md` slug | 0..1        | Use `metadata.objectives: [<slug>]` for machine-readable linkage. |

All refs use the AIP family's standard ref form: **slug or id**, not filesystem
path. Paths bind doctypes to a specific tree layout; slugs survive restructures.

## Error envelope

All errors leave the host as:

```ts
type WorkItemResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; field?: string; cause?: unknown }
    }
```

Standard codes:

| Code                          | When                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `invalid_frontmatter`         | YAML parse failed or doesn't match the schema.                                                                            |
| `invalid_transition`          | Status transition not in the state machine (which now comes from the active workspace's merged `statuses`).               |
| `unresolved_parent`           | `parent.ref` doesn't exist.                                                                                               |
| `cycle_detected`              | Containment chain contains a cycle.                                                                                       |
| `scope_widening`              | Child narrows scope wider than its parent's effective scope.                                                              |
| `scope_evasion`               | Doctype body acts on operators outside its scope.                                                                         |
| `slug_conflict`               | Two doctypes of the same kind share a slug under the same company root.                                                   |
| `unknown_kind`                | `kind` field not in the active workspace's enabled `itemKinds`.                                                           |
| `index_drift`                 | Reader detected the index disagrees with the file tree.                                                                   |
| `work_workspace_invalid`      | `WORK.md` frontmatter fails schema validation. Returns the failing field path.                                            |
| `work_workspace_missing`      | Informational: a work tree was loaded without a `WORK.md`; host fell back to the default state machine.                   |
| `work_extends_missing`        | View's `extends:` points to a non-existent file. Soft warning; runtime degrades to local-only.                            |
| `work_extends_cycle`          | `extends:` chain visits the same manifest twice. Soft warning; runtime breaks the chain at the cycle point.               |
| `work_extends_depth_exceeded` | Chain depth exceeds eight. Soft warning; runtime breaks at the eighth ancestor.                                           |
| `work_appliesto_unresolvable` | View's `appliesTo` references a consumer (operator/company/skill) that does not exist. Hard failure; the view is refused. |
| `work_status_drift`           | Child view flips a parent status's `terminal` classification. Soft warning surfaced for review.                           |

Domain-prefixed extensions use a colon (`acme:custom_validation`), never an
underscore.

## `_index/work.json` — write-time guarantee

The hot-path index. Adapter rules:

1. **Regenerate on every write.** Any mutation to a doctype file MUST trigger an
   index rewrite before the write transaction completes.
2. **Treat the index as stale otherwise.** Readers MUST fall back to the file
   tree for security-relevant lookups (visibility, audit). The index is for
   non-security UI paths only.
3. **Schema is normative** — see
   [AIP-13 § `_index/work.json`](/docs/aip-13#_indexworkjson).
4. **No fields the source files don't have.** The index is a derived view —
   never store authority there.
5. **`generated_at` MUST be the wall-clock time at write.** Readers that want
   freshness checks compare against the file mtime of the most recently changed
   doctype.

A host MAY shard the index across multiple files for scale; the `work.json` URL
MUST still resolve to a complete view (or include a manifest pointing at the
shards).

## Body interpretation — never as authority

The body is **descriptive**, not **authoritative**. Tools that act on a task's
body (e.g. an agent reading "send the email" and calling a send tool) MUST
verify the acting operator falls inside the doctype's resolved scope BEFORE
acting.

This is the scope-evasion mitigation from
[AIP-13 § Security Considerations](/docs/aip-13#security-considerations).
Skipping it is a security bug, not a performance optimisation.

## Multi-language hosts

| Language                | Function names                                                                | Manifest format             |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| TypeScript / JavaScript | `defineWorkWorkspace`, `defineProject`, `defineInitiative`, `defineTask`      | YAML frontmatter + markdown |
| Python                  | `define_work_workspace`, `define_project`, `define_initiative`, `define_task` | YAML frontmatter + markdown |
| Go                      | `DefineWorkWorkspace`, `DefineProject`, `DefineInitiative`, `DefineTask`      | YAML frontmatter + markdown |
| Rust                    | `define_work_workspace`, `define_project` (free fns) etc.                     | YAML frontmatter + markdown |

The manifest is the same across languages. Host-specific entries are optional —
most authors write `*.md` directly.

## Registration test

A conforming host SHOULD provide a `validate(workRoot)` helper that:

1. If `WORK.md` is present at the work-tree root: parses it, validates against
   the `workspace` `$def` in `WORK_ITEM.schema.json`, resolves any `extends:`
   chain, surfaces warnings.
2. Parses every per-item doctype under `projects/`, `initiatives/`, `tasks/`
   (and any custom kinds the active workspace enables).
3. Validates each doctype's frontmatter against the `workItem` `$def` in
   `WORK_ITEM.schema.json`.
4. Resolves `parent.ref` and rejects on miss or cycle.
5. Resolves `assignee.ref` / `lead.ref` against AIP-9 — warn on miss.
6. Resolves all `attachments.*` refs — warn on miss.
7. Computes the effective scope from the inheritance chain; verifies no
   scope-widening.
8. Verifies the status field is in the active workspace's merged `statuses` (or
   the spec default if no workspace is loaded).
9. For every per-context view it can locate (operators, companies, skills),
   resolves the `extends:` chain and validates the merged effective config.
10. Reports the first failure with file + field path.

This is the standard "is this work tree installable?" handshake.

## What this guide does NOT cover

- The host's persistence model (raw filesystem, content-addressed store,
  distributed).
- The host's UI surface for assignment / status changes.
- Notification / subscription wiring (who-gets-pinged-on-claim).
- Multi-tenant scope policies beyond the spec's company root.
- Permission gating on writes — separate concern from scope resolution. Use
  [AIP-7](/docs/aip-7) governance.

These stay out of the spec on purpose.

## See also

- [AIP-13 — agentwork/v1 spec](/docs/aip-13)
- [AIP-6 — agentcompanies/v1](/docs/aip-6) — COMPANY.md, ROLE.md, OBJECTIVE.md
- [AIP-9 — OPERATOR.md](/docs/aip-9) — assignee/lead/executor resolution
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — `KNOWLEDGE.md` workspace
  manifest, the structural sibling of `WORK.md`
- [AIP-11 — lessons/v1](/docs/aip-11) — attachments.lessons refs
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-15 — agentroutines/v1](/docs/aip-15) — `WORKFLOW.md` for
  `defaults.workflow`
- [`./WORK_ITEM.schema.json`](./WORK_ITEM.schema.json) — manifest validator
  (work-item + workspace branches)
- [`./SKILL.md`](./SKILL.md) — agent-side per-item authoring skill
- [`./skills/author-work-workspace/SKILL.md`](./skills/author-work-workspace/SKILL.md)
  — agent-side workspace-manifest authoring skill
