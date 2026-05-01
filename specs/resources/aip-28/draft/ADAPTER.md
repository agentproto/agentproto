# ADAPTER.md — implementing AIP-28 in a host runtime

This document is the implementer's guide for any runtime, framework, or
language that wants to **load, register, and invoke** AIP-28
[`INTENT.md`](/docs/aip-28) files. It is normative for the parts marked
**MUST** and informative for the parts marked **SHOULD**.

The audience is a runtime author — someone exposing `defineIntent` to
intent authors and surfacing intents on chat/menu/voice/shortcut surfaces.
Intent authors themselves should read [`./skills/author-intent/SKILL.md`](./skills/author-intent/SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when an
INTENT.md folder is registered:

1. **Parse the manifest** — read `INTENT.md`, validate against
   [`./INTENT.schema.json`](./INTENT.schema.json), surface errors.
2. **Resolve the routing** — either purely from frontmatter (`implements:`
   block) or by loading the entry's `defineIntent` value when `entry:` is
   declared.
3. **Register on each declared surface** — chat catalog, menu, voice grammar,
   shortcut palette, public API. Each surface adapter renders the intent in
   its own idiom.
4. **Dispatch on invocation** — validate UX inputs, run routing, invoke the
   resolved tool/workflow, render outputs back through the surface.

The signature `defineIntent` exposes is the boundary between the host and
the author. The host MAY internally translate to its own intent type after
the call, but `defineIntent` is what the author calls.

## `defineIntent` — the entry-point function

### Required behaviour

A host that implements `defineIntent` MUST:

1. **Accept the `IntentDefinition` shape** documented in
   [AIP-28 § The `defineIntent` standard signature](/docs/aip-28#the-defineintent-standard-signature).
   Every field listed there MUST be honoured at runtime.

2. **Validate `args.input` against the manifest's `inputs[]`** before calling
   `route`. The validation covers `required`, `min`/`max`, `min_length`/
   `max_length`, `pattern`, `values`, and field-type coercion. Mismatch
   surfaces as `error.code = "input_invalid"` with `field: <name>`.

3. **Pass `context` through** with at least:
   - `surface` (`"chat" | "menu" | "voice" | "shortcut" | "api"`) — REQUIRED,
     the surface the call originates from.
   - `user.id` (string \| undefined) — caller identity for audit and
     plan-aware routing.
   - `user.tier` (string \| undefined) — pricing tier for plan-aware routing.
   - `user.locale` (string \| undefined) — for i18n resolution.
   - `workspace.id` (string \| undefined) — multi-tenant routing.
   - `capabilities` (string[]) — what the caller is permitted to do.
   - `signal` (AbortSignal) — cancellation propagation.

   Hosts MAY add fields under namespaced keys; bodies MUST tolerate missing
   fields.

4. **Honour `route`'s contract.**
   - `route` returns a `RouteResult` (`{ tool }` or `{ workflow }`); the
     host invokes the returned ref.
   - `route` MUST NOT perform side-effecting I/O. Implementations SHOULD
     warn if a routing function takes longer than 100 ms.
   - `route` MUST honour `signal`; long-running routing logic (e.g.
     consulting an LLM) MUST stop on cancellation.

5. **Apply the `mapping:` block** before invoking the routed tool. UX input
   names map to tool input names per the manifest; unmapped fields are
   passed through verbatim. Hidden (filtered by `depends_on`) fields MUST
   NOT be passed through.

6. **Resolve experiments deterministically per session.** When
   `experiments[]` is present, the host computes a session-stable arm
   selection (hash of `user.id` + intent `id`) and uses the picked arm's
   `implements:` overrides. The same user MUST see the same arm across
   surfaces within the experiment's `decision_window`.

### Optional behaviour

A host MAY:

- Re-export `defineIntent` under host-idiomatic aliases (`createIntent`,
  `intent`). The canonical name MUST be present.
- Accept zod, pydantic, or other schema libraries as the `inputs[]` shape —
  canonicalise to the manifest's flat field list before publication.
- Expose host-specific surface hints via `metadata.<surface>.…`. Authors
  stash hints there; other hosts MUST tolerate unknown keys.
- Cache routing decisions when `route` is purely deterministic (no
  `context` references). Cache key MUST include input shape; reset on
  manifest version bump.

## Surface rendering

Each surface adapter is responsible for projecting an `IntentDefinition`
into its own UI. The contract surface adapters MUST honour:

| Surface | Renders |
|---|---|
| `chat` | The intent appears as a slash command, intent match, or button in the agent's chat UI. `intent[]` seeds the LLM for matching natural language. |
| `menu` | The intent appears as a card or menu entry. `label`, `description`, `preview`, `examples` drive the catalog UX. |
| `voice` | The intent appears in the voice grammar. `metadata.voice.confirmation_template` (if present) is the spoken acknowledgement; otherwise a default ("Done"). |
| `shortcut` | The intent appears in keyboard-shortcut palettes. `label` is the palette entry. |
| `api` | The intent is exposed as a programmatic endpoint. `inputs[]` drives the request schema. |

Adapters MUST honour the `surfaces[]` allowlist. An intent not declared on
a surface MUST NOT appear there.

## i18n resolution

Every i18n-aware field (string-or-map) MUST be resolved against the
caller's `context.user.locale`, with fallback order:

1. Exact locale match (`fr-CA` → `fr-CA` → `fr` → en).
2. Language-only match (`fr-CA` → `fr`).
3. `en` fallback.
4. Field's first declared locale (when `en` is missing).

Hosts MUST log a warning when no locale matches are available. Hosts MAY
ship a developer-mode "locale linter" that flags intents missing locales
listed in their host config.

## Routing semantics

### Predicate evaluation

The `when:` predicate is a flat AND-combined object. Evaluation rules:

| Shape | Match rule |
|---|---|
| `key: value` | `input[key] === value` |
| `key: { not: value }` | `input[key] !== value` |
| `key: { in: [...] }` | `input[key]` is one of the listed values |
| `key: { not_in: [...] }` | `input[key]` is none of the listed values |
| `key: { not_empty: true }` | `input[key]` is set, non-null, non-empty string/array |
| `key: { gt: n }` / `lt` / `gte` / `lte` | numeric compare |

Empty / missing inputs match `not_empty: false` and `not_in:` lists.
Unknown comparison shapes MUST surface a manifest validation error at
load time, not silently fail at runtime.

### Selection algorithm

Given `implements: [...]`, the host:

1. Filters out entries whose `when:` predicate doesn't match.
2. Among matching entries, picks the first non-default entry.
3. If none match, picks the entry marked `default: true`.
4. If no default exists, surfaces `error.code = "no_route"`.

Custom routing (`entry:` in `implements`) bypasses this — the host calls
`route()` and uses its return value directly.

### Mapping resolution

```yaml
mapping:
  prompt: prompt              # explicit identity
  style:  artistic_style      # rename
  size:                       # transform
    from: aspect
    transform: aspect_to_size
```

For each entry in `mapping`:

- **String value** = identity or rename. Source key from intent input,
  destination key for tool input.
- **Object with `from` + `transform`** = call the named transformer
  exported by the entry. The transformer's signature MUST be
  `(value: unknown, context: IntentContext) => unknown`.

Tool inputs not mentioned in `mapping` are populated by name match
(intent input name = tool input name). Unknown destination keys (no
matching tool input property) MUST surface as a manifest validation error.

## Errors

Intents return errors out-of-band relative to the routed tool's `outputs`.
The host wraps results in:

```ts
type IntentResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: { code: string; message: string; field?: string; cause?: unknown } }
```

Standard error codes:

| Code | When |
|---|---|
| `input_invalid` | UX input failed validation. `field:` names the offending input. |
| `no_route` | No `implements` entry matched and no default declared. |
| `route_failed` | Custom `route()` threw. |
| `tool_unavailable` | Routed tool couldn't be loaded (missing, install failed, version mismatch). |
| `quota_exceeded` | `quota_key` budget hit. The host enforces; the intent declares the meter. |
| `auth_required` | The routed tool's auth resolution failed. Surface to the user with the login flow if available. |
| `cancelled` | Caller aborted. |
| `internal` | Unhandled host error. |

Tool-specific codes from the routed tool propagate through unchanged
under their own namespace (e.g. `stripe:card_declined`).

## Quota & cost

`quota_key` is the meter key. The host enforces budget — intents
declare, the host policy decides the limit. When `quota_key` is omitted,
the intent falls back to the routed tool's cost class.

`cost_class` overrides the routed tool's cost class for the purpose of
surface affordances:

- `trivial` — invoke without ceremony.
- `metered` — count against quota silently.
- `expensive` — surfaces SHOULD show a "this will cost N units" affordance
  before invocation.

## Capabilities & governance

When `requires:` is omitted, the host computes the union of all candidate
tools' `requires` and uses that as the intent's effective requirement set.
Authors override this only when the routing logic itself needs additional
capabilities (rare).

Approval gating ([AIP-7](/docs/aip-7)) runs on the **routed tool's**
`approval` class, not the intent's. The intent's job is routing; the
tool's job is declaring its own safety contract.

## Audit log shape

Hosts SHOULD emit one audit entry per intent invocation:

```json
{
  "type": "intent.invoked",
  "action_id": "image.create",
  "action_version": "1.1.0",
  "surface": "chat",
  "user_id": "u_abc",
  "workspace_id": "w_xyz",
  "input_keys": ["prompt", "style"],
  "experiment_arm": "control",
  "routed_to": { "kind": "tool", "ref": "./tools/openai-dalle/TOOL.md" },
  "duration_ms": 4200,
  "ok": true,
  "quota_key": "ai.image.create",
  "ts": "2026-04-30T14:00:00Z"
}
```

`input_keys` lists the keys submitted (not values — values are PII-
sensitive). Tool-level audit ([AIP-7](/docs/aip-7)) captures the actual
invocation downstream.

## Reference implementation

The canonical TypeScript implementation lives at
`packages/intent-runtime`.
It exposes:

- `defineIntent(definition: IntentDefinition): IntentHandle`
- `loadIntent(path: string): Promise<IntentHandle>`
- `runIntent(handle, { input, context, signal }): Promise<IntentResult>`
- `registerOnSurface(handle, surface, adapter)` — surface registration

Hosts in other languages should mirror this surface; the contract is the
manifest and the `defineIntent` shape, not the package.

## Migration notes

### From a tool-only catalog

Catalogs that today register tools directly migrate by wrapping each
tool in a thin INTENT.md:

1. Author `INTENT.md` next to the tool's folder. `implements:` is one
   entry pointing at the existing TOOL.md.
2. Mirror the tool's input properties as UX `inputs[]` with sensible
   labels.
3. Update surface registrations to read from the intent registry.
4. Delete direct tool registrations from surfaces.

The tools stay unchanged. Surfaces gain consistent UX copy.

### From prompt-driven routing

Prompts that today encode "if user wants X, call tool Y" migrate by
extracting the routing into INTENT.md frontmatter:

1. Identify each `if/else` branch in the prompt.
2. Translate to `implements[].when:` entries.
3. Verify the prompt no longer needs to encode the routing — the runtime
   does it.
4. Update the prompt to address the intent by `id`, not the tools.

The agent's prompt shrinks; routing becomes data; driver swaps become
edits to one frontmatter field.
