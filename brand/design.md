# agentproto — design system

Locked 2026-08-07 (mark/wordmark/lockup/cli — see `README.md`). This doc adds
color tokens and typography on top of that.

## Color

| Token      | Hex       | Use                                  |
| ---------- | --------- | ------------------------------------- |
| `ink`      | `#1b1b1c` | Primary text, dark-mode background   |
| `paper`    | `#f4f0e6` | Light-mode background, dark-mode text |
| `phosphor` | `#2f9e63` | Accent — cursor block, CTAs, links    |

## Typography

**Locked 2026-08-07 — all-mono, IBM Plex Mono.** One typeface, everywhere:
logotype, headings, body, UI copy, code.

```css
font-family: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', monospace;
```

Embed via Google Fonts (`family=IBM+Plex+Mono:wght@400;600;700`) — falls
back to the system mono stack if the fetch fails, so nothing breaks offline.
Weight 700 for titles, 400 for body, 600/-0.5 letter-spacing for the
wordmark specifically (see `README.md`). Deliberate: "the word is the
command" extends past the logo to the whole product voice — docs, VSCode
extension UI, and marketing titles all read as CLI-native, not borrowed
from a generic product-sans.

**Why Plex over the system stack or JetBrains Mono**: narrower and more
geometric/neutral than JetBrains — reads as an infra tool, not an editor
skin. Pairs cleanly with IBM Plex Sans/Serif later if a non-mono context
ever needs one (docs prose at very long lengths, say) without breaking the
family relationship. See `type-mono-options.html` for the four-way
comparison (system baseline, JetBrains Mono, Plex, Space Mono) that settled
it, and `type-exploration.html` for the earlier all-mono vs. mono+sans vs.
mono+serif round that settled the "one voice everywhere" direction first.

Rejected: mono-chrome + system sans (too close to generic dev-tool docs),
mono-chrome + serif display (more editorial but broke the "it's all one
voice" logic), JetBrains Mono (safe but slightly "default choice" at this
point — everyone's dev-tool uses it), Space Mono (too much personality for
dense body copy).

**Follow-up, not yet done**: `wordmark.svg` / `lockup.svg` still draft their
text in the generic system-mono stack, not Plex specifically — update
before converting to outlines for the final ship artifact.
