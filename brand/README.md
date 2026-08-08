# agentproto brand kit

Locked 2026-08-07. Source of truth for the agentproto mark, wordmark, lockup,
and CLI icon — every package (vscode extension, desktop app, docs, npm
README) should derive its own icon sizes/formats from these SVGs rather than
regenerating art.

- **Color**: phosphor green `#2f9e63`
- **Files**: `mark`, `wordmark`, `lockup`, `cli` — each with a light (default)
  and `-dark` variant for dark backgrounds.
- **Preview**: open `index.html` (overview) or `size-variations.html` (scale
  tests) in a browser.

## App icons (filled tiles)

Self-contained rounded-tile icons of the CLI glyph, one per field — all
tri-color (tile · chevron · cursor). The cursor stays **phosphor** on
light/dark (the brand signature); on the phosphor tile it inverts to paper
(white) since phosphor-on-phosphor would vanish.

| File            | Tile        | Chevron      | Cursor           | Use                       |
| --------------- | ----------- | ------------ | ---------------- | ------------------------- |
| `icon-light`    | paper `#f5f6f3` (hairline border) | ink `#1b1b1c` | phosphor `#2f9e63` | app icon on light UIs |
| `icon-dark`     | ink `#1b1b1c`  | paper `#f4f0e6` | phosphor `#2f9e63` | **primary** app / marketplace / apple-touch |
| `icon-green`    | phosphor `#2f9e63` | ink `#1b1b1c` | paper `#f4f0e6` (white) | brand-color tile; web favicon |

PNGs export at `@4x` (256) and `@16x` (1024), same as `cli`/`mark`. The VS Code
marketplace icon (`ts/packages/vscode/media/icon.png`) is `icon-dark@4x`; the
activity-bar glyph is `activitybar.svg` (monochrome, `currentColor`).

## Favicons (`favicon/{light,dark,green}/`)

One complete set per field, so you can match the host page. Each folder has:

```
favicon.svg              vector (modern browsers)
favicon.ico              multi-size 16 / 32 / 48
favicon-16x16 / 32 / 48  png
apple-touch-icon.png     180  (iOS home screen)
```

The **green** set is wired into the site (`projects/agentproto/site/src/app/`
→ `icon.svg`, `favicon.ico`, `apple-icon.png`, Next.js app-router conventions)
because green is the only field visible on **both** light and dark browser
chrome. Swap the site to `favicon/dark` or `favicon/light` if the surrounding
chrome is fixed.

Full exploration/generation history (Recraft-v3, gpt-image-1, Ideogram-v3
candidates, `run.py`/`build-sheet.py`) lives in
`output/agentproto-logo/` at the studio repo root — untracked build
artifacts, kept for reference only. This `brand/` folder is the committed,
canonical output.
