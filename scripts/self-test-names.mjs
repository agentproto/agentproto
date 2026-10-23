#!/usr/bin/env node
/**
 * Self-test for scripts/check-names.mjs: builds small spec trees in a temp
 * directory and asserts the exit code of each case. Every case that expects
 * a failure is one the check must catch; a check that passes everything
 * fails this test.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const CHECK = join(dirname(fileURLToPath(import.meta.url)), "check-names.mjs")

const spec = (n, title, extra = "") =>
  `---\ntitle: "${title}"\naip: ${n}\nstatus: Review\nlayer: primitives\n${extra}---\n\nBody.\n`

const baseEntries = [
  { aip: 1, name: "ALPHA", specId: "alpha/v1", package: "@agentproto/alpha", layer: "primitives" },
  { aip: 2, name: "BETA", specId: "beta/v1", layer: "primitives" },
]

function run({ specs, entries = baseEntries, pending = [], resources = {}, flags = [] }) {
  const root = mkdtempSync(join(tmpdir(), "check-names-"))
  try {
    mkdirSync(join(root, "specs"), { recursive: true })
    for (const [n, text] of Object.entries(specs)) writeFileSync(join(root, "specs", `aip-${n}.mdx`), text)
    for (const [path, text] of Object.entries(resources)) {
      mkdirSync(dirname(join(root, "specs", path)), { recursive: true })
      writeFileSync(join(root, "specs", path), text)
    }
    writeFileSync(
      join(root, "specs", "names.json"),
      JSON.stringify({ version: 1, layers: ["primitives", "host"], aips: entries, pending }),
    )
    return spawnSync(process.execPath, [CHECK, root, ...flags], { encoding: "utf8" }).status
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const good = {
  1: spec(1, "AIP-1: ALPHA (alpha/v1): first", 'package: "@agentproto/alpha"\n'),
  2: spec(2, "AIP-2: BETA (beta/v1): second"),
}
const badTitle = { ...good, 2: spec(2, "AIP-2: BETA.md, agentbeta/v1 (second)") }

const cases = [
  ["conformant tree passes", { specs: good }, 0],
  ["new title deviation fails", { specs: badTitle }, 1],
  ["pending title deviation passes", { specs: badTitle, pending: ["aip-2:title"] }, 0],
  ["pending entry already fixed fails", { specs: good, pending: ["aip-2:title"] }, 1],
  ["unregistered spec fails", { specs: { ...good, 3: spec(3, "AIP-3: GAMMA (gamma/v1): third") } }, 1],
  ["wrong package fails", { specs: { ...good, 1: spec(1, "AIP-1: ALPHA (alpha/v1): first", 'package: "@agentproto/a"\n') } }, 1],
  ["wrong layer fails", { specs: good, entries: [baseEntries[0], { ...baseEntries[1], layer: "host" }] }, 1],
  [
    "foreign schema const fails",
    { specs: good, resources: { "resources/aip-1/draft/A.schema.json": '{ "const": "agentalpha/v1" }' } },
    1,
  ],
  [
    "kind schema const passes",
    { specs: good, resources: { "resources/aip-1/draft/A.schema.json": '{ "const": "alpha.entry/v1" }' } },
    0,
  ],
  [
    "schema line in the AIP body fails",
    { specs: { ...good, 1: spec(1, "AIP-1: ALPHA (alpha/v1): first", 'package: "@agentproto/alpha"\n') + "\n```yaml\nschema: agentalpha/v1\n```\n" } },
    1,
  ],
  [
    "cross-reference to another AIP's schema passes",
    { specs: { ...good, 1: spec(1, "AIP-1: ALPHA (alpha/v1): first", 'package: "@agentproto/alpha"\n') + "\n```yaml\nschema: beta.item/v1\n```\n" } },
    0,
  ],
  [
    "two-level schema kind fails",
    { specs: good, resources: { "resources/aip-1/draft/A.schema.json": '{ "const": "alpha.a.b/v1" }' } },
    1,
  ],
  [
    "frontmatter of a shipped BETA.md belongs to BETA",
    {
      specs: good,
      entries: [baseEntries[0], { ...baseEntries[1], file: "BETA.md" }],
      resources: { "resources/aip-1/draft/BETA.md": "---\nschema: agentbeta/v1\n---\nschema: alpha/v1\n" },
      pending: ["aip-2:schema:agentbeta:resources/aip-1/draft/BETA.md"],
    },
    0,
  ],
  ["define not define<Name> fails", { specs: good, entries: [{ ...baseEntries[0], define: "defineAlphaThing" }, baseEntries[1]] }, 1],
  ["package not @agentproto/<name> fails", { specs: { ...good, 1: spec(1, "AIP-1: ALPHA (alpha/v1): first", 'package: "@agentproto/a"\n') }, entries: [{ ...baseEntries[0], package: "@agentproto/a" }, baseEntries[1]] }, 1],
  ["--write-pending refuses a broken registry", { specs: { ...good, 3: spec(3, "AIP-3: GAMMA (gamma/v1): third") }, flags: ["--write-pending"] }, 1],
  ["duplicate active name fails", { specs: good, entries: [baseEntries[0], { ...baseEntries[1], name: "ALPHA" }] }, 1],
  ["entry without spec fails", { specs: good, entries: [...baseEntries, { aip: 9, name: "NINE", layer: "host" }] }, 1],
]

let failed = 0
for (const [name, input, expected] of cases) {
  const status = run(input)
  const ok = status === expected
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (exit ${status}, expected ${expected})`)
}
console.log(`${cases.length - failed}/${cases.length} cases passed`)
process.exit(failed ? 1 : 0)
