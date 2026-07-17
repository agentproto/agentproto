# AIP-47 — Adapter guide

A guide for runtimes that already host AIP-9 operators and want to adopt
AIP-47 ROLE.md as the canonical job-description format. Mirrors the
structure of `aip-23/ADAPTER.md` and `aip-25/ADAPTER.md`.

## Surface to expose

A conforming AIP-47 adapter exposes four operations on top of the
existing AIP-9 OPERATOR runtime:

| Verb | Purpose |
|---|---|
| `role.resolve(ref)` | Resolve a ROLE.md ref (slug, `ws://` ref, file path, http URL) to a merged effective config + resolution chain. |
| `role.list(scope)` | List role refs available in a scope (workspace, org, public). |
| `role.validate(content)` | Validate a `ROLE.md` content string against `ROLE.schema.json` and `extends`-chain rules. |
| `role.hire(operator, role)` | Bind an operator (AIP-9) to a role. MUST fire `onAssign` if declared. |

`role.resolve` is the load-bearing primitive — every other verb sits on
top of it.

## Source chain

A conforming adapter MUST support **at least** two role sources, and
SHOULD support three. The chain is consulted in order; the first match
wins. A typical chain:

```
1. file://       roles in the local workspace (.guilde/roles/, roles/<slug>/ROLE.md)
2. db://         roles in the runtime's database (per-org custom roles)
3. builtin://    roles shipped by the runtime (e.g. @agentproto/role-catalog)
4. http://       roles fetched from a remote registry (optional)
```

The order is opinionated:

- **File first** because a workspace MAY override a builtin without
  publishing.
- **DB second** because per-org custom roles authored via UI live there
  and override builtins for that org.
- **Builtin last** as the always-available floor.
- **HTTP optional** for federated catalogues; runtimes that ship without
  it are still conformant.

Visibility scope (`metadata.guilde.visibility: public | private | org`)
MUST be enforced by the resolver, not by the file format. A role with
`visibility: org` served to an operator in a different org is a
resolver bug, not a spec bug.

## Resolution algorithm

```
resolve(ref):
  loaded = sourceChain.find(s => s.has(ref))
  if not loaded: emit role_unresolvable; return
  if not loaded.extends: return loaded
  parent = resolve(loaded.extends)
  return merge(parent, loaded)        // strategy table in AIP-47 §Merge strategy
```

The adapter MUST:

- Track visited absolute paths during recursion to detect cycles.
- Cap recursion depth at 8 (emit `role_extends_depth_exceeded`).
- Emit warnings (`role_*_unresolvable`) for unresolvable cross-AIP refs;
  do NOT block load.
- Return both the merged effective config AND the resolution chain
  (ordered list of absolute paths) on its debug surface.

## Operator binding

When `role.hire(operator, role)` is called, the adapter MUST:

1. Resolve the role (above).
2. Validate the operator's `appliesTo[]` declaration (if present) admits
   this operator.
3. Hoist resolved role fields into the operator's runtime configuration
   per [AIP-9](/docs/aip-9):
   - `mission`, `responsibilities`, body → instruction context
   - `tools[]`, `skills[]` → operator's **declared intent registry**
     (NOT the effective grant — see step 4)
   - `kpis[]` → scorers registered against the operator
4. **Policy gate (load-bearing).** Evaluate every tool / skill / action
   the operator may invoke against the operator's resolved
   [AIP-38](/docs/aip-38) POLICY — NOT against the role. A tool listed
   on the role but not granted by policy MUST NOT be invocable; the
   adapter emits `role_intent_unsatisfied` to the operator/admin
   debug surface but does NOT silently elevate. The role is a *hint
   for the policy author*, never a substitute for the policy itself.
5. Fire the role's `onAssign` action if declared (subject to AIP-7
   governance).
6. If the operator was previously bound to a different role, fire that
   role's `onDemotion` action; then fire the new role's `onPromotion`
   action.

**What `role.hire()` MUST NOT do.** The hire verb MUST NOT:

- modify the operator's effective POLICY ([AIP-38](/docs/aip-38))
- grant access to any tool / skill / action beyond what the operator's
  POLICY already allows
- adopt the role's `defaultPolicy` without an explicit operator
  `policy:` binding or a governance signature ([AIP-7](/docs/aip-7))
  attesting the change

Re-roling an operator is an HR-side change; elevating an operator's
access is a security-side change. Conforming adapters MUST keep these
flows separate.

## Storage shape

A conforming database source loader MAY back roles with a single table.
The reference adapter uses the shape:

```sql
CREATE TABLE role (
  -- identity
  id            text PRIMARY KEY,           -- slug (frontmatter `name`)
  version       text NOT NULL,              -- semver

  -- display
  title         text NOT NULL,
  description   text NOT NULL,

  -- org placement
  department    text,
  reports_to    text,                       -- slug ref
  seniority     text NOT NULL CHECK (seniority IN ('intern','junior','mid','senior','lead','principal','executive')),

  -- job content
  mission       text NOT NULL,
  responsibilities jsonb NOT NULL,          -- string[]
  capabilities     jsonb NOT NULL DEFAULT '[]',
  tools            jsonb NOT NULL DEFAULT '[]',
  skills           jsonb NOT NULL DEFAULT '[]',
  kpis             jsonb NOT NULL DEFAULT '[]',
  strengths        jsonb NOT NULL DEFAULT '[]',
  anti_patterns    jsonb NOT NULL DEFAULT '[]',

  -- composition
  extends_ref   text,                       -- slug or ws:// ref

  -- lifecycle hooks
  on_promotion  text,
  on_demotion   text,
  on_assign     text,

  -- cross-AIP refs
  applies_to       jsonb NOT NULL DEFAULT '[]',
  default_persona  text,
  default_identity text,
  default_policy   text,                    -- ADVISORY; never auto-applied to operators

  -- catalog
  tags          jsonb NOT NULL DEFAULT '[]',
  body          text NOT NULL DEFAULT '',   -- markdown body

  -- vendor metadata
  metadata      jsonb NOT NULL DEFAULT '{}',

  -- scope (vendor extension; conventional)
  visibility    text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','org')),
  organization_id text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_visibility_org ON role (visibility, organization_id);
CREATE INDEX role_department ON role (department);
```

The Guilde reference implementation reaches this shape by renaming
`operator_template` to `role` and aligning columns. The migration is
covered in the agentik-studio repo's role-catalog package.

## Error envelope

| Code | Meaning | Action |
|---|---|---|
| `role_unresolvable` | The ref did not resolve in any source. | Block hire; surface to caller. |
| `role_extends_cycle` | An `extends` chain cycles back to itself. | Warning; fall back to local manifest. |
| `role_extends_depth_exceeded` | Chain depth > 8. | Warning; fall back to local manifest. |
| `role_extends_missing` | `extends:` points to a missing parent. | Warning; use local manifest only. |
| `role_tool_unresolvable` | A `tools[]` entry did not resolve. | Warning; omit from operator's registry. |
| `role_skill_unresolvable` | A `skills[]` entry did not resolve. | Warning; omit. |
| `role_action_unresolvable` | A lifecycle hook ref did not resolve. | Warning; skip the hook. |
| `role_appliesto_unresolvable` | An `appliesTo[]` entry did not resolve. | Warning; treat as not-binding. |
| `role_default_persona_unresolvable` | `defaultPersona` did not resolve. | Warning; operator's own `persona` field wins. |
| `role_default_identity_unresolvable` | `defaultIdentity` did not resolve. | Warning; operator's own `identity` field wins. |
| `role_default_policy_unresolvable` | `defaultPolicy` did not resolve. | Warning; the role's tool/skill intents stay declarative; the operator's own `policy` (if any) governs effect. |
| `role_intent_unsatisfied` | A role-declared `tools[]` / `skills[]` entry is NOT granted by the operator's resolved policy. | Warning to operator/admin; tool/skill MUST NOT be invoked. The role's declaration is intent, not grant. |
| `role_reports_to_unresolvable` | `reports_to` did not resolve. | Warning; render org chart with broken link. |
| `role_merge_form_conflict` | A field uses both the short list form and the long `{add,remove}` form. | Warning; use the long form, ignore the short. |
| `role_merge_remove_missed` | A `remove` entry did not match any inherited entry. | Warning. |
| `role_visibility_violation` | A role with `visibility: org` was returned cross-org. | MUST NOT be returned; treated as `role_unresolvable`. |

## Validation timing

- **Static** — file parsing, frontmatter shape, `ROLE.schema.json`. Run
  on author save, on package install, on PR review.
- **Resolution-time** — `extends` chain walk, cycle detection, merge
  strategy.
- **Bind-time** — `appliesTo[]` evaluation, lifecycle hook firing,
  governance gate against [AIP-7](/docs/aip-7).

Adapters MUST run static validation before resolution and resolution
before bind-time. Failing static validation MUST NOT result in a hire.
