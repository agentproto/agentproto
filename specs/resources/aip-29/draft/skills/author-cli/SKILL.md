---
schema: skills/v1
name: author-cli
title: Author a CLI.md (AIP-29)
description:
  Walk through authoring a portable CLI.md bundle plus the per-subcommand
  TOOL.md siblings that make up the bundle's invocable surface.
version: 1.0.0
tags: [aip-29, cli, authoring, manifest, agentproto]
inputs:
  - name: binary
    type: string
    required: true
    description:
      Name of the CLI binary to wrap (`gh`, `gcloud`, `kubectl`, `ffmpeg`,
      `stripe`, `yt-dlp`, …). Used as the bundle's `id` and `bin`.
  - name: scope
    type: string
    required: false
    description:
      Comma-separated list of subcommands to wrap initially (`pr.create,
      pr.list, issue.view`). Empty = wrap everything documented in
      `<bin> --help`. Recommended to start narrow and expand.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the entry file when custom output parsing or
      auth flow is needed. Default "ts". Accepts "ts", "py", "go".
examples:
  - input:
      binary: "gh"
      scope: "pr.create, pr.list, pr.merge, issue.view, issue.list"
    output:
      - .cli/gh/CLI.md
      - .cli/gh/SECRETS.md
      - .cli/gh/tools/pr-create/TOOL.md
      - .cli/gh/tools/pr-list/TOOL.md
      - .cli/gh/tools/pr-merge/TOOL.md
      - .cli/gh/tools/issue-view/TOOL.md
      - .cli/gh/tools/issue-list/TOOL.md
  - input:
      binary: "ffmpeg"
      scope: "transcode, trim, resize"
    output:
      - .cli/ffmpeg/CLI.md
      - .cli/ffmpeg/tools/ffmpeg-transcode/TOOL.md
      - .cli/ffmpeg/tools/ffmpeg-trim/TOOL.md
      - .cli/ffmpeg/tools/ffmpeg-resize/TOOL.md
---

# Author a CLI.md (AIP-29)

Use this skill when the user asks to **wrap a third-party CLI** so an agent
can install, authenticate, sandbox, and invoke it safely. The skill produces
a valid [AIP-29 CLI.md](/docs/aip-29) bundle plus one TOOL.md per
subcommand wrapped.

## When to use

- "Wrap the GitHub CLI so the agent can list and merge PRs."
- "I want our agent to be able to call ffmpeg in a sandbox."
- "Add stripe CLI as an integration the billing agent can use."

## When NOT to use

- The CLI exposes an HTTP API the agent could call directly → prefer the
  HTTP route. CLI.md is for binaries; HTTP integrations belong in a
  TOOL.md per endpoint.
- The user wants to wrap a **single command** with no auth/sandbox
  context → just author a [TOOL.md (AIP-14)](/docs/aip-14) directly.
- The user wants to wrap an **entire interactive shell session** (REPL,
  TUI) → CLI.md is for one-shot invocations. Interactive sessions need
  a separate spec (under discussion).

## Process

Follow these steps in order. Each step has a short justification — keep
them in the file you produce so reviewers see why each field ended up
the way it did.

### 1. Fix identity

- `id`: the binary name, lowercase (`gh`, `gcloud`, `kubectl`, `ffmpeg`).
- `bin`: same as `id` for binaries on `$PATH`. Vendored binaries use
  the workspace path (`./bin/acme`).
- `name`: human display name ("GitHub CLI", "FFmpeg").
- `description`: one paragraph for an LLM caller — what problems this CLI
  solves, what it doesn't.

### 2. Map install paths

Open the CLI's official install docs. Author 3+ install methods covering
the major package managers and a fallback download URL:

```yaml
install:
  - { method: brew,     package: gh }
  - { method: apt,      package: gh }
  - { method: choco,    package: gh }
  - { method: download, url: "...", extract_bin: "...", verify_sha256: "..." }
```

For `download` and `curl` methods, **always** include `verify_sha256`
when production-ready. Without it, hosts will refuse to install in
secure environments. Find the SHA-256 in the upstream release page or
compute via `shasum -a 256 <file>`.

### 3. Author version detection

Run `<bin> --version` and capture the output:

```
$ gh --version
gh version 2.40.1 (2026-04-20)
…
```

Author the regex:

```yaml
version_check:
  cmd: "gh --version"
  parse: 'gh version (\S+)'
  range: ">=2.40 <3"
```

Pick the lowest version that supports the subcommands you intend to
wrap. Pick the upper bound as the next major (open question — see
[AIP-29 § Open questions](/docs/aip-29#open-questions)).

### 4. Map the auth surface

Read the CLI's auth docs. Identify:

- **State location**: which paths the CLI writes (`~/.config/gh`,
  `~/.aws/credentials`).
- **Env vars**: which env vars the CLI reads (`GH_TOKEN`,
  `STRIPE_API_KEY`, `KUBECONFIG`).
- **Login flow**: the exact command + interactivity needs.
- **Refresh**: cadence + command (often `<bin> auth refresh` or
  similar).
- **Expiry signal**: which exit code / error string indicates
  "auth expired".

Author the SECRETS.md inventory ([AIP-19](/docs/aip-19)) listing all
env vars + their resolution sources (vault slugs, OAuth bindings).
Reference it from `auth.ref:`.

### 5. Author the sandbox profile

This is the most important step. Get it wrong and the bundle either
breaks (missing permission) or escalates privilege (too permissive).

For each axis:

- **Network egress**: Run the CLI under network monitoring (`tcpdump`,
  `mitmproxy`, or just observe). List every hostname it contacts.
  Avoid wildcards; be specific.
- **FS read/write**: Read the CLI's source / docs / man page. List
  config file paths, cache paths, and any working directories. Add
  workspace paths (`./inventory/**`) the user data lives in.
- **FS deny**: Always `~/.ssh/**`, `/etc/**`, `~/.aws/**` (unless
  this CLI is the AWS CLI). Belt-and-braces.
- **Exec**: Default `false`. Some CLIs spawn child processes — `gh`
  shells out to `git`, `kubectl` shells out to plugins. Allowlist
  the specific bin names.
- **Env**: List vars the CLI requires; default-deny the rest.
- **TTY**: True only when login or some subcommand reads stdin
  interactively.

Test the sandbox: spin up a host, install the CLI, run the documented
subcommands, and verify nothing fails permission-denied. If it does,
add the missing permission — but be specific (a path, a hostname, not
a wildcard).

### 6. Author output conventions

Run common subcommands. Note:

- Where success goes (stdout? stderr?).
- Where errors go.
- Whether `--json` / `--format=json` works.
- Exit codes for success, error, auth-required.

Author `output:` accordingly. The standard exit codes (0=ok, 1=error,
2=usage, 4=auth_required, 124=timeout, 137=killed) MUST be respected;
add CLI-specific codes only when the CLI truly diverges.

### 7. Walk the subcommand tree

For each subcommand in `scope` (or, if empty, the documented root
subcommands):

1. Run `<bin> <subcmd> --help` to capture flags + args.
2. Author a TOOL.md sibling at `./tools/<subcmd>/TOOL.md` using the
   [AIP-14 author-tool skill](../../../aip-14/draft/skills/author-tool/SKILL.md).
3. Set the tool's `runner.cli:` ref back to the parent bundle.
4. Author the `runner.argv:` template using `${input.X}` interpolations
   for input properties.
5. Add the tool to the bundle's `commands:` tree.

Don't try to wrap every subcommand on day one. Start with the top 5–10
most-used subcommands and grow incrementally.

### 8. Author optional INTENTs

For common user-facing intents the bundle exposes (e.g. "open a PR with
a single click"), author [INTENT.md](/docs/aip-28) entries under
`./intents/<id>/`. Each intent's `implements:` block points at one or
more subcommand tools inside the bundle. Reference them in the
bundle's `intents:` block.

This is optional — many bundles ship without pre-wired intents. Add
them when the bundle is consumed by surfaces that need user-facing
copy (chat catalog, menu).

### 9. Validate

Run the manifest through
[`./resources/aip-29/draft/CLI.schema.json`](../../CLI.schema.json):

```bash
ajv validate -s CLI.schema.json -d .cli/<id>/CLI.md \
  --remove-additional fail \
  --strict
```

Validate every per-subcommand TOOL.md against the AIP-14 schema.
Reject the bundle if any sibling fails.

### 10. Wire to the host

```ts
import { loadCli, installCli, verifyCli, runCliTool } from "@agentproto/cli-runtime"

const bundle = await loadCli("./.cli/gh/CLI.md")
await installCli(bundle)
await verifyCli(bundle)

// First-call login (deferred until first tool invocation needs it)
const result = await runCliTool(bundle, "pr.list", {
  input:   { state: "open" },
  context: { user: { id: "u_abc" }, surface: "chat" },
})
```

The bundle now installs on demand, version-checks, drives auth, and
dispatches subcommands through the sandbox.

## Output structure

The skill emits at minimum:

```
.cli/<id>/
  CLI.md                          ← always
  SECRETS.md                      ← always (AIP-19 inventory)
  tools/
    <subcmd-1>/TOOL.md
    <subcmd-2>/TOOL.md
    …
  cli.ts                          ← only when custom login/parser needed
  intents/                        ← only when pre-wired INTENTs included
    <intent-1>/INTENT.md
```

`cli.ts` is needed when:
- The CLI's output format isn't text/JSON/YAML (custom delimiter, pseudo-
  CSV, etc.).
- The login flow needs callback-URL allocation or token refresh logic
  beyond simple env vars.
- Exit-code → semantic mapping needs context-sensitive rules.

Otherwise the manifest stands alone.

## Common mistakes

- **Wildcarding `network.egress`.** `["*"]` is a bug. Be specific. If the
  CLI legitimately needs the open internet (`yt-dlp`, `curl` wrappers),
  document that in the body and set bundle-wide tools to `risk_level: 2+`.
- **Forgetting `state.paths` in `auth`.** The CLI's stateful auth files
  MUST appear in BOTH `auth.state.paths` AND `sandbox.fs.read`/`write`.
  Otherwise login appears to succeed but state never persists.
- **Shell metacharacters in `runner.argv`.** Tools using `&&`, `|`, `;`,
  `>` rely on shell features the runner doesn't provide. Compose
  multi-step invocations via [WORKFLOW.md (AIP-15)](/docs/aip-15).
- **Missing `verify_sha256` for `download` / `curl`.** Production hosts
  refuse without it. Always supply.
- **Mutable `id`.** Renaming = breaking change = major bump + alias for
  the legacy id.
- **Wrapping every subcommand on day one.** A 50-tool bundle is a 50-tool
  review. Start with the top 5–10; grow as needed.
