---
schema: skills/v1
name: author-design
title: Author a DESIGN.md (AIP-4)
description:
  Walk through authoring a portable DESIGN.md design-token kit with colors,
  typography, spacing, radius, and motion, plus the registry metadata required
  to publish to designkit.sh.
version: 1.0.0
tags: [aip-4, design, tokens, theme, authoring, manifest, agentproto]
inputs:
  - name: brief
    type: string
    required: true
    description:
      One-paragraph description of the look, mood, or brand the kit expresses.
      The skill turns this into tokens + body prose.
  - name: mode
    type: string
    required: false
    description:
      'Default surface mode. One of "light", "dark", or "both". Defaults to
      "light".'
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new folder under `.designkits/<id>/`.
examples:
  - input:
      brief:
        A warm editorial kit for a long-form publishing app — cream paper
        background, oxblood accents, a high-contrast serif for display.
    output:
      - .designkits/heritage-press/DESIGN.md
---

# Author a DESIGN.md (AIP-4)

Use this skill when the user asks to **draft, design, or define a design kit** —
colors, typography, spacing, radius, motion — that other surfaces (apps, sites,
agent-rendered UIs) will theme themselves with. The skill produces a valid
[AIP-4 DESIGN.md](/docs/aip-4) file: frontmatter tokens plus body prose
explaining the kit, ready to publish to the designkit.sh registry or consume
in-process via `defineDesign`.

## When to use

- "Make me a kit that feels like a quiet morning newspaper."
- "Theme this app with a moody synth-wave palette."
- "I have a brand color and a typeface — turn it into a portable kit."
- "Fork the Heritage kit and swap the accent to teal."

## When NOT to use

- The user wants a **component library / canvas template** → use the
  [AIP-5 CANVAKIT-authoring skill](../../../aip-5/skills/author-canvas/SKILL.md)
  instead.
- The user wants to **install or apply** an existing kit — no authoring needed;
  defer to the host's adapter.
- The user wants a **CSS file** with no portable token contract — DESIGN.md is
  overkill; just write CSS.

## Process

Eight steps. The order matters: tokens first, registry metadata last, validation
always. Skipping the naming step is the most common error and produces kits that
look right but can't compose with siblings.

### 1. Fix identity and registry metadata

The frontmatter top-block carries the registry contract. Get this right so the
kit is citable and installable.

- `kit`: kebab-case, 2–48 chars, descriptive of the _vibe_ not the literal
  colors (`heritage-press` not `cream-and-oxblood`).
- `title`: human display label.
- `schema: designkit/v1` is required; it pins the registry version the kit
  conforms to.
- `version`: semver. Bump on any token change (`1.0.0` → `1.1.0` for added
  tokens; `2.0.0` for removed or renamed).
- `license`: SPDX identifier. `MIT` for open kits, `CC-BY-4.0` for
  attribution-required, `proprietary` for private brand kits.
- `author` and (optional) `homepage`: who shipped it, where to find more.
- `tags`: 3–6 lowercase descriptors covering _style_ (`editorial`, `synthwave`),
  _vibe_ (`warm`, `clinical`), and _era_ (`90s`, `modernist`). The registry uses
  these for discovery.
- `preview`: URL to a screenshot of the kit applied to a reference surface.
  Strongly recommended; required for public submission.

### 2. Pick the mode and surface palette

`mode` declares the default surface family — one of `light`, `dark`, or `both`.
`both` means the kit ships sibling token sets and the host picks at runtime.

Resolve the palette in this order — the contracts depend on each other, so
authoring out of order produces broken kits:

1. **`background`** — the canvas, the largest area on screen.
2. **`surface`** — one elevation step up: cards, panels, popovers.
3. **`ink`** — the body-text color. MUST clear WCAG AA against `background`
   (4.5:1 for body, 3:1 for large headings).
4. **`ink-muted`** — secondary text. Usually `ink` at 50–65% alpha.
5. **`primary`** — the brand-anchoring action color. One CTA per page should
   carry it.
6. **`on-primary`** — text/icon color when laid on `primary`.
7. **`accent`** — links, highlights, decorative second voice.
8. **`border`** — separators. Usually `ink` at low alpha (4–10%).

Optional but encouraged: `muted`, `muted-foreground`, `link`, `success`,
`warning`, `danger`. Each follows the same on-/from- naming pair.

Reference other tokens with the `{colors.<name>}` resolver — e.g.
`link: "{colors.accent}"`. The host expands these at parse time.

### 3. Define typography scales

Author at least `body`, `h1`, `h2`, `h3`. Each entry is an object:

```yaml
typography:
  body:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1rem"
    weight: 400
    lineHeight: 1.6
  h1:
    family: "'Fraunces', 'Georgia', serif"
    size: "3.5rem"
    weight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
```

Rules:

- Always quote font stacks — YAML eats unquoted commas.
- Always include the system fallback chain (`ui-sans-serif`, `system-ui`,
  `serif`, `monospace`) so the kit degrades gracefully when the primary font
  fails to load.
- Sizes in `rem` (preferred) or `px`. Don't mix.
- `lineHeight` unitless. `letterSpacing` in `em` so it scales with size.
- Add `code: { family: <mono-stack> }` whenever the kit will render any code or
  technical content.

### 4. Define spacing, radius, and shadow scales

These are small, well-known scales — keep them simple and consistent.

```yaml
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "3rem"
  xl: "5rem"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  full: "9999px"
shadows:
  sm: "0 1px 2px rgba(0, 0, 0, 0.06)"
  md: "0 4px 16px rgba(0, 0, 0, 0.10)"
  lg: "0 12px 40px rgba(0, 0, 0, 0.16)"
```

Use `xs..xl` token names, not raw numbers. Hosts ship their CSS-var or Tailwind
aliases against these names; raw numbers don't compose.

### 5. Add motion tokens (when the kit cares about feel)

Optional but recommended for any kit shipping interactivity:

```yaml
motion:
  duration:
    fast: "120ms"
    base: "200ms"
    slow: "320ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
    enter: "cubic-bezier(0, 0, 0, 1)"
    exit: "cubic-bezier(0.4, 0, 1, 1)"
```

Keep durations short (the longest non-decorative animation should be ≤ 320 ms).
If the kit ships a `motion` block, document the _intent_ in the body — "slow
easing on overlays so context-shifts read as deliberate".

### 6. Author dark/light variants when needed

If `mode: both`, ship a `variants` block:

```yaml
mode: both
colors:
  # … light tokens …
variants:
  dark:
    colors:
      background: "#0E0F12"
      ink: "#F4F4F5"
      # … overrides only — unchanged tokens inherit from the base …
```

Variants are **delta blocks** — they only carry the tokens that differ. The host
merges the base and the variant before exposing tokens to consumers.

A kit with `mode: both` MUST clear contrast in every variant. Re-run the WCAG
check from step 2 against each variant's resolved palette.

### 7. Compose the body

The frontmatter is the contract; the body is the editorial. Write:

- **`## Overview`** — what the kit feels like, who it's for, one paragraph. The
  registry surfaces this in search results.
- **`## Colors`** — defend each non-obvious color choice. Why this primary, why
  this accent, what they evoke.
- **`## Typography`** — the typefaces and the relationships between them.
  Pairing rationale matters.
- **`## Usage`** — when to reach for this kit, and when not to. Be honest about
  where it doesn't fit.
- **`## Composition`** _(optional)_ — if the kit extends another via `based-on`,
  document what changed and why.

Keep the body to 80–150 lines. Longer kits read like specs; shorter kits read
like checklists. The registry truncates above 200 lines.

### 8. Validate

Validate the frontmatter against [`./DESIGN.schema.json`](./DESIGN.schema.json):

```bash
npx ajv validate -s ./DESIGN.schema.json -d ./DESIGN.md
```

Fix every error before declaring success. Specifically check:

- Required tokens present: `colors.background`, `colors.ink`, `colors.primary`,
  `typography.body`, `typography.h1`.
- All `{colors.<name>}` references resolve.
- All hex / rgba / hsl color literals parse.
- WCAG AA holds for `ink` on `background` and `on-primary` on `primary` (and
  again in every variant).
- `kit` slug is unique within the user's namespace if publishing.

## Output

Produce one file in the chosen folder:

```
<folder>/
  DESIGN.md       # the kit
```

Reply to the user with:

1. The folder you wrote to.
2. A swatch summary: `background` / `surface` / `ink` / `primary` / `accent` so
   they can sanity-check the palette without opening the file.
3. Any **open assumptions** — defaults you guessed (e.g. spacing scale, motion
   durations, shadow elevations) the user might want to override.
4. Whether the kit clears WCAG AA in every shipped variant — flag any that
   don't.

Do NOT publish the kit to designkit.sh yourself. Authoring ends with the file
written; publishing is a separate step the user (or another skill) initiates
with the registry CLI.

## See also

- [AIP-4 — DESIGN.md spec](/docs/aip-4)
- [AIP-5 — CANVAKIT.md](/docs/aip-5) — component-library sibling
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference DESIGN.md kits (minimal,
  full-with-motion, dark-variant, brand, composition)
- [`./DESIGN.schema.json`](./DESIGN.schema.json) — frontmatter validator
