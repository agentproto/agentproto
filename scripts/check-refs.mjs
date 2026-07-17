#!/usr/bin/env node
/**
 * Validate every `ws://` reference in the specs against AIP-27
 * §Reference syntax's collection→kind table.
 *
 * The spec is the fixture: the table is parsed out of aip-27.mdx, so the
 * check can never drift from what the spec says. A `ws://` collection with
 * no row is either a spec gap or a typo — both are failures.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.argv[2] ?? "."
const AIP27 = join(ROOT, "specs/aip-27.mdx")

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === ".git" || e === "node_modules") continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(mdx?|json)$/.test(e)) out.push(p)
  }
  return out
}

// --- parse the normative table out of the spec itself ---
const spec = readFileSync(AIP27, "utf8")
const section = spec.split("### Reference syntax")[1]
if (!section) {
  console.error("FAIL: aip-27.mdx has no '### Reference syntax' section")
  process.exit(1)
}
const table = new Map()
for (const m of section.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*`([a-z_]+)`\s*\|/gm)) {
  table.set(m[1], m[2])
}
if (table.size === 0) {
  console.error("FAIL: could not parse the collection→kind table")
  process.exit(1)
}

/**
 * Extract the collection segment(s) from one `ws://…` occurrence.
 * Three real shapes in this corpus, and conflating them is how the
 * first cut of this script reported the spec as broken when it wasn't:
 *   1. plain          ws://operators/<slug>          -> [operators]
 *   2. schema regex   ws://(operators|skills)/…      -> [operators, skills]
 *   3. bare prose     "a ws:// ref"                  -> []  (names nothing)
 * Meta-placeholders (`ws://<namespace>/…`) are prose too.
 */
// NO trim: a space directly after `ws://` means the occurrence is prose
// ("a ws:// ref", "ws:// to"), not a reference. Trimming here silently
// turns every such sentence into a bogus collection.
const firstSegment = (s) => {
  const m = s.match(/^([a-z][a-z0-9_-]*)/)
  return m ? m[1] : null
}

function collectionsAt(rest) {
  // Alternation branches may themselves carry a multi-segment body
  // (`assemblies/<slug>` inside `ws://(operators|assemblies/<slug>)/…`),
  // so reduce every branch to its leading segment — the collection.
  // Branches MAY be spaced (`a | b`), so trim per-branch, never up front.
  const alt = rest.match(/^\(([^)]+)\)/)
  if (alt) return alt[1].split("|").map((b) => firstSegment(b.trim())).filter(Boolean)
  const one = firstSegment(rest)
  return one ? [one] : [] // else: prose, placeholder, or wildcard
}

const hits = new Map() // collection -> [file:line]
let total = 0
let prose = 0
for (const f of walk(ROOT)) {
  const lines = readFileSync(f, "utf8").split("\n")
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/ws:\/\/(.*)$/gm)) {
      total++
      const cols = collectionsAt(m[1])
      if (cols.length === 0) { prose++; continue }
      for (const c of cols) {
        if (!hits.has(c)) hits.set(c, [])
        hits.get(c).push(`${relative(ROOT, f)}:${i + 1}`)
      }
    }
  })
}

const unknown = [...hits.entries()].filter(([c]) => !table.has(c))
const covered = [...hits.keys()].filter((c) => table.has(c))
const unused = [...table.keys()].filter((c) => !hits.has(c))

console.log(`ws:// occurrences scanned : ${total}`)
console.log(`  naming a collection     : ${total - prose}`)
console.log(`  prose / placeholder     : ${prose}`)
console.log(`table rows (aip-27)       : ${table.size}`)
console.log(`collections in use        : ${hits.size}`)
console.log(`  covered by table        : ${covered.length}`)
console.log(`  NOT in table            : ${unknown.length}`)
if (unused.length) console.log(`table rows never used     : ${unused.join(", ")}`)

if (unknown.length) {
  console.log("\nFAIL — ws:// collections with no row in AIP-27 §Reference syntax:")
  for (const [coll, where] of unknown) {
    console.log(`  ws://${coll}/  (${where.length}x)  e.g. ${where[0]}`)
  }
  process.exit(1)
}
console.log("\nOK — every ws:// collection in use has a row in the table.")
