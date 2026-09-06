#!/usr/bin/env node
/**
 * Self-test for check-aip-refs.mjs — run: node scripts/self-test-aip-refs.mjs
 *
 * The corpus is clean on main, so a green run alone proves nothing. This
 * injects known-broken references into throwaway copies under the OS temp
 * dir and shows the checker catches each one — naming the true file:line —
 * then shows the real corpus passes. The real corpus is never written to.
 *
 *   leg 1  real corpus                          -> exit 0
 *   leg 2  temp copy, no ts sibling:
 *          dangling `requires: 999`,
 *          dangling /docs/aip-998 link          -> exit 1, exactly those two
 *   leg 3  temp copy + fabricated ../ts stub
 *          built from every real ref-impl path
 *          and package name, minus the injected
 *          breaks: ref-impl to a missing path,
 *          package to a name that does not
 *          exist                                -> exit 1, exactly those two
 *                                                  (every other spec still
 *                                                  resolves against the stub)
 *
 * Each injected failure is asserted down to the reported file:line, which
 * pins the checker's line-number arithmetic, not just its exit code.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..")
const checker = join(here, "check-aip-refs.mjs")

let failures = 0
const check = (ok, what) => {
  if (ok) {
    console.log(`  ok   ${what}`)
  } else {
    failures++
    console.error(`  FAIL ${what}`)
  }
}
const lineOf = (text, needle) => {
  const idx = text.split("\n").findIndex((l) => l.includes(needle))
  if (idx === -1) throw new Error(`self-test bug: needle not found: ${needle}`)
  return idx + 1
}
const poison = (text, regex, replacement) => {
  const out = text.replace(regex, replacement)
  if (out === text) throw new Error(`self-test bug: pattern did not match: ${regex}`)
  return out
}
const run = (root) => spawnSync("node", [checker, root], { encoding: "utf8" })
// Failure lines look like `  specs/aip-9.mdx:10 — …` (WARN lines start
// with `  WARN`, so this regex only counts hard failures).
const countFailures = (out) => (out.match(/^  specs\//gm) ?? []).length

// --- leg 1: the real corpus passes ---
console.log("leg 1 — real corpus, expect exit 0")
{
  const r = run(repoRoot)
  console.log(r.stdout.trimEnd())
  check(r.status === 0, `exit 0 on the real corpus (got ${r.status})`)
}

// Legs 2–3 copy the corpus to tmp/repo so the checker's `../ts` resolves
// to tmp/ts — the same sibling layout CI would have to skip on. Root is
// always tmp/repo, never tmp, so no stray $TMPDIR/ts can leak in.
const copyCorpus = (tmp) => {
  const repo = join(tmp, "repo")
  cpSync(join(repoRoot, "specs"), join(repo, "specs"), { recursive: true })
  return repo
}

// --- leg 2: dangling requires: + dangling /docs/ link, no ts sibling ---
console.log("\nleg 2 — injected dangling requires: and /docs/aip- link, expect exit 1 naming both")
{
  const tmp = mkdtempSync(join(tmpdir(), "aip-refs-leg2-"))
  try {
    const repo = copyCorpus(tmp)
    const target = join(repo, "specs", "aip-9.mdx")
    let text = readFileSync(target, "utf8")
    text = poison(text, /^requires: \[([^\]]*)\]/m, (m, list) => `requires: [${list}, 999]`)
    text += "\nSee also [AIP-998](/docs/aip-998) for the companion spec.\n"
    writeFileSync(target, text)
    const reqLine = lineOf(text, ", 999]")
    const linkLine = lineOf(text, "/docs/aip-998")

    const r = run(repo)
    console.log(r.stdout.trimEnd())
    check(r.status === 1, `exit 1 on the injected copy (got ${r.status})`)
    check(countFailures(r.stdout) === 2, `exactly 2 failures (got ${countFailures(r.stdout)})`)
    check(
      r.stdout.includes(`specs/aip-9.mdx:${reqLine} — requires AIP-999`),
      `names the dangling requires at specs/aip-9.mdx:${reqLine}`,
    )
    check(
      r.stdout.includes(`specs/aip-9.mdx:${linkLine} — links /docs/aip-998`),
      `names the dangling link at specs/aip-9.mdx:${linkLine}`,
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// --- leg 3: rules 4/5 against a fabricated ts sibling ---
console.log("\nleg 3 — injected ref-impl path and unresolvable package name against a stub ../ts")
{
  const tmp = mkdtempSync(join(tmpdir(), "aip-refs-leg3-"))
  try {
    const repo = copyCorpus(tmp)
    // Build a stub ts workspace (as tmp/ts, the sibling of tmp/repo) that
    // satisfies every REAL ref-impl path (directories) and every REAL
    // package name (package.json `name`), so the only failures left are
    // the ones injected below. Rules 4/5 passing the whole corpus here is
    // the positive control.
    const tsRoot = join(tmp, "ts")
    for (const f of readdirSync(join(repo, "specs"))) {
      if (!/^aip-\d+\.mdx$/.test(f)) continue
      const text = readFileSync(join(repo, "specs", f), "utf8")
      for (const m of text.matchAll(/^ref-impl: https:\/\/github\.com\/agentproto\/ts\/tree\/main\/(.+)$/gm)) {
        mkdirSync(join(tsRoot, m[1]), { recursive: true })
      }
      for (const m of text.matchAll(/^package: "?@agentproto\/([^"\n]+)"?$/gm)) {
        const dir = join(tsRoot, "packages", m[1])
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@agentproto/${m[1]}` }))
      }
    }
    const target = join(repo, "specs", "aip-42.mdx")
    let text = readFileSync(target, "utf8")
    text = poison(
      text,
      /^ref-impl: .*$/m,
      "ref-impl: https://github.com/agentproto/ts/tree/main/no/such/dir",
    )
    text = poison(text, /^package: ".*"$/m, 'package: "@agentproto/ghost-pkg"')
    writeFileSync(target, text)
    const refLine = lineOf(text, "no/such/dir")
    const pkgLine = lineOf(text, "ghost-pkg")

    const r = run(repo)
    // 55 specs print their summaries; show only the tail (warnings + verdict).
    console.log(r.stdout.trimEnd().split("\n").slice(-3).join("\n"))
    check(r.status === 1, `exit 1 on the injected copy (got ${r.status})`)
    check(countFailures(r.stdout) === 2, `exactly 2 failures (got ${countFailures(r.stdout)})`)
    check(
      r.stdout.includes(`specs/aip-42.mdx:${refLine} — ref-impl 'no/such/dir' does not exist in ../ts`),
      `names the missing ref-impl path at specs/aip-42.mdx:${refLine}`,
    )
    check(
      r.stdout.includes(
        `specs/aip-42.mdx:${pkgLine} — package @agentproto/ghost-pkg does not resolve to any package in ../ts`,
      ),
      `names the unresolvable package at specs/aip-42.mdx:${pkgLine}`,
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (failures) {
  console.error(`\nSELF-TEST FAILED — ${failures} check(s) above.`)
  process.exit(1)
}
console.log("\nSELF-TEST OK — clean corpus passes; every injected break is caught at the right file:line.")
