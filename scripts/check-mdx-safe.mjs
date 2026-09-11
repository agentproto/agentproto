#!/usr/bin/env node
/**
 * Guard the specs against markdown that MDX rejects.
 *
 * `specs/*.mdx` is not just read on GitHub — agentproto.sh mirrors it
 * (site/scripts/sync-content.mjs copies it verbatim into content/docs/)
 * and compiles every file with fumadocs-mdx. MDX is stricter than
 * CommonMark about `<`: anything after it is a JSX tag, so two habits
 * that are perfectly fine in .md are hard parse errors in .mdx.
 *
 * Both have bitten us. A single `<https://…>` autolink in aip-49.mdx
 * broke the site's production build for five weeks — the site repo is a
 * different repo with a different CI, so nothing here went red and
 * nothing pointed at the spec that caused it. This check closes that
 * loop: the breakage is now caught in the repo that owns the content.
 *
 * Scope: only the files the site actually compiles — `specs/*.mdx`.
 * `specs/resources/**` is excluded by the site's own glob (raw spec
 * artifacts, served from GitHub, never MDX-parsed), so it is excluded
 * here too.
 *
 * Deliberately narrow: this is not an MDX parser, it is a check for the
 * two constructs that a markdown author reaches for by reflex. Anything
 * subtler is caught downstream by the site build.
 *
 *   node scripts/check-mdx-safe.mjs [root]
 */
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.argv[2] ?? "."
const SPECS = join(ROOT, "specs")

// `<!-- … -->` — MDX has no HTML comments; the MDX form is `{/* … *\/}`.
const HTML_COMMENT = {
  re: /<!--/,
  what: "HTML comment",
  fix: "use an MDX comment: {/* … */}",
}

/**
 * `<https://…>` / `<mailto:…>` — a CommonMark autolink. MDX reads the
 * `<` as a JSX tag open and dies on the `/` in `https://`. GFM already
 * linkifies a bare URL, so the angle brackets buy nothing.
 */
const AUTOLINK = {
  re: /<[a-zA-Z][a-zA-Z0-9+.-]*:\/*[^\s<>]*>/,
  what: "autolink",
  fix: "drop the angle brackets (GFM linkifies bare URLs) or write [text](url)",
}

const RULES = [HTML_COMMENT, AUTOLINK]

/**
 * Blank out what MDX would not parse as prose — fenced code blocks and
 * inline code spans — so a documented `<!-- … -->` in an example does
 * not read as a real one. Lines are preserved so numbers stay true.
 */
function stripCode(source) {
  const lines = source.split("\n")
  let fence = null
  return lines.map(line => {
    const open = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null
      return ""
    }
    if (open) {
      fence = open[1]
      return ""
    }
    return line.replace(/`[^`]*`/g, "")
  })
}

let failures = 0
for (const name of readdirSync(SPECS).sort()) {
  if (!name.endsWith(".mdx")) continue // resources/ and meta.json: not MDX-compiled
  const file = join(SPECS, name)
  const lines = stripCode(readFileSync(file, "utf8"))
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      const hit = line.match(rule.re)
      if (!hit) continue
      failures++
      const where = `${relative(ROOT, file)}:${i + 1}:${hit.index + 1}`
      console.error(
        `::error file=${relative(ROOT, file)},line=${i + 1}::${rule.what} \`${hit[0]}\` — MDX cannot parse this; ${rule.fix}`,
      )
      console.error(`  ${where}  ${line.trim()}`)
    }
  })
}

if (failures > 0) {
  console.error(
    `\n${failures} MDX-hostile construct(s). These build fine on GitHub but break agentproto.sh.`,
  )
  process.exit(1)
}
console.log("check-mdx-safe: every specs/*.mdx is MDX-parseable.")
