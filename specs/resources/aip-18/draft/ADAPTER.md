# ADAPTER.md — implementing AIP-18 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and validate** [AIP-18](/docs/aip-18)
`collections/v1` collections and items. It is normative for the parts marked
MUST and informative for the parts marked SHOULD.

The audience is a workspace-runtime author — someone exposing `defineCollection`
and `defineItem` to authoring agents. Authoring agents themselves should read
[`./skills/author-collection/SKILL.md`](./skills/author-collection/SKILL.md),
not this file.

## Five host responsibilities

A conforming host implements five responsibilities:

1. **Load the collection schema** — read `COLLECTION.md` files under the
   workspace, validate against the `schema` `$def` in
   [`./COLLECTION.schema.json`](./COLLECTION.schema.json), resolve any
   `extends:` chain, expose both the merged effective schema and the resolution
   chain on the debug surface.
2. **Validate items** — read `ITEM.md` files (or per-slug markdown files),
   validate frontmatter against the resolved collection schema, refuse
   non-conforming items with a structured error envelope.
3. **Resolve `extends:` chains** — apply the merge strategy table, enforce the
   three HARD refusals (field type drift, field removal, status removal),
   surface warnings for soft cases (missing parent, cycle, depth overflow).
4. **Run lints** — apply the resolved collection's lint rules to loaded items;
   surface findings via the workspace's lint pipeline (host-defined; AIP-18
   contributes the vocabulary, not the runner).
5. **Expose effective config** — every loaded collection MUST be queryable as
   `{ effective, chain, warnings }` so reviewers can audit which manifest
   contributed which field and tooling can diff a child against its parent.

The two canonical signatures, `defineCollection` and `defineItem`, are the
boundary between the host and the authoring agent.

## Loading a `COLLECTION.md`

A collection is the host's first read on every workspace load. The host computes
the resolved schema once per collection and caches it; items load against the
cached schema.

### Resolution algorithm

When a host reads a `COLLECTION.md`:

1. **Parse the frontmatter** as YAML. Validate against the `schema` `$def` in
   [`./COLLECTION.schema.json`](./COLLECTION.schema.json). On failure, surface
   `collection_invalid` with the failing field path.
2. **If `extends:` is absent**, the manifest IS the resolved schema. The
   resolution chain has length 1.
3. **If `extends:` is set**, walk the chain bottom-up:
   - Resolve `extends:` relative to the current manifest's directory.
   - If the parent file does not exist: emit `collection_extends_missing` as a
     WARNING (not an error), use the local manifest only, mark the chain as
     broken, proceed.
   - If the parent has already appeared in the visited set: emit
     `collection_extends_cycle` as a WARNING, break the chain at the cycle
     point, use the partial chain, proceed.
   - If the chain depth would exceed eight: emit
     `collection_extends_depth_exceeded` as a WARNING, break the chain at the
     eighth ancestor, use the partial chain, proceed.
   - Otherwise, recurse into the parent and add its absolute path to the visited
     set.
4. **Merge** the chain top-down (root first, leaf last) using the strategy table
   below. Child wins on overrides.
5. **Validate `appliesTo` resolvability**. For each ref in the leaf manifest's
   `appliesTo`, verify the consumer exists in the workspace tree. Refuse the
   collection (do NOT degrade) with `collection_appliesto_unresolvable` if any
   binding fails to resolve. This is a hard failure: a binding to nothing is
   semantically broken.
6. **Enforce HARD refusals during merge**:
   - **Field type drift** — for every field redeclared by a child, verify the
     type is compatible with the parent's. If not, refuse with
     `collection_field_type_drift`. Compatible means: same `type`; if
     `type: enum`, child's `enum` is a subset of parent's; if `type: array`,
     child's `items.type` matches parent's.
   - **Field removal** — if a child manifest's `fields` array omits a field
     declared in the parent, the host treats the omission as inheritance
     (parent's field flows through). If the child explicitly attempts to delete
     a parent field (e.g. via a vendor extension that signals deletion), refuse
     with `collection_field_removed`. Use `enabled: false` to deprecate.
   - **Status removal** — same shape: omission = inheritance, explicit deletion
     = `collection_status_removed` HARD refusal. Children may add statuses, mark
     inherited statuses `terminal: true`, or narrow `transitionsTo`.

The host MUST NOT execute any code in `COLLECTION.md`. It is data.

### Merge strategy

The host MUST apply this strategy when merging a parent into a child:

| Field                                                           | Strategy                   | Notes                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version`                       | override                   | Child's identity wins. Both are exposed via the resolution chain for tooling.                                                                 |
| `extends`                                                       | local-only                 | Not inherited.                                                                                                                                |
| `appliesTo`                                                     | local-only                 | Not inherited. Each child declares its own scope.                                                                                             |
| `fields`                                                        | merge-by-name              | Same `name` → child replaces parent's, subject to `collection_field_type_drift` HARD refusal. New names → appended.                           |
| `fields[].enabled`                                              | child wins                 | A child may set `enabled: false` on an inherited field to deprecate without removing it.                                                      |
| `statuses`                                                      | merge-by-id                | Same `id` → child replaces parent's, subject to `collection_status_removed` HARD refusal on omitted ids. New ids → appended.                  |
| `statuses[].terminal`                                           | child wins                 | A child may mark an inherited status terminal.                                                                                                |
| `statuses[].transitionsTo`                                      | child wins, narrowing only | A child may narrow the legal next-status set; widening (allowing a transition the parent forbade) is permitted but tooling SHOULD surface it. |
| `initialStatus`                                                 | override                   |                                                                                                                                               |
| `ownership.cardinality`, `ownership.role`, `ownership.required` | leaf-field override        |                                                                                                                                               |
| `deadline.kind`, `deadline.required`, `deadline.fieldName`      | leaf-field override        |                                                                                                                                               |
| `lints`                                                         | merge-by-id                | Same `id` → child replaces parent's. New ids → appended. Severity softening MAY be governance-restricted.                                     |
| `identity.slugSource`, `identity.filingPath`                    | leaf-field override        |                                                                                                                                               |
| `metadata`                                                      | deep-merge                 | Recursive merge; vendor namespaces accumulate.                                                                                                |

### Field type system — type × validation × storage hint

| Type       | Validation                                                                                          | Storage hint                                            |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `string`   | UTF-8 text; optional `pattern` regex; optional `format` named tag (email, uri, semver, uuid, slug). | `TEXT` / `VARCHAR`                                      |
| `number`   | JSON number; optional `min`/`max` range.                                                            | `NUMERIC` / `DOUBLE`                                    |
| `boolean`  | JSON `true`/`false`.                                                                                | `BOOLEAN`                                               |
| `enum`     | One of `enum[]` values. Compose: child enum MUST be subset.                                         | `TEXT` (or `ENUM` if dialect supports it)               |
| `date`     | ISO 8601 date (`YYYY-MM-DD`).                                                                       | `DATE`                                                  |
| `datetime` | ISO 8601 datetime (`YYYY-MM-DDTHH:MM:SSZ`).                                                         | `TIMESTAMPTZ`                                           |
| `text`     | Multi-line string; same as `string` but signals body-prose intent.                                  | `TEXT`                                                  |
| `url`      | Absolute URI.                                                                                       | `TEXT` (with URI lint)                                  |
| `ref`      | Pointer to an item; `refKind` names the target collection.                                          | `TEXT` storing the target id; FK if dialect supports it |
| `array`    | List; `items.type` declares the inner shape; `min`/`max` constrain length.                          | `JSONB` / native array                                  |

The storage hints are for hosts that project items into a database; AIP-18 is
filesystem-first, the markdown files are canonical.

## Validating an `ITEM.md`

When a host reads an `ITEM.md`:

1. **Parse the frontmatter** as YAML.
2. **Resolve `collection:`** against the registered collections (see
   §Item-collection resolution below). Unresolvable name →
   `collection_unresolvable` (HARD). Object-form ref outside its pinned semver
   range → `collection_item_schema_pinned_drift` (HARD).
3. **Look up the resolved schema** for the collection (cached from the merge
   step above). Compare the item's effective schema version with the version
   this item was last validated against; on mismatch surface
   `collection_item_schema_drift` (warn) so tooling can prompt for migration.
4. **Validate the universal core**: `schema` is the const, `collection`
   resolves, `id` matches the kebab/prefixed pattern, `title` length is 1..200.
5. **Validate the resolved schema's fields** against the item's frontmatter:
   - For each field in `schema.fields[]`:
     - If `required: true` and the field is missing → fail
       (`collection_item_invalid`, cause: `field_missing`).
     - If the field is present, validate `type`:
       - Type mismatch → fail (cause: `field_type_mismatch`).
       - Constraint violation (`pattern`, `enum`, `min`, `max`, `format`) → fail
         (cause: `field_constraint`).
       - For `type: ref`, look up the target item; if absent or its collection ≠
         `refKind` → fail (`collection_item_ref_unresolvable`).
       - For `type: array`, recurse on `items` for every element.
   - The host MAY surface every validation failure or stop at the first; AIP-18
     RECOMMENDS surfacing the full set so authors fix all in one pass.
6. **Validate the `status` field**, if present, against the resolved
   `statuses[].id` set. Unknown → fail with `collection_item_status_unknown`.
7. **Validate refs** — `parent`, `owner`, `attachments`, `links`, plus any
   `type: ref` field. Unresolvable refs default to
   `collection_item_ref_unresolvable`. Workspaces MAY downgrade to a warning via
   host policy.
8. **Run lints** — apply each lint declared in the resolved schema:
   - `missing-owner`: `ownership.required: true` AND the ownership field is
     absent or empty.
   - `overdue`: `deadline.kind != none`, the deadline field is in the past, and
     `status` is not terminal.
   - `orphan`: no inbound link to this item from any other item or workspace
     index.
   - `broken-ref`: any ref field points to a missing target.
   - `stale`: `updatedAt` older than `params.days`.
   - `required-field`: `params.field` missing or empty.
   - `custom`: host-defined check keyed by lint `id`.

The host returns a single result envelope: `{ ok: true, value: ResolvedItem }`
on success, `{ ok: false, error: { code, … } }` on failure. Lint findings travel
via the workspace's lint pipeline, not the validation envelope (lints are
advisory; validation is gating).

## Item-collection resolution

The `collection:` field on an `ITEM.md` resolves against three tiers, in
priority order — first hit wins, no fallback past the first:

| Tier | Source                                                        | Example                                                     |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | Inline declaration on the consuming workspace's root manifest | `WORK.md` `collections: [{ name: eng-bug, fields: [...] }]` |
| 2    | Local file by convention                                      | `<workspace>/collections/eng-bug/COLLECTION.md`             |
| 3    | Cross-workspace registry import                               | `ws://collections/eng-bug`                                  |

Unresolvable in all three tiers → `collection_unresolvable` (HARD) on item load.

**Ref shape** — `collection:` accepts two forms:

```yaml
collection: eng-bug                       # canonical form (99% case)

collection: { name: eng-bug, version: "1.x" }   # pinned form (escape hatch)
```

The string form floats to the current resolved schema. The object form pins a
semver range; on schema bumps that fall outside the range, the item fails with
`collection_item_schema_pinned_drift` (HARD) until re-pinned or migrated.

**Drift detection** — when a collection's schema is bumped, every item targeting
it MUST be re-validated on next load. Items that fail validation under the new
schema surface as `collection_item_schema_drift` (warn, not hard). The bytes on
disk do NOT change automatically — migrations are explicit operator actions.

## Sub-type query semantics

When collection `eng-bug` `extends: bug`, items of `eng-bug` are also
semantically items of `bug` (the parent's schema is satisfied by every
descendant item — Liskov substitution holds because field type drift is a HARD
refusal). This implies:

- **Default query semantics**: a query targeting `bug` returns the union
  `bug ∪ eng-bug ∪ infra-bug ∪ …` — every descendant.
- **`descendants(name)` API**: hosts MUST expose a function that returns the
  descendant set for any registered collection. Used by query layers, indexers,
  and cross-collection migrations.
- **Strict mode**: hosts MAY offer an opt-in `strict: true` flag for exact-match
  queries (e.g. when an admin wants to inspect `bug` items without subtype
  noise). This is host-defined; not part of AIP-18 conformance.

```ts
// Canonical descendants() shape:
descendants(name: string): {
  collections: Set<string>      // includes `name` itself
  warnings: Array<{ code: "collection_subtype_unresolved"; at: string }>
}
```

## One-way direction

The link from an item to its collection is **one-way**: items reference their
collection via `collection:`; collections do NOT list their items in their
frontmatter. The reverse index — "give me all items belonging to collection X" —
is host-derived, not stored on disk.

This invariant keeps `COLLECTION.md` stable: a collection's manifest does not
change on every item add/remove. The collection is the schema; items are
instances. Hosts MAY expose `getItemsByCollection(name)` as a query, but that
surface is host-defined, not part of AIP-18.

## Cross-AIP ref resolution

| Ref                      | AIP                    | Resolver                                                                         |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------- |
| `ws://workspaces/<slug>` | AIP-20 work workspace  | Look up the workspace; verify its root `WORK.md` (or successor manifest) exists. |
| `ws://wikis/<slug>`      | [AIP-10](/docs/aip-10) | Look up the wiki workspace; verify its `KNOWLEDGE.md` exists.                    |
| `ws://companies/<slug>`  | [AIP-6](/docs/aip-6)   | Look up the company workspace.                                                   |
| `ws://operators/<slug>`  | [AIP-9](/docs/aip-9)   | Look up the operator manifest.                                                   |
| `ws://skills/<slug>`     | [AIP-3](/docs/aip-3)   | Look up the skill manifest.                                                      |
| `extends: <path>`        | AIP-18                 | Resolve as a relative path to another `COLLECTION.md`.                           |
| `fields[].refKind`       | AIP-18                 | Resolve as a registered collection's `name` in the same workspace.               |

`appliesTo` enforcement: a host MUST refuse to register a collection whose
`appliesTo` references a non-existent consumer. Unlike chain warnings
(`extends:` failures), this is a hard failure during collection load. `refKind`
enforcement is similar but per-item: an item field of `type: ref` whose target's
collection ≠ `refKind` fails validation, not collection load.

## Effective config exposure

A conforming host MUST expose, for every loaded collection:

```ts
type ResolvedCollection = {
  effective: CollectionSchema // merged schema
  chain: Array<{
    // resolution chain (root → leaf)
    path: string // absolute path to the manifest
    doctype: "collection.schema/v1"
    name: string
    version: string
  }>
  warnings: Array<{
    // soft-fail diagnostics
    code:
      | "collection_extends_missing"
      | "collection_extends_cycle"
      | "collection_extends_depth_exceeded"
    message: string
    at?: string // path of the offending manifest
  }>
}
```

Hosts MAY also expose a per-collection `items` query that returns all loaded
items with their resolved validation state, but that surface is host-defined and
not part of AIP-18.

## Conflict cases

The following examples illustrate the merge rules with concrete parent/child
collections. Each is a minimal pair, not a full manifest.

**1. Field added by child (OK).**

Parent (`<workspace>/collections/issue/COLLECTION.md`):

```yaml
fields:
  - name: title
    type: string
    required: true
```

Child (`<workspace>/collections/bug/COLLECTION.md`):

```yaml
extends: ../issue/COLLECTION.md
fields:
  - name: severity
    type: enum
    enum: [low, medium, high, critical]
    required: true
```

Effective: parent's `title` plus child's `severity`. The child adds a new field
name; merge-by-name appends it.

**2. Field type drift (HARD refusal).**

Parent:

```yaml
fields:
  - name: severity
    type: string
```

Child:

```yaml
extends: ../issue/COLLECTION.md
fields:
  - name: severity
    type: number
```

The host refuses the child with `collection_field_type_drift`. Items written
against the parent carry `severity` as a string; loading them under the child
would fail. The invariant "items valid under parent stay valid under child"
forbids the change.

**3. Status removal (HARD refusal).**

Parent:

```yaml
statuses:
  - id: open
    label: Open
  - id: closed
    label: Closed
    terminal: true
```

Child:

```yaml
extends: ../issue/COLLECTION.md
statuses:
  - id: open
    label: Open
  # 'closed' deliberately omitted
```

The host's omission detection: if the child's `statuses` array explicitly
attempts to remove `closed` (e.g. via a host-specific deletion marker), refuse
with `collection_status_removed`. If the child simply doesn't redeclare
`closed`, that's inheritance and `closed` flows through to the resolved schema.
To discourage `closed` for new items, the child SHOULD narrow
`open.transitionsTo` to exclude `closed` rather than try to remove the status.

**4. Status added by child (OK).**

Parent:

```yaml
statuses:
  - id: open
    label: Open
  - id: closed
    label: Closed
    terminal: true
```

Child:

```yaml
extends: ../issue/COLLECTION.md
statuses:
  - id: triaged
    label: Triaged
  - id: open
    label: Open
    transitionsTo: [triaged] # narrow inherited transitions
```

Effective:

```yaml
statuses:
  - id: open
    label: Open
    transitionsTo: [triaged]
  - id: closed
    label: Closed
    terminal: true
  - id: triaged
    label: Triaged
```

The child narrowed `open`'s transitions and added `triaged`. `closed` is
preserved by inheritance.

**5. Lint severity softened by child (WARN; governance MAY block).**

Parent:

```yaml
lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: error
```

Child:

```yaml
extends: ../issue/COLLECTION.md
lints:
  - id: missing-owner
    kind: missing-owner
    appliesTo: "*"
    severity: warn
```

Effective: `severity: warn`. The host MUST allow the override unless the
parent's governance policy ([AIP-7](/docs/aip-7)) forbids softening lints — in
which case the host emits `governance:lint_softening_refused` and uses
`severity: error`. Tooling SHOULD surface the softening on the resolution-chain
debug surface so reviewers see the change.

## Error envelope

All errors leave the host as:

```ts
type CollectionResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        collection?: string
        item?: string
        path?: string
        cause?: unknown
      }
    }
```

`code` SHOULD use the AIP-18 vocabulary:

- `collection_invalid` — `COLLECTION.md` frontmatter fails schema validation.
  Returns the failing field path.
- `collection_extends_missing` — `extends:` points to a non-existent file. Soft
  warning; runtime degrades to local-only.
- `collection_extends_cycle` — `extends:` chain visits the same manifest twice.
  Soft warning; runtime breaks the chain at the cycle point.
- `collection_extends_depth_exceeded` — chain depth exceeds eight. Soft warning;
  runtime breaks at the eighth ancestor.
- `collection_appliesto_unresolvable` — `appliesTo` references a consumer that
  does not exist. Hard failure; the collection is refused.
- `collection_field_type_drift` — child field redeclaration changes `type`,
  narrows `array.items.type`, or widens an `enum` in a way that invalidates
  parent items. **HARD**.
- `collection_field_removed` — child explicitly attempts to delete a parent's
  field. **HARD**. Use `enabled: false` to deprecate.
- `collection_status_removed` — child explicitly attempts to delete a parent's
  status. **HARD**. Mark `terminal: true` or narrow `transitionsTo` instead.
- `collection_unresolvable` — `ITEM.md` `collection:` ref does not resolve in
  any tier (inline / local file / registry). **HARD**.
- `collection_item_schema_drift` — item bytes are valid YAML but the resolved
  schema has been bumped to a version that invalidates this item. Soft warning;
  tooling SHOULD prompt for migration.
- `collection_item_schema_pinned_drift` — item uses object-form
  `collection: { name, version }`, and the current resolved schema falls outside
  the pinned semver range. **HARD** until re-pinned or migrated.
- `collection_item_invalid` — `ITEM.md` frontmatter fails validation against the
  resolved collection schema. The `cause` field carries the specific failure
  (`unknown_collection`, `field_missing`, `field_type_mismatch`,
  `field_constraint`).
- `collection_item_status_unknown` — `status:` is not a status id declared
  (locally or inherited) by the collection.
- `collection_item_ref_unresolvable` — a `parent`, `owner`, `attachment`,
  `link`, or `type: ref` field points to a missing target, OR the target's
  collection ≠ the field's `refKind`.

Domain prefixes use a colon (`vendor:specific_code`), never an underscore.

## Canonical signatures

The host exposes two function signatures:

```ts
// Collection schema — workspace root or view.
defineCollection({
  schema: "collection.schema/v1"
  name: string
  title: string
  description: string
  version: string
  extends?: string                  // relative path to parent COLLECTION.md
  appliesTo?: string[]              // ws:// refs or relative paths
  fields?: Array<FieldDef>
  statuses?: Array<{ id: string; label: string; terminal?: boolean; transitionsTo?: string[] }>
  initialStatus?: string
  ownership?: { cardinality?: "none" | "single" | "multiple"; role?: string; required?: boolean }
  deadline?: { kind?: "none" | "target-date" | "window" | "recurrent"; required?: boolean; fieldName?: string }
  lints?: Array<{ id: string; kind: "missing-owner" | "overdue" | "orphan" | "broken-ref" | "stale" | "required-field" | "custom"; appliesTo: "*"; severity: "error" | "warn" | "info"; params?: Record<string, unknown> }>
  identity?: { slugSource?: string; filingPath?: string }
  metadata?: Record<string, unknown>
}): ResolvedCollection

type FieldDef = {
  name: string
  type: "string" | "number" | "boolean" | "enum" | "date" | "datetime" | "text" | "url" | "ref" | "array"
  required?: boolean
  description?: string
  enum?: string[]
  items?: FieldDef
  refKind?: string
  pattern?: string
  min?: number
  max?: number
  format?: string
  enabled?: boolean
}

// Item instance — validated against a named collection.
defineItem({
  schema: "collection.item/v1"
  collection: string                // collection name
  id: string
  title: string
  parent?: string
  owner?: string | string[]
  status?: string
  dueAt?: string
  attachments?: string[]
  links?: string[]
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  metadata?: Record<string, unknown>
  // ...plus collection-specific fields, flat at the top level
  [collectionField: string]: unknown
}): ResolvedItem
```

Hosts MAY alias `defineCollection` as `defineSchema`, `registerCollection`,
`defineRecord`. Hosts MAY alias `defineItem` as `createItem`, `registerItem`,
`defineRecord` (if not used for the schema). The canonical names MUST be present
in the public API.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function names                     | Schema dialect          |
| ----------------------- | ---------------------------------- | ----------------------- |
| TypeScript / JavaScript | `defineCollection`, `defineItem`   | JSON Schema or zod      |
| Python                  | `define_collection`, `define_item` | JSON Schema or pydantic |
| Go                      | `DefineCollection`, `DefineItem`   | struct tags             |
| Rust                    | `define_collection`, `define_item` | JSON Schema or schemars |

The frontmatter shape is the same across all languages — it's parsed by the
host, not by the authoring agent's language.

## Loader rules

Collection and item files MUST be safely importable as side-effect-free
markdown. Specifically:

- **No I/O at load.** The host reads bytes; nothing executes.
- **Frontmatter is YAML or TOML.** Implementations MUST support YAML; TOML is
  OPTIONAL.
- **Body is markdown.** AIP-18 does not parse the body; it's documentation
  prose.
- **Filename `COLLECTION.md` is normative for collections.** Items MAY use
  literal `ITEM.md` (when a collection has a single canonical instance — rare)
  or per-slug filenames; the frontmatter `schema:` discriminator is what makes a
  file an item.

## Registration test

A conforming host SHOULD provide a `validate(workspaceRoot)` helper that
round-trips a `COLLECTION.md` plus a sample `ITEM.md` through:

1. Parse the COLLECTION.md frontmatter; validate against the `schema` `$def`.
2. Resolve `extends:` chain; assert merged effective config matches expected
   snapshot.
3. Parse the ITEM.md frontmatter; validate against the resolved collection
   schema.
4. Serialise the validated item back to YAML; re-parse; assert identical AST.
   (Round-trip test — catches lossy serialisers.)
5. For every per-context `appliesTo` binding, verify the consumer exists.
6. Report the first failure with file + field path; on success, report the
   resolution chain length and lint findings count.

This is the standard "is this collection conforming?" handshake.

## What this guide does NOT cover

- The host's persistence strategy (database, file cache, vector index). AIP-18
  is filesystem-first; runtimes layer storage on top.
- The host's UI for browsing, editing, or approving items.
- Multi-tenant isolation, quotas, billing — runtime concerns.
- The lint runner's execution model (sync vs async, batch vs incremental).
  AIP-18 contributes vocabulary; hosts contribute runners.
- Migrations between collection versions. A future minor version of AIP-18 MAY
  introduce a `migration:` field; for now, versions evolve via `extends:` chains
  and hosts coordinate per-workspace.

These stay out of the spec on purpose.

## See also

- [AIP-18 — collections/v1 spec](/docs/aip-18)
- [AIP-1 — agent.json](/docs/aip-1)
- [AIP-2 — AIP template](/docs/aip-2)
- [AIP-7 — governance, approval, audit](/docs/aip-7)
- [AIP-9 — agentoperators/v1](/docs/aip-9)
- [AIP-10 — agentknowledge/v1](/docs/aip-10) — same composition pattern, applied
  to a workspace doctype
- [AIP-13 — agentwork/v1](/docs/aip-13) — hardcoded-types antecedent
- [`./COLLECTION.schema.json`](./COLLECTION.schema.json) — frontmatter validator
  (collection + item)
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference collections and items
- [`./skills/author-collection/SKILL.md`](./skills/author-collection/SKILL.md) —
  agent-side authoring skill
