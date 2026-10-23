#!/usr/bin/env node
/**
 * Check every AIP against its canonical names in `specs/names.json`
 * (AIP-70 GLOSSARY, Naming rules).
 *
 * Per spec `specs/aip-<n>.mdx`, a DEVIATION is reported when:
 *
 *   title       the title is not `AIP-<n>: <NAME> (<specId>): <summary>`
 *               (or `AIP-<n>: <NAME>: <summary>` when the entry has no specId)
 *   superseded  frontmatter `status: Superseded` and `supersededBy` disagree
 *   package     frontmatter `package:` differs from the entry's `package`
 *   layer       frontmatter `layer:` differs from the entry's `layer`
 *   schema:<id>:<file>  a schema id whose name is neither `<specName>` nor
 *               `<specName>.<kind>` (one level), found as a JSON `"const"`
 *               or a `schema:` line in `specs/aip-<n>.mdx` or in any file
 *               under `specs/resources/aip-<n>/`; keyed by file so fixing
 *               one occurrence cannot hide another
 *
 * The check is a ratchet. `names.json` `pending` lists the deviations known
 * today. A deviation that is not pending FAILS (new drift), and a pending
 * entry that no longer deviates FAILS too (it was fixed: remove it, so it
 * cannot come back). `--write-pending` rewrites `pending` to the current
 * set; use it only to bootstrap or after a reviewed batch of renames.
 *
 * Registry errors always fail and cannot be made pending: a spec with no
 * entry, an entry with no spec, a duplicate active name or specId, an unknown
 * layer, and any entry whose own fields break the AIP-70 naming rules (name
 * format, specId, define, package, file or files).
 *
 * The GLOSSARY AIP must render every term and deprecated alias of
 * `glossary.json` as a table row (registry error otherwise).
 *
 * Deprecated vocabulary (`specs/resources/aip-70/draft/glossary.json`,
 * `deprecated[].pattern`) is reported as counts per spec. It never fails:
 * renaming prose is P1 work, reviewable on its own.
 *
 * House style follows scripts/check-refs.mjs: plain Node ESM, no deps,
 * counted summary, exit 1 on failure with `file:line` for each.
 */
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const args = process.argv.slice(2)
const WRITE = args.includes("--write-pending")
const ROOT = args.find((a) => !a.startsWith("--")) ?? "."
const SPEC_DIR = join(ROOT, "specs")
const NAMES = join(SPEC_DIR, "names.json")
const GLOSSARY = join(SPEC_DIR, "resources", "aip-70", "draft", "glossary.json")

const rel = (p) => relative(ROOT, p) || p
const registry = JSON.parse(readFileSync(NAMES, "utf8"))
const errors = []
const deviations = new Map() // id -> "file:line message"

const specs = readdirSync(SPEC_DIR)
  .filter((e) => /^aip-\d+\.mdx$/.test(e))
  .map((e) => Number(e.match(/\d+/)[0]))
  .sort((a, b) => a - b)

const byNumber = new Map()
for (const entry of registry.aips) {
  if (byNumber.has(entry.aip)) errors.push(`${rel(NAMES)}: aip ${entry.aip} is registered twice`)
  byNumber.set(entry.aip, entry)
}

// Registry-internal rules.
const activeNames = new Map()
const activeSpecIds = new Map()
for (const entry of registry.aips) {
  if (!registry.layers.includes(entry.layer)) {
    errors.push(`${rel(NAMES)}: aip ${entry.aip} has unknown layer "${entry.layer}"`)
  }
  for (const problem of shapeProblems(entry)) errors.push(`${rel(NAMES)}: aip ${entry.aip} ${problem}`)
  if (!specs.includes(entry.aip)) errors.push(`${rel(NAMES)}: aip ${entry.aip} has no specs/aip-${entry.aip}.mdx`)
  if (entry.supersededBy) continue
  for (const [key, map] of [["name", activeNames], ["specId", activeSpecIds]]) {
    const value = entry[key]
    if (!value) continue
    if (map.has(value)) {
      errors.push(`${rel(NAMES)}: ${key} "${value}" is used by active aips ${map.get(value)} and ${entry.aip}`)
    }
    map.set(value, entry.aip)
  }
}

function pascal(name) {
  return name
    .split("-")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join("")
}

// AIP-70 section 1, applied to the registry entry itself.
function shapeProblems(entry) {
  const out = []
  if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(entry.name ?? "")) out.push(`name "${entry.name}" is not UPPER-CASE-WORDS`)
  const lower = (entry.name ?? "").toLowerCase()
  if (entry.specId && !new RegExp(`^${lower}/v\\d+$`).test(entry.specId)) {
    out.push(`specId "${entry.specId}" is not "${lower}/v<N>"`)
  }
  if (entry.define && entry.define !== `define${pascal(entry.name)}`) {
    out.push(`define "${entry.define}" is not "define${pascal(entry.name)}"`)
  }
  if (entry.package) {
    const allowed = [`@agentproto/${lower}`]
    if (entry.layer === "drivers") allowed.push(`@agentproto/driver-${lower}`)
    if (!allowed.includes(entry.package)) out.push(`package "${entry.package}" is not ${allowed.map((a) => `"${a}"`).join(" or ")}`)
  }
  if (entry.file && entry.files) out.push("has both file and files")
  if (entry.file && entry.file !== `${entry.name}.md`) out.push(`file "${entry.file}" is not "${entry.name}.md"`)
  for (const f of entry.files ?? []) {
    if (!/^[A-Z][A-Z0-9-]*\.md$/.test(f)) out.push(`files entry "${f}" is not "<KIND>.md"`)
  }
  return out
}

function frontmatter(text) {
  const lines = text.split("\n")
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1
  const out = new Map()
  for (let i = 1; i < close; i++) {
    const m = lines[i].match(/^([A-Za-z-]+):\s*(.*)$/)
    if (m) out.set(m[1], { line: i + 1, value: m[2].trim().replace(/^"(.*)"$/, "$1") })
  }
  return out
}

const CONST_RE = /"const"\s*:\s*"([a-z][a-z0-9.-]*)\/v\d+"/g
const SCHEMA_LINE_RE = /^\s*["']?schema["']?\s*:\s*["']?([a-z][a-z0-9.-]*)\/v\d+/

function schemaIdsIn(file) {
  const found = []
  const lines = readFileSync(file, "utf8").split("\n")
  // Line index of the closing fence of a leading `---` frontmatter, or -1.
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1
  lines.forEach((line, i) => {
    const frontmatter = i > 0 && i < fmEnd
    for (const m of line.matchAll(CONST_RE)) found.push({ file, line: i + 1, name: m[1], frontmatter })
    const y = line.match(SCHEMA_LINE_RE)
    if (y) found.push({ file, line: i + 1, name: y[1], frontmatter })
  })
  return found
}

// A resource file named like another AIP's document (`SKILL.md` shipped
// with AIP-6) is a document of THAT AIP: the schema ids in its frontmatter
// are checked against that AIP's names; its body (examples about the AIP
// that ships it) stays with the shipping AIP.
const ownerByFile = new Map()
for (const entry of registry.aips) {
  if (entry.supersededBy) continue
  for (const f of [entry.file, ...(entry.files ?? [])].filter(Boolean)) ownerByFile.set(f, entry)
}

// Canonical schema names of every active AIP: an id matching one of them is
// a legitimate cross-reference (AIP-20 storing `collection.item` documents).
const canonicalSchema = (name) =>
  registry.aips.some((e) => {
    if (e.supersededBy || !e.specId) return false
    const base = e.specId.split("/")[0]
    return name === base || (name.startsWith(`${base}.`) && !name.slice(base.length + 1).includes("."))
  })

function schemaIds(n) {
  const found = schemaIdsIn(join(SPEC_DIR, `aip-${n}.mdx`))
  const dir = join(SPEC_DIR, "resources", `aip-${n}`)
  if (!existsSync(dir)) return found
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(json|md|mdx|ya?ml)$/.test(e)) found.push(...schemaIdsIn(p))
    }
  }
  walk(dir)
  return found
}

function deviate(id, where, message) {
  if (!deviations.has(id)) deviations.set(id, `${where} ${message}`)
}

for (const n of specs) {
  const path = join(SPEC_DIR, `aip-${n}.mdx`)
  const entry = byNumber.get(n)
  if (!entry) {
    errors.push(`${rel(path)}:1 aip ${n} is not registered in ${rel(NAMES)}`)
    continue
  }
  const fm = frontmatter(readFileSync(path, "utf8"))
  const title = fm.get("title")
  const expected = entry.specId
    ? `AIP-${n}: ${entry.name} (${entry.specId}): `
    : `AIP-${n}: ${entry.name}: `
  if (!title || !title.value.startsWith(expected) || title.value.length === expected.length) {
    deviate(`aip-${n}:title`, `${rel(path)}:${title?.line ?? 1}`, `title should start with "${expected}"`)
  }
  const superseded = fm.get("status")?.value === "Superseded"
  if (superseded !== Boolean(entry.supersededBy)) {
    deviate(`aip-${n}:superseded`, `${rel(path)}:${fm.get("status")?.line ?? 1}`, `status and supersededBy disagree`)
  }
  if (!entry.supersededBy) {
    const pkg = fm.get("package")
    if ((pkg?.value ?? null) !== (entry.package ?? null)) {
      deviate(`aip-${n}:package`, `${rel(path)}:${pkg?.line ?? 1}`, `package should be "${entry.package ?? "(none)"}"`)
    }
    const layer = fm.get("layer")
    if (layer?.value !== entry.layer) {
      deviate(`aip-${n}:layer`, `${rel(path)}:${layer?.line ?? 1}`, `layer should be "${entry.layer}"`)
    }
    for (const c of schemaIds(n)) {
      if (canonicalSchema(c.name)) continue
      const base = c.file.split(/[\\/]/).pop()
      const owner = (c.frontmatter && base !== `aip-${n}.mdx` && ownerByFile.get(base)) || entry
      const specName = owner.specId?.split("/")[0]
      if (!specName) continue
      const where = relative(SPEC_DIR, c.file)
      deviate(`aip-${owner.aip}:schema:${c.name}:${where}`, `${rel(c.file)}:${c.line}`, `schema "${c.name}" should be "${specName}" or "${specName}.<kind>" (AIP-${owner.aip})`)
    }
  }
}

// Ratchet against `pending`.
const pending = new Set(registry.pending ?? [])
const fresh = [...deviations.keys()].filter((id) => !pending.has(id)).sort()
const fixed = [...pending].filter((id) => !deviations.has(id)).sort()

if (WRITE && errors.length) {
  for (const e of errors) console.error(e)
  console.error("registry errors: refusing to write pending")
  process.exit(1)
}
if (WRITE) {
  registry.pending = [...deviations.keys()].sort()
  writeFileSync(NAMES, `${JSON.stringify(registry, null, 2)}\n`)
  console.log(`wrote ${registry.pending.length} pending deviations to ${rel(NAMES)}`)
} else {
  for (const id of fresh) errors.push(`${deviations.get(id)} [${id}] (new deviation)`)
  for (const id of fixed) errors.push(`${rel(NAMES)}: pending "${id}" no longer deviates; remove it`)
}

// Deprecated vocabulary: report only. The GLOSSARY AIP must render it all.
let deprecatedHits = 0
if (existsSync(GLOSSARY)) {
  const glossary = JSON.parse(readFileSync(GLOSSARY, "utf8"))
  const glossaryEntry = registry.aips.find((e) => e.name === "GLOSSARY")
  if (glossaryEntry && !WRITE) {
    const path = join(SPEC_DIR, `aip-${glossaryEntry.aip}.mdx`)
    const lines = readFileSync(path, "utf8").split("\n")
    for (const t of glossary.terms ?? []) {
      if (!lines.some((l) => l.startsWith(`| **${t.term}** |`))) errors.push(`${rel(path)}: no table row for term "${t.term}" of ${rel(GLOSSARY)}`)
    }
    for (const d of glossary.deprecated ?? []) {
      if (!lines.some((l) => l.startsWith(`| ${d.alias} | ${d.use} |`))) errors.push(`${rel(path)}: no table row for deprecated "${d.alias}" of ${rel(GLOSSARY)}`)
    }
  }
  for (const d of glossary.deprecated ?? []) {
    const re = new RegExp(d.pattern, "gi")
    const counts = []
    const glossaryAip = registry.aips.find((e) => e.name === "GLOSSARY")?.aip
    for (const n of specs) {
      if (n === glossaryAip) continue
      const hits = readFileSync(join(SPEC_DIR, `aip-${n}.mdx`), "utf8").match(re)?.length ?? 0
      if (hits) counts.push(`aip-${n}:${hits}`)
      deprecatedHits += hits
    }
    if (counts.length) console.log(`deprecated "${d.alias}" (use "${d.use}"): ${counts.join(" ")}`)
  }
}

console.log(
  `checked ${specs.length} specs: ${deviations.size} deviations (${pending.size} pending, ${fresh.length} new, ${fixed.length} fixed), ${deprecatedHits} deprecated-term uses (report only)`,
)
if (errors.length && !WRITE) {
  for (const e of errors) console.error(e)
  process.exit(1)
}
