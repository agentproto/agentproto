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
 *   schema:<id> a `"const": "<id>/vN"` in `specs/resources/aip-<n>/**` whose
 *               name is neither `<specName>` nor `<specName>.<kind>`
 *
 * The check is a ratchet. `names.json` `pending` lists the deviations known
 * today. A deviation that is not pending FAILS (new drift), and a pending
 * entry that no longer deviates FAILS too (it was fixed: remove it, so it
 * cannot come back). `--write-pending` rewrites `pending` to the current
 * set; use it only to bootstrap or after a reviewed batch of renames.
 *
 * Registry errors always fail and cannot be made pending: a spec with no
 * entry, an entry with no spec, a duplicate active name or specId, an unknown
 * layer, a `file` that is not `<NAME>.md`.
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
  if (entry.file && entry.file !== `${entry.name}.md`) {
    errors.push(`${rel(NAMES)}: aip ${entry.aip} file "${entry.file}" is not "${entry.name}.md"`)
  }
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

function schemaConsts(dir) {
  const found = []
  if (!existsSync(dir)) return found
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith(".json")) {
        const lines = readFileSync(p, "utf8").split("\n")
        lines.forEach((line, i) => {
          for (const m of line.matchAll(/"const"\s*:\s*"([a-z][a-z0-9.-]*)\/v\d+"/g)) {
            found.push({ file: p, line: i + 1, name: m[1] })
          }
        })
      }
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
    const specName = entry.specId?.split("/")[0]
    for (const c of schemaConsts(join(SPEC_DIR, "resources", `aip-${n}`))) {
      if (!specName || c.name === specName || c.name.startsWith(`${specName}.`)) continue
      deviate(`aip-${n}:schema:${c.name}`, `${rel(c.file)}:${c.line}`, `schema "${c.name}" should be "${specName}" or "${specName}.<kind>"`)
    }
  }
}

// Ratchet against `pending`.
const pending = new Set(registry.pending ?? [])
const fresh = [...deviations.keys()].filter((id) => !pending.has(id)).sort()
const fixed = [...pending].filter((id) => !deviations.has(id)).sort()

if (WRITE) {
  registry.pending = [...deviations.keys()].sort()
  writeFileSync(NAMES, `${JSON.stringify(registry, null, 2)}\n`)
  console.log(`wrote ${registry.pending.length} pending deviations to ${rel(NAMES)}`)
} else {
  for (const id of fresh) errors.push(`${deviations.get(id)} [${id}] (new deviation)`)
  for (const id of fixed) errors.push(`${rel(NAMES)}: pending "${id}" no longer deviates; remove it`)
}

// Deprecated vocabulary: report only.
let deprecatedHits = 0
if (existsSync(GLOSSARY)) {
  const glossary = JSON.parse(readFileSync(GLOSSARY, "utf8"))
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
