# ADAPTER.md — implementing AIP-4 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, resolve, and apply** AIP-4 [`DESIGN.md`](/docs/aip-4)
kits. It is normative for the parts marked MUST and informative for the parts
marked SHOULD.

The audience is a framework, host, or registry author — someone exposing
`defineDesign` to kit authors and wiring tokens into a runtime theming system
(CSS variables, Tailwind config, native theme objects). Kit authors themselves
should read [`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements four responsibilities, in this order when a
DESIGN.md is loaded:

1. **Parse the frontmatter** — extract YAML from between the `---` fences,
   validate against [`./DESIGN.schema.json`](./DESIGN.schema.json), surface
   errors through the standard envelope.
2. **Resolve tokens** — expand `{colors.<name>}` references, merge
   `variants[<mode>]` deltas onto the base, freeze the result.
3. **Expose the resolved kit** — surface tokens as CSS variables, a Tailwind
   config patch, a native theme object, or whichever shapes the host targets.
4. **Hot-reload on change** — when the source file or registry record changes,
   re-parse, re-resolve, and emit a `design:changed` event the consuming UI can
   subscribe to.

The signature `defineDesign` exposes is the boundary between the host and the
kit author. Hosts MAY internally translate to their own theme type after the
call, but `defineDesign` is what the author calls when authoring kits in code
rather than markdown.

## `defineDesign` — the entry-point function

A host that exposes `defineDesign` MUST:

1. **Accept a `DesignKit` shape** matching the AIP-4 frontmatter — `kit`,
   `title`, `colors`, `typography`, `spacing`, `rounded`, `shadows`, `motion`,
   `variants`, plus registry metadata.
2. **Run the same resolver** the markdown loader uses, so a kit authored in code
   and a kit authored in markdown produce identical resolved output.
3. **Refuse registration if required tokens are missing.** The minimum set is
   `colors.background`, `colors.ink`, `colors.primary`, `typography.body`,
   `typography.h1`. Hosts MAY require more; they MUST NOT require less.
4. **Re-export the canonical name `defineDesign`.** Hosts MAY provide idiomatic
   aliases (`createDesign`, `theme`, `register_design`) — the canonical name
   MUST also be present so third-party kits load uniformly.

Optional behaviour:

- Accept a builder DSL (`design.color(...).type(...)...build()`) alongside the
  object form.
- Validate against an extended schema that adds host-specific required tokens —
  declare those extensions in `metadata.<host>.requires` so kit authors know
  what to author.

## Token resolution

Resolution is a pure function of the parsed frontmatter. The host MUST run these
passes in order:

### Pass 1 — variant merge

If the kit declares `mode: both` and the host requests a variant (typically
driven by user preference / OS setting), shallow-merge each
`variants[<mode>].<group>` block onto the base of the same group. Tokens absent
from the variant inherit from the base.

```
resolved.colors = { ...base.colors, ...variants[mode]?.colors }
resolved.typography = { ...base.typography, ...variants[mode]?.typography }
// … etc per group
```

### Pass 2 — reference expansion

Walk every string token. When the value matches `{<group>.<name>}`, replace it
with the resolved value of that referenced token. Repeat until no references
remain. Hosts MUST detect cycles and refuse the kit with `code: "design.cycle"`
citing the cycle path.

References across groups are allowed (`link: "{colors.accent}"`) and across
alpha-modulated values (e.g. `{colors.ink}/0.5` to mean 50% opacity over
`colors.ink`) when the host's resolver supports the `/` alpha suffix. The
alpha-suffix MAY be unsupported; unsupported references MUST surface a clear
error rather than silently producing an empty string.

### Pass 3 — composition (optional)

If the frontmatter declares `based-on: <kit-uri>`, the host MUST fetch the
parent kit, resolve it, then layer the current kit's tokens on top. Errors
fetching the parent MUST be opaque to the end-user UI but logged with
`code: "design.parent_unresolved"`.

The depth limit is **3** (`A based-on B based-on C`). Deeper chains MUST be
rejected to bound resolution cost.

### Pass 4 — freeze

The resolved object MUST be frozen (`Object.freeze`, `types.MappingProxyType`,
language equivalent) before being handed to consumers. Mutating tokens at
runtime is not part of the contract; hosts that want runtime tweaks expose a
separate `override(...)` API that produces a new resolved object.

## Exposing the resolved kit

Hosts SHOULD expose at least three target shapes; whichever they expose MUST
agree on resolved values:

### CSS variables

Generate a stylesheet whose selectors map kit tokens to CSS custom properties:

```css
:root {
  --color-background: #0e0f12;
  --color-ink: #f4f4f5;
  --color-primary: #6366f1;
  --typography-body-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --spacing-md: 1.5rem;
  --rounded-md: 8px;
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
}
```

Variable naming MUST be `--<group>-<name>` for atomic tokens and
`--<group>-<name>-<field>` for object tokens (typography). This is the canonical
mapping; consumers can rely on it across hosts.

### Tailwind config patch

Hosts targeting Tailwind SHOULD emit a config object suitable for
`theme.extend`:

```js
{
  colors:    { background: 'var(--color-background)', ink: 'var(--color-ink)', /* … */ },
  fontFamily: { sans: ['var(--typography-body-family)'], serif: ['var(--typography-h1-family)'] },
  spacing:   { xs: 'var(--spacing-xs)', sm: 'var(--spacing-sm)', /* … */ },
  borderRadius: { sm: 'var(--rounded-sm)', /* … */ },
  boxShadow: { sm: 'var(--shadow-sm)', /* … */ },
}
```

The double-indirection (Tailwind class → CSS var → resolved value) makes
hot-swap free: changing the variant flips the CSS-var layer without rebuilding
Tailwind.

### Native theme object

Hosts targeting native UI (mobile, terminal, native renderers) expose a typed
theme object directly. Field names MUST mirror the frontmatter shape
(`colors.primary`, not `primaryColor`) so kits move between targets without a
translation step.

## Hot-reload

In development, hosts SHOULD watch the kit source for changes and re-emit on
each save. The minimum contract:

1. Watch the file (or registry record).
2. On change, re-parse, re-resolve, diff against the current.
3. Emit a `design:changed` event with the diff.
4. The consuming UI re-applies CSS vars without a full reload.

Production hosts MAY skip the watcher. They MUST still expose a `reload(kitId)`
API so registry-driven hosts can pull updates without restart.

## Registry conventions for designkit.sh

The designkit.sh registry layers four conventions on top of the file format:

1. **Slug-namespaced IDs.** A published kit's canonical ID is
   `<author-handle>/<kit-slug>`. Authors author with bare `kit: <slug>` in
   frontmatter; the registry namespaces on publish.
2. **Immutable versions.** Once a `<author>/<slug>@<version>` tuple is
   published, it cannot be overwritten. Bump the semver.
3. **Preview is required for public kits.** Submissions without `preview:` are
   rejected. Hosts displaying registry listings MUST show the preview
   prominently.
4. **License is surfaced everywhere.** Hosts MUST display the declared `license`
   next to the kit name in any list view. Users should never install a kit
   without seeing the license first.

Hosts consuming registry-distributed kits MUST honor the immutability invariant:
cache by `<author>/<slug>@<version>` and never re-fetch a tuple unless
explicitly invalidated.

## Error envelope

Errors from parse / resolve / apply leave the host as:

```ts
type DesignResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; path?: string; cause?: unknown }
    }
```

`code` SHOULD use the AIP-4 vocabulary:

| Code                            | Meaning                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `design.frontmatter_invalid`    | YAML failed to parse or schema-validate.                                                        |
| `design.required_token_missing` | A required token is absent.                                                                     |
| `design.cycle`                  | Reference expansion hit a cycle.                                                                |
| `design.unknown_reference`      | `{colors.foo}` points at a token that doesn't exist.                                            |
| `design.parent_unresolved`      | `based-on` parent kit failed to load.                                                           |
| `design.contrast_warning`       | WCAG AA failed for ink-on-background or on-primary (warning-level; hosts MAY downgrade to log). |

`path` cites the offending field (`colors.primary`, `variants.dark.colors.ink`)
so the kit author can fix without guessing.

## Loader rules

- DESIGN.md is parsed as **frontmatter + body**. The body is _informational_
  (overview prose, rationale) — hosts MUST NOT derive runtime behaviour from
  body content.
- Frontmatter MUST be the first block in the file, opened and closed with `---`
  on their own lines. Anything before the opening fence is a parse error.
- Files are UTF-8. BOMs are tolerated and stripped.
- Comments inside frontmatter use YAML `#`. Hosts MUST preserve comments when
  round-tripping through `defineDesign` (they're often editorial notes the
  author wants to keep).

## What this guide does NOT cover

- The host's persistence model (in-memory cache, DB, distributed registry).
- The host's UI for letting users pick / preview / install kits.
- Component-level theming beyond tokens — that lives in [AIP-5](/docs/aip-5)
  (CANVAKIT.md).
- Animated transitions between kits — out of scope for v1.

These are runtime-policy concerns and stay out of the spec on purpose.

## See also

- [AIP-4 — DESIGN.md spec](/docs/aip-4)
- [AIP-5 — CANVAKIT.md](/docs/aip-5) — component-library sibling
- [`./DESIGN.schema.json`](./DESIGN.schema.json) — frontmatter validator
- [`./SKILL.md`](./SKILL.md) — kit-author skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference kits
