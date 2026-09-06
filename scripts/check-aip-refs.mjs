#!/usr/bin/env node
/**
 * Validate the cross-references the AIP family runs on:
 *
 *   1. `requires:` frontmatter — every listed number resolves to a spec file.
 *   2. Inline `/docs/aip-<n>` links — same existence rule.
 *   3. Citing a `Superseded`/`Withdrawn` AIP — warning, not failure, unless
 *      the citing line (or the line right after) names the superseding AIP,
 *      or the citing spec IS the superseding one: historical notes
 *      legitimately cite AIP-27 by way of AIP-54.
 *   4. `ref-impl:` frontmatter pointing at the ts tree — existence only:
 *      `<path>` must exist in the sibling checkout at `../ts/<path>`.
 *   5. `package:` frontmatter — resolved by NAME, not by path guess: the ts
 *      monorepo nests workspaces (`packages/driver/cli`,
 *      `packages/governance/core`), so `@agentproto/driver-cli` does not
 *      live at `packages/driver-cli`; the name must match some
 *      `package.json` `name` under the ts workspace.
 *
 * Rules 4–5 resolve against a sibling checkout of agentproto/ts, found via
 * the repo root passed as process.argv[2]. If `../ts` does not exist the
 * rules are SKIPPED, never failed: CI checks out this repo alone and has no
 * `ts` alongside. Say so in the summary either way.
 *
 * Out of scope: prose that links a real document whose contents do not
 * deliver what the link text promises (e.g. "AIP-2 — define-doctype
 * factory" where AIP-2 never mentions doctype). This checks that
 * references resolve to existing specs, not that the referenced spec
 * delivers; fixing the prose is a spec edit, reviewable on its own.
 *
 * House style follows scripts/check-refs.mjs: plain Node ESM, no deps,
 * counted summary, exit 1 on failure with `file:line` for each.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.argv[2] ?? "."
const SPEC_DIR = join(ROOT, "specs")
const TS_SIBLING = join(ROOT, "..", "ts")

// The ts checkout is optional by design: CI has none, so rules 4–5 skip
// rather than fail on a missing sibling checkout.
const tsAvailable = existsSync(TS_SIBLING) && statSync(TS_SIBLING).isDirectory()

// Sorted by number so diagnostics come out in a stable order regardless of
// readdir order.
const specs = readdirSync(SPEC_DIR)
  .filter((e) => /^aip-\d+\.mdx$/.test(e))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))

const specPath = (n) => join(SPEC_DIR, `aip-${n}.mdx`)

/**
 * Split a spec into frontmatter lines and body lines, tracking absolute
 * line numbers — every diagnostic below must cite the true file line.
 *
 * allLines[0] is the opening `---`; the closing fence is the next bare
 * `---` line (frontmatter values are never a bare `---`, so the first
 * match is the fence). fmLines[i] sits at file line fmBase + i; bodyLines[j]
 * at bodyBase + j. A file with no frontmatter is all body from line 1.
 * Slicing the body out of the same array as the frontmatter (instead of
 * slicing the raw string) is what keeps these two offsets from drifting
 * apart — the first cut of this script reported links two lines below
 * where they actually sit.
 */
function splitSpec(text) {
  const allLines = text.split("\n")
  const closeIdx = allLines[0] === "---" ? allLines.indexOf("---", 1) : -1
  if (closeIdx === -1) {
    return { fmLines: [], bodyLines: allLines, fmBase: 0, bodyBase: 1 }
  }
  return {
    fmLines: allLines.slice(1, closeIdx),
    bodyLines: allLines.slice(closeIdx + 1),
    fmBase: 2,
    bodyBase: closeIdx + 2,
  }
}

// Scalar value for one frontmatter key, with its absolute file line so
// diagnostics can cite `file:line` directly.
function fmScalar(fmLines, fmBase, key) {
  for (let i = 0; i < fmLines.length; i++) {
    const m = fmLines[i].match(new RegExp(`^${key}:\\s*(.*)$`))
    if (m) return { line: fmBase + i, value: m[1].trim() }
  }
  return null
}

// Block-style frontmatter list (`key:` then `  - item` lines). Every
// current spec uses the inline `[1, 2]` form, but this is cheap.
function fmList(fmLines, fmBase, key) {
  const out = []
  for (let i = 0; i < fmLines.length; i++) {
    if (!new RegExp(`^${key}:\\s*$`).test(fmLines[i])) continue
    for (let j = i + 1; j < fmLines.length; j++) {
      const m = fmLines[j].match(/^\s+-\s+(.*)$/)
      if (!m) break
      out.push({ line: fmBase + j, value: m[1].trim().replace(/^["']|["']$/g, "") })
    }
  }
  return out
}

/**
 * Index every `package.json` `name` under the ts workspace, for rule 5.
 * Resolving by name rather than guessing `packages/<suffix>` is the point:
 * `@agentproto/driver-cli` lives at `packages/driver/cli`, and the literal
 * guess false-positives on all five driver specs.
 */
function indexTsPackageNames() {
  const names = new Map()
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".git" || e === "dist") continue
      const p = join(dir, e)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p)
      else if (e === "package.json") {
        try {
          const name = JSON.parse(readFileSync(p, "utf8")).name
          if (typeof name === "string" && name) names.set(name, p)
        } catch {
          // An unreadable package.json elsewhere in ts is not a spec problem.
        }
      }
    }
  }
  walk(TS_SIBLING)
  return names
}
const tsPackages = tsAvailable ? indexTsPackageNames() : new Map()

// --- pass 0: statuses, so rule 3 knows who superseded whom ---
const status = new Map()
const supersededBy = new Map()
for (const f of specs) {
  const n = Number(f.match(/\d+/)[0])
  const text = readFileSync(specPath(n), "utf8")
  const { fmLines, fmBase, bodyLines } = splitSpec(text)
  const st = fmScalar(fmLines, fmBase, "status")
  if (st) status.set(n, st.value)
  // No `superseded-by:` frontmatter key exists in this corpus; the
  // deprecation notice names the heir in prose instead — "superseded by
  // [AIP-54](/docs/aip-54)". The `\D{0,40}` window spans the newline and
  // the markdown around the link without reaching an unrelated number.
  const heir = bodyLines.join("\n").match(/superseded\s+by\D{0,40}?AIP-(\d+)/i)
  if (heir) supersededBy.set(n, Number(heir[1]))
}

// A citation to a Superseded AIP is excused when the citing line — or the
// line immediately after — names the superseding AIP, or when the citing
// spec IS the superseding one (its every line is about the succession).
const namesAip = (line, n) => new RegExp(`AIP-${n}(?![0-9])`).test(line)

// --- pass 1: per-file checks ---
const missing = [] // {where, what} — hard failures
const brokenTargets = [] // {where, what} — rules 4/5, only when ../ts exists
const warnings = [] // {where, what} — rule 3, never fatal
let reqChecked = 0
let linkChecked = 0
let refImplChecked = 0
let pkgChecked = 0

for (const f of specs) {
  const self = Number(f.match(/\d+/)[0])
  const rel = `specs/${f}`
  const text = readFileSync(specPath(self), "utf8")
  const { fmLines, bodyLines, fmBase, bodyBase } = splitSpec(text)

  // Rule 1 — requires: frontmatter. Only the frontmatter block is trusted:
  // bodies reuse the same key at column 0 inside fenced examples (AIP-14
  // §tool manifest, AIP-39), and scanning those would report sample
  // documents as broken specs.
  const req = []
  const inline = fmScalar(fmLines, fmBase, "requires")
  for (const num of inline?.value.match(/\d+/g) ?? []) {
    req.push({ line: inline.line, n: Number(num) })
  }
  for (const item of fmList(fmLines, fmBase, "requires")) {
    for (const num of item.value.match(/\d+/g) ?? []) {
      req.push({ line: item.line, n: Number(num) })
    }
  }
  for (const { line, n } of req) {
    reqChecked++
    if (!existsSync(specPath(n))) {
      missing.push({ where: `${rel}:${line}`, what: `requires AIP-${n}, no specs/aip-${n}.mdx` })
    }
  }

  // Rule 2 — inline /docs/aip-<n> links in the body only (frontmatter
  // never carries them; scanning it would double-count `requires:`).
  // Self-links are exempt: a spec citing itself is a table-of-contents
  // habit, not a cross-reference.
  bodyLines.forEach((line, i) => {
    const fileLine = bodyBase + i
    for (const m of line.matchAll(/\/docs\/aip-(\d+)(?![0-9])/g)) {
      const n = Number(m[1])
      if (n === self) continue
      linkChecked++
      if (!existsSync(specPath(n))) {
        missing.push({ where: `${rel}:${fileLine}`, what: `links /docs/aip-${n}, no specs/aip-${n}.mdx` })
        continue
      }
      // Rule 3 — superseded/withdrawn citation warning.
      const st = status.get(n)
      if (st === "Superseded" || st === "Withdrawn") {
        const heir = supersededBy.get(n)
        const nextLine = bodyLines[i + 1] ?? ""
        const excused =
          heir != null && (heir === self || namesAip(line, heir) || namesAip(nextLine, heir))
        if (!excused) {
          warnings.push({
            where: `${rel}:${fileLine}`,
            what: `cites AIP-${n} (${st}${heir ? `, superseded by AIP-${heir}` : ""}) without naming the heir`,
          })
        }
      }
    }
  })

  // Rules 4–5 — ref-impl / package, resolved against the sibling ts
  // checkout. Skipped entirely when ../ts is absent: a missing sibling is
  // a property of the environment, never a spec failure.
  if (tsAvailable) {
    const refImpl = fmScalar(fmLines, fmBase, "ref-impl")
    if (refImpl) {
      const m = refImpl.value.match(/^https:\/\/github\.com\/agentproto\/ts\/tree\/main\/(.+)$/)
      if (m) {
        refImplChecked++
        // Existence only — where in ts the code lives, what it is named,
        // and whether it is the "right" tree are not knowable from here.
        if (!existsSync(join(TS_SIBLING, m[1]))) {
          brokenTargets.push({
            where: `${rel}:${refImpl.line}`,
            what: `ref-impl '${m[1]}' does not exist in ../ts`,
          })
        }
      }
      // Other shapes (a /docs/ deep-link, a `<repo URL>` placeholder, a
      // foreign repo) are not this rule's concern.
    }
    const pkg = fmScalar(fmLines, fmBase, "package")
    if (pkg) {
      const name = pkg.value.replace(/^"(.*)"$/, "$1")
      // Only scoped agentproto names are checked; `package: string` and
      // third-party names in template specs are not this rule's concern.
      if (name.startsWith("@agentproto/")) {
        pkgChecked++
        if (!tsPackages.has(name)) {
          brokenTargets.push({
            where: `${rel}:${pkg.line}`,
            what: `package ${name} does not resolve to any package in ../ts`,
          })
        }
      }
    }
  }
}

// --- summary ---
console.log(`specs scanned              : ${specs.length}`)
console.log(`requires: entries checked  : ${reqChecked}`)
console.log(`/docs/aip-<n> links checked: ${linkChecked}`)
console.log(`unresolved requires/links  : ${missing.length}`)
if (tsAvailable) {
  console.log(`ref-impl targets checked   : ${refImplChecked} (existence, against ../ts)`)
  console.log(`package names checked      : ${pkgChecked} (by name, against ../ts)`)
} else {
  console.log(`ref-impl/package targets   : SKIPPED (no sibling checkout at ../ts)`)
}
console.log(`supersession warnings      : ${warnings.length}`)
for (const w of warnings) console.log(`  WARN ${w.where} — ${w.what}`)

if (missing.length || brokenTargets.length) {
  console.log("\nFAIL — broken AIP references:")
  for (const x of missing) console.log(`  ${x.where} — ${x.what}`)
  for (const x of brokenTargets) console.log(`  ${x.where} — ${x.what}`)
  process.exit(1)
}
console.log("\nOK — every AIP reference resolves.")
