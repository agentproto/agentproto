# EXAMPLES.md — DESIGN.md reference patterns

Reference `DESIGN.md` files exemplifying common patterns. Each example is a
self-contained kit a host could load as-is. Authors should copy the closest
pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Minimal kit — colors + type only](#example-1--minimal-kit)
2. [Full kit with motion](#example-2--full-kit-with-motion)
3. [Dark-variant kit](#example-3--dark-variant-kit)
4. [Brand kit (private)](#example-4--brand-kit-private)
5. [Composed kit (extends another)](#example-5--composed-kit)
6. [Custom-namespace kit](#example-6--custom-namespace-kit)

---

## Example 1 — Minimal kit

The smallest valid kit. Two color tokens, one type pair, the required registry
metadata. Useful as a scaffold or for documentation-only surfaces where motion
and shadow don't matter.

```md
---
schema: designkit/v1
kit: paper-light
title: Paper Light
description:
  A minimal light kit. Off-white canvas, near-black ink, one warm primary. For
  text-first surfaces.
version: 1.0.0
author: Studio
license: MIT
mode: light
tags: [minimal, editorial, light, text]
colors:
  background: "#FAFAF7"
  ink: "#1A1A1A"
  primary: "#B23A1F"
typography:
  body:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1rem"
    weight: 400
    lineHeight: 1.6
  h1:
    family: "'Fraunces', 'Georgia', serif"
    size: "3rem"
    weight: 600
    lineHeight: 1.1
---

## Overview

A deliberately minimal kit for text-heavy surfaces — README pages, internal
docs, simple landing pages. Off-white background eases the eye over long reads;
the warm ochre primary anchors the single CTA without competing with body type.

## Usage

Reach for Paper Light when the page is mostly prose and you need _one_ visual
anchor. Don't use it for product UI — there are too few tokens to theme buttons,
badges, panels.
```

**When to use.** Documentation surfaces, scaffold-stage kits, or when the user
only has two or three colors locked in. Upgrade to a full kit (Example 2) once
the surface needs cards, shadows, or motion.

---

## Example 2 — Full kit with motion

A complete kit shipping every recommended token group: colors, typography,
spacing, radius, shadows, motion. This is the shape most product surfaces want.

```md
---
schema: designkit/v1
kit: modern-minimal
title: Modern Minimal
description:
  A clean light kit with a teal primary and short-duration motion. Good baseline
  for SaaS surfaces.
version: 1.2.0
author: Studio
license: MIT
homepage: https://designkit.sh/kits/modern-minimal
preview: https://designkit.sh/previews/modern-minimal.png
mode: light
tags: [minimal, saas, light, clinical]
colors:
  background: "#FFFFFF"
  surface: "#F7F8FA"
  ink: "#0F172A"
  ink-muted: "rgba(15, 23, 42, 0.62)"
  primary: "#0E7C7B"
  on-primary: "#FFFFFF"
  accent: "#14B8A6"
  muted: "#E2E8F0"
  muted-foreground: "rgba(15, 23, 42, 0.5)"
  border: "rgba(15, 23, 42, 0.08)"
  link: "{colors.primary}"
typography:
  body:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1rem"
    weight: 400
    lineHeight: 1.6
  h1:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "3.5rem"
    weight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  h2:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "2.25rem"
    weight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h3:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1.5rem"
    weight: 600
    lineHeight: 1.3
  code:
    family: "'JetBrains Mono', ui-monospace, monospace"
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
  sm: "0 1px 2px rgba(15, 23, 42, 0.06)"
  md: "0 4px 16px rgba(15, 23, 42, 0.08)"
  lg: "0 12px 40px rgba(15, 23, 42, 0.12)"
motion:
  duration:
    fast: "120ms"
    base: "200ms"
    slow: "320ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
    enter: "cubic-bezier(0, 0, 0, 1)"
    exit: "cubic-bezier(0.4, 0, 1, 1)"
---

## Overview

Clean, restrained, single-typeface. Modern Minimal is the kit you reach for when
the product is the work — when the UI should recede. Teal primary keeps it warm;
the motion scale stays under 320ms so transitions read as immediate.

## Usage

Default kit for new SaaS surfaces. If the brand has a strong display identity
(custom serif, oversize hero), fork this kit and swap the typography block.
```

**When to use.** Default starting point for product UIs, dashboards, SaaS
landing pages. Fork rather than draft from scratch when the brand has any modest
deviation.

---

## Example 3 — Dark-variant kit

Ships both light and dark with `variants` deltas. The base is light; the dark
block carries only the tokens that change.

```md
---
schema: designkit/v1
kit: studio
title: Studio
description:
  Editorial kit shipping light and dark, with a slate canvas, electric indigo
  primary, and a serif/sans pairing.
version: 2.0.0
author: Studio
license: MIT
preview: https://designkit.sh/previews/studio.png
mode: both
tags: [editorial, premium, both, indigo]
colors:
  background: "#FFFFFF"
  surface: "#F7F7F8"
  ink: "#0E0F12"
  ink-muted: "rgba(14, 15, 18, 0.6)"
  primary: "#4F46E5"
  on-primary: "#FFFFFF"
  accent: "#818CF8"
  border: "rgba(14, 15, 18, 0.08)"
  link: "{colors.primary}"
typography:
  body:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1rem"
    weight: 400
    lineHeight: 1.65
  h1:
    family: "'Fraunces', 'Georgia', serif"
    size: "4rem"
    weight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  h2:
    family: "'Fraunces', 'Georgia', serif"
    size: "2.5rem"
    weight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h3:
    family: "'Inter', ui-sans-serif, system-ui, sans-serif"
    size: "1.5rem"
    weight: 600
    lineHeight: 1.3
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
variants:
  dark:
    colors:
      background: "#0E0F12"
      surface: "#16181D"
      ink: "#F4F4F5"
      ink-muted: "rgba(244, 244, 245, 0.6)"
      primary: "#6366F1"
      accent: "#A5B4FC"
      border: "rgba(255, 255, 255, 0.08)"
---

## Overview

Studio is the editorial workhorse: serif display, sans body, indigo brand. Light
reads as bright and considered; dark reads as the same surface at a different
time of day. The dark variant only overrides what must change to clear contrast
— typography, spacing, radii are inherited.

## Usage

Marketing, blog, longform. Pick light by default; let users opt into dark via OS
preference. The host's variant resolver handles the swap.
```

**When to use.** Any surface that ships an explicit dark mode and wants both
palettes to feel like one kit, not two.

---

## Example 4 — Brand kit (private)

Internal brand kit, not published to the public registry. License is
`proprietary`; tags and preview reflect that this is a closed design system.

```md
---
schema: designkit/v1
kit: acme-brand-2026
title: Acme Brand 2026
description:
  Acme Inc.'s 2026 corporate brand kit. Internal use only. Approved by brand
  council 2026-04-12.
version: 1.0.0
author: Acme Brand Council
license: proprietary
homepage: https://brand.internal.acme/2026
mode: light
tags: [brand, corporate, private, acme]
colors:
  background: "#FFFFFF"
  surface: "#F4F1EC"
  ink: "#1B1A18"
  ink-muted: "rgba(27, 26, 24, 0.65)"
  primary: "#8B1A1A"
  on-primary: "#FFFFFF"
  accent: "#C58B3F"
  muted: "#D9D3CB"
  muted-foreground: "rgba(27, 26, 24, 0.55)"
  border: "rgba(27, 26, 24, 0.1)"
typography:
  body:
    family: "'Acme Sans', 'Inter', ui-sans-serif, sans-serif"
    size: "1rem"
    weight: 400
    lineHeight: 1.55
  h1:
    family: "'Acme Display', 'Fraunces', 'Georgia', serif"
    size: "3.75rem"
    weight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  h2:
    family: "'Acme Display', 'Fraunces', 'Georgia', serif"
    size: "2.25rem"
    weight: 700
    lineHeight: 1.15
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "3rem"
  xl: "5rem"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
metadata:
  acme:
    approvalRef: "BC-2026-04-12-007"
    contactEmail: "brand@internal.acme"
    distribution: "internal-only"
---

## Overview

The 2026 Acme corporate kit. Oxblood primary, gilded accent, low radius —
restrained, formal, on-brand. The kit is locked to the 2026 brand-council
approval; do not derive from this kit externally.

## Usage

Corporate site, investor relations, all customer-facing print and digital.
Internal tools may inherit the palette but SHOULD use the softer
`acme-internal-2026` kit (separate file) for screen comfort.
```

**When to use.** Brand kits that should never appear in the public registry. The
`metadata.<host>` namespace carries the governance/distribution metadata that
internal tooling depends on.

---

## Example 5 — Composed kit

A kit that extends another via `based-on`. Only overrides what changes from the
parent. Composition depth is limited to 3 by the adapter contract.

```md
---
schema: designkit/v1
kit: modern-minimal-teal-night
title: Modern Minimal — Teal Night
description:
  Modern Minimal forked into a single dark variant with a deeper teal primary.
  Inherits spacing, type, and motion from the parent.
version: 1.0.0
author: Community
license: MIT
preview: https://designkit.sh/previews/modern-minimal-teal-night.png
based-on: https://designkit.sh/kits/modern-minimal@1.2.0
mode: dark
tags: [dark, teal, fork, minimal]
colors:
  background: "#0A1518"
  surface: "#0F1E22"
  ink: "#E6F0F0"
  ink-muted: "rgba(230, 240, 240, 0.6)"
  primary: "#0E9E9C"
  on-primary: "#FFFFFF"
  accent: "#22D3CE"
  muted: "#1B2D31"
  muted-foreground: "rgba(230, 240, 240, 0.5)"
  border: "rgba(255, 255, 255, 0.06)"
  link: "{colors.accent}"
shadows:
  sm: "0 1px 2px rgba(0, 0, 0, 0.4)"
  md: "0 4px 16px rgba(0, 0, 0, 0.45)"
  lg: "0 12px 40px rgba(0, 0, 0, 0.55)"
---

## Overview

A dark companion to Modern Minimal, leaning a step deeper into the teal family.
Type, spacing, radius, and motion are inherited from the parent — only color and
shadow change. The kit will track parent updates that don't touch those groups.

## Composition

Inherits from `modern-minimal@1.2.0`. The host's resolver loads the parent
first, then layers this kit on top. Bumping the parent's shadow scale (a
non-color change) would propagate here automatically; bumping the parent's
primary would not — colors are fully overridden.

## Usage

Reach for this when you've adopted Modern Minimal and want a dark companion
without re-authoring all four token groups.
```

**When to use.** Forks of well-known parent kits (a recolor, a single-variant
fork, a brand-scoped lockup). Composition keeps the fork small and lets it
inherit non-overridden updates.

---

## Example 6 — Custom-namespace kit

A kit shipping host-namespaced metadata for a specific runtime. Other hosts
ignore the `metadata.<host>` block; the target host reads it for adapter-level
features (CSS variable prefixes, Tailwind plugin hints, asset pinning).

```md
---
schema: designkit/v1
kit: brutalist-mono
title: Brutalist Mono
description:
  A monospace-only kit with a high-contrast palette and chunky shadow cues.
  Ships hints for the canvakit Tailwind adapter.
version: 1.0.0
author: Studio
license: MIT
preview: https://designkit.sh/previews/brutalist-mono.png
mode: light
tags: [brutalist, mono, high-contrast, light]
colors:
  background: "#FAFAFA"
  surface: "#FFFFFF"
  ink: "#000000"
  ink-muted: "rgba(0, 0, 0, 0.65)"
  primary: "#FF3D00"
  on-primary: "#FFFFFF"
  accent: "#0033FF"
  muted: "#E5E5E5"
  border: "#000000"
typography:
  body:
    family: "'JetBrains Mono', ui-monospace, 'Courier New', monospace"
    size: "0.95rem"
    weight: 400
    lineHeight: 1.55
  h1:
    family: "'JetBrains Mono', ui-monospace, 'Courier New', monospace"
    size: "3rem"
    weight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  h2:
    family: "'JetBrains Mono', ui-monospace, 'Courier New', monospace"
    size: "2rem"
    weight: 700
    lineHeight: 1.15
  code:
    family: "'JetBrains Mono', ui-monospace, monospace"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "3rem"
  xl: "5rem"
rounded:
  sm: "0px"
  md: "0px"
  lg: "0px"
  xl: "0px"
  full: "9999px"
shadows:
  sm: "2px 2px 0 #000000"
  md: "4px 4px 0 #000000"
  lg: "8px 8px 0 #000000"
metadata:
  canvakit:
    cssVarPrefix: "bm"
    tailwindPlugin: "@canvakit/tailwind-brutalist"
    pinAssets:
      - "https://fonts.cdnjs.com/jetbrains-mono/2.304/JetBrainsMono.woff2"
---

## Overview

Brutalist Mono leans into a single typeface and hard-edged shadow language: 0px
radius everywhere, drop-shadows that read as ink-on- paper rather than soft
glass. Useful for indie-zine surfaces, hacker-news-adjacent reading apps,
demoscenes.

## Usage

Don't use Brutalist Mono for forms-heavy interfaces — the lack of radius and the
chunky shadows make dense forms read as cluttered. It's a kit for prose,
articles, and single-purpose CTAs.
```

**When to use.** Kits that need to declare host-specific knobs (asset pinning,
CSS variable prefixes, paired Tailwind plugins). The `metadata.<host>` namespace
is the canonical extension point — other hosts MUST tolerate it without
erroring.

---

## Anti-patterns to avoid

- **Missing required tokens.** `colors.background`, `colors.ink`,
  `colors.primary`, `typography.body`, `typography.h1` are required. The schema
  rejects kits missing any of them.
- **`mode: both` without `variants`.** The schema requires the pairing. If you
  only ship one palette, declare `mode: light` or `mode: dark`, not both.
- **Cyclic references.** `link: "{colors.accent}"` and `accent: "{colors.link}"`
  is a cycle. The adapter rejects.
- **Wide-open `metadata` polluting top-level.** Host-specific knobs go under
  `metadata.<host>`, not at the frontmatter root. Other hosts MUST tolerate
  `metadata` keys; they're allowed to error on unknown root keys.
- **Pinning a font CDN URL inside `family`.** Use the system fallback chain
  inside `family` and pin the asset via `metadata.<host>.pinAssets` (Example 6).
  `family` should always degrade to a system stack.
- **Color literals without alpha clarity.** Prefer `rgba(...)` or `#RRGGBBAA`
  over short hex when you mean translucency. Short hex reads as opaque to many
  parsers.
- **Forgetting to bump `version` on token changes.** The registry treats
  `<author>/<slug>@<version>` as immutable. Editing tokens without bumping ships
  a divergent kit under a stale version.

## See also

- [AIP-4 — DESIGN.md spec](/docs/aip-4)
- [`./SKILL.md`](./SKILL.md) — kit-author skill
- [`./ADAPTER.md`](./ADAPTER.md) — implementer's guide for hosts
- [`./DESIGN.schema.json`](./DESIGN.schema.json) — frontmatter validator
