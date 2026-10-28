#!/usr/bin/env node
/**
 * Guard every JSON file under specs/ against syntax errors.
 *
 * A merge once dropped a closing `},` in AIP-45 HARNESS.schema.json and the
 * file sat on main as invalid JSON, because nothing in CI parsed the
 * schemas. This check parses each specs/**\/*.json with JSON.parse and
 * reports the file, line and column of the first syntax error.
 *
 * Parse only: compiling the schemas (draft 2020-12, cross-schema $refs)
 * needs a validator dependency, which this repo does not carry.
 *
 *   node scripts/check-spec-json.mjs [root]
 */
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.argv[2] ?? "."
const SPECS = join(ROOT, "specs")

function* jsonFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* jsonFiles(path)
    else if (entry.name.endsWith(".json")) yield path
  }
}

function position(text, message) {
  const lc = /line (\d+) column (\d+)/.exec(message)
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) }
  const at = /position (\d+)/.exec(message)
  if (!at) return null
  const before = text.slice(0, Number(at[1]))
  const line = before.split("\n").length
  return { line, col: Number(at[1]) - before.lastIndexOf("\n") }
}

let checked = 0
let failed = 0
for (const path of [...jsonFiles(SPECS)].sort()) {
  checked++
  const text = readFileSync(path, "utf8")
  try {
    JSON.parse(text)
  } catch (err) {
    failed++
    const file = relative(ROOT, path)
    const pos = position(text, err.message)
    const where = pos ? `:${pos.line}:${pos.col}` : ""
    const anno = pos ? `,line=${pos.line},col=${pos.col}` : ""
    console.log(`::error file=${file}${anno}::invalid JSON: ${err.message}`)
    console.error(`${file}${where}: ${err.message}`)
  }
}

if (failed) {
  console.error(`\n${failed} of ${checked} spec JSON files do not parse.`)
  process.exit(1)
}
console.log(`ok: ${checked} spec JSON files parse`)
