# ADAPTER.md — implementing AIP-29 in a host runtime

This document is the implementer's guide for any runtime, framework, or
language that wants to **load, install, authenticate, sandbox, and invoke**
AIP-29 [`CLI.md`](/docs/aip-29) bundles. It is normative for the parts marked
**MUST** and informative for the parts marked **SHOULD**.

The audience is a runtime author — someone exposing `defineCli` to bundle
authors and brokering CLI invocations to agents. Bundle authors themselves
should read [`./skills/author-cli/SKILL.md`](./skills/author-cli/SKILL.md), not this file.

## Contract overview

A conforming host implements six responsibilities:

1. **Parse** — read `CLI.md`, validate against
   [`./CLI.schema.json`](./CLI.schema.json), surface errors.
2. **Install** — try install methods in order until one succeeds; verify
   SHA-256 when supplied.
3. **Version-check** — run `version_check.cmd`, parse, compare against
   `version_check.range`. Refuse the bundle on mismatch.
4. **Authenticate** — drive the auth state machine (unknown → unauthed →
   authed) using `auth.login` / `auth.refresh` and the `expiry.detect`
   signal.
5. **Sandbox** — enforce `sandbox.network` / `fs` / `exec` / `env` /
   `tty` policies on every invocation.
6. **Dispatch** — route subcommand tool invocations through the bundle,
   apply args, parse output, return structured results.

The signature `defineCli` exposes is the boundary between the host and the
bundle author. Most bundles ship frontmatter-only and need no entry; entries
are for behavioural adapters (custom login, custom output parsing).

## `defineCli` — the entry-point function

### Required behaviour

A host that implements `defineCli` MUST:

1. **Accept the `CliDefinition` shape** documented in
   [AIP-29 § The `defineCli` standard signature](/docs/aip-29#the-definecli-standard-signature).
   Every field listed there MUST be honoured at runtime.

2. **Frontmatter takes precedence.** When the entry exports a field also
   declared in frontmatter and the values differ, the host MUST log a
   warning naming the field and prefer the frontmatter value. Entries are
   for behaviour, not for redefining identity.

3. **Run install methods in order.** Try the first viable method; on
   failure (network error, missing package manager), fall through. SHA-256
   verification, when present, is non-negotiable — verification failure
   MUST abort the install and surface `install_failed` with the verified
   vs. expected hashes.

4. **Validate version after install.** `version_check.cmd` runs in the
   sandbox; the host MAY relax the sandbox specifically for this command
   (network needed for some `--version` checks that phone home, e.g.
   `gcloud`). On range mismatch, surface `version_mismatch`.

5. **Drive the auth state machine.**
   - **unknown** (initial): only `version_check.cmd` allowed.
   - **unauthed**: invoking a tool returns `error.code = "auth_required"`
     with the `login.cmd` available to the surface adapter.
   - **authed**: tools invoke normally. Host runs `refresh.cmd` eagerly
     when elapsed-since-last-refresh ≥ `refresh.every`.
   - **expired**: when an invocation's exit code matches
     `expiry.detect`, the host transitions to `unauthed` and surfaces
     `auth_required`.

6. **Enforce the sandbox** at the OS level. Hosts that cannot enforce
   (e.g. running on a host without firewall capability) MUST refuse to
   execute the bundle, not silently allow.

7. **Honour `signal`** in `login`, `refresh`, and tool dispatch. Hung
   browser flows MUST abort cleanly when the caller cancels.

### Optional behaviour

A host MAY:

- Re-export `defineCli` under host-idiomatic aliases (`createCli`, `cli`).
  Canonical name MUST be present.
- Cache install state per `id@major` to avoid reinstalling on every
  invocation. Cache MUST be invalidated on version-check mismatch.
- Surface a "test login" affordance to surface adapters before the user
  invokes a tool, so the auth flow happens proactively rather than at
  first error.

## Install method dispatch

Each install method has a host-specific implementation. Reference table:

| `method` | Implementation responsibility |
|---|---|
| `brew` | `brew install <package>`. Host SHOULD `brew tap` if the package is namespaced (`stripe/stripe-cli/stripe`). |
| `apt` | `sudo apt-get install -y <package>`. Host MUST refuse on environments without sudo / privilege escalation. |
| `dnf` | `sudo dnf install -y <package>`. Same caveat. |
| `pacman` | `sudo pacman -S --noconfirm <package>`. |
| `choco` | `choco install -y <package>`. Windows only. |
| `scoop` | `scoop install <package>`. Windows only. |
| `npm` | `npm install -g <package>` (when `global: true`) or local install with `$PATH` fix-up. |
| `pip` | `pip install <package>` (when `user: true`, `--user`). |
| `cargo` | `cargo install <package>`. |
| `go` | `go install <package>`. Requires Go toolchain. |
| `curl` | Download + execute installer script. SHA-256 of the script verified before execution. Host SHOULD refuse without `verify_sha256` in production. |
| `download` | Download URL → verify SHA-256 → extract `extract_bin` → place on `$PATH`. |
| `vendored` | No-op install. Path resolved relative to the bundle's folder. Host MUST verify file exists and is executable. |

Install methods unknown to the host MUST be skipped with a warning, not
fail the bundle. Bundles MAY ship experimental methods marked
`experimental: true`; compliant hosts skip them.

## Version detection

The host runs `version_check.cmd` after install:

1. Spawn the command in a temp sandbox (network may be needed for some
   CLIs that contact upstream during `--version`).
2. Capture stdout + stderr + exit code with `timeout_ms` (default 5000).
3. Apply the `parse` regex to combined output (stdout first, then
   stderr). The first capture group is the parsed version.
4. Compare against `range` using npm-semver semantics.
5. On range failure, transition the bundle to `unavailable` state and
   surface `version_mismatch` with parsed vs. expected.

Hosts SHOULD reinstall once on mismatch (handles upstream auto-updates),
then refuse on second failure.

## Auth state machine

```
        ┌─────────────┐
        │   unknown   │  initial state, before version_check
        └──────┬──────┘
               │ version_check ok
               ▼
        ┌─────────────┐         ┌─────────────┐
        │  unauthed   │ ──────▶ │ logging-in  │
        └──────┬──────┘  login  └──────┬──────┘
               ▲                       │ login.completes_when ok
               │                       ▼
               │                ┌─────────────┐
               │                │   authed    │ ── refresh ──┐
               └─────expiry─────┤             │              │
                                └─────────────┘ ◀────────────┘
```

Implementation rules:

- **State persistence.** State is per `(bundle.id, workspace.id, user.id)`
  tuple. Hosts MUST persist state across runs; users SHOULD NOT re-login
  at every session.
- **Eager refresh.** When state is `authed` and elapsed-since-refresh ≥
  `refresh.every`, the host kicks off `refresh.cmd` before the next tool
  invocation. Refresh failure transitions to `unauthed`.
- **Expiry detection.** After every tool invocation, the host checks the
  exit code against `auth.expiry.detect`. When matched, transition to
  `unauthed` and surface `auth_required`.
- **Login mid-flight.** When `interactive: true`, the host MUST surface a
  user-facing affordance (a button, a "Click to log in" link). Headless
  callers MUST receive `auth_required` immediately rather than blocking.

## Sandbox enforcement

Sandbox is the contract; the host is the enforcer. Implementation
strategies depend on the host environment:

| Layer | Implementations |
|---|---|
| Network egress | OS-level firewall (`iptables`/`pf`), proxy, container network policy, DNS sinkhole. Hostname globs evaluated at DNS resolution time. |
| Network ingress | Per-bundle callback URL allocation (single-use, time-bound, signed). Reverse-proxied to the host's sandbox. |
| Filesystem read/write/deny | Containerised file-system overlays (`overlayfs`, Docker bind mounts), or capability-based filesystem (Linux capabilities, macOS sandbox-exec). |
| Exec allow/spawn | Process execution policy (Linux seccomp, macOS sandbox profiles, Windows AppContainer). |
| Env pass/set | Process-spawn env construction. The sandbox's env is built from `pass`+`set`, never inheriting the host's full env. |
| TTY required | `posix_openpt` allocation per invocation; refuse the bundle on hosts without PTY support. |

Hosts that cannot enforce a declared policy MUST refuse to invoke the
bundle. Silently downgrading the sandbox is a security regression.

### Inheritance to subcommand TOOL.md

Each subcommand TOOL.md inherits the bundle's sandbox by default. Tools
MAY narrow (`fs.write: []` removes write entirely) but MUST NOT widen.

When loading a subcommand TOOL.md, the host:

1. Resolves the parent CLI bundle (per `runner.cli:` ref in the tool).
2. Computes the effective sandbox = `narrow(bundle.sandbox, tool.sandbox)`.
3. Refuses to register tools whose declared sandbox widens the parent.

## Dispatch

When the host invokes a subcommand TOOL.md inside the bundle:

1. **Validate input** against the tool's `inputs` schema (per
   [AIP-14](/docs/aip-14)).
2. **Build argv** from the tool's `runner.argv` template, expanding
   `${input.X}` interpolations. Hosts MUST shell-escape interpolated
   values; bundles MUST NOT use shell features.
3. **Prepend `bin_args`** from the bundle's frontmatter, then the
   tool's argv.
4. **Spawn** the binary in the configured sandbox, with the env from
   `sandbox.env.pass` + `sandbox.env.set`.
5. **Capture** stdout, stderr, exit code subject to `timeout_ms`.
6. **Parse output** via `parseOutput` if the entry provides one,
   otherwise via the host's default JSON-or-text fallback driven by
   `output.default_format`.
7. **Check expiry**: if exit code matches `auth.expiry.detect`,
   transition state.
8. **Wrap result** in the standard envelope and return.

```ts
type CliInvocationResult<T> =
  | { ok: true;  value: T;  exit_code: number; ms: number }
  | { ok: false; error: { code: string; message: string; exit_code: number; stderr?: string }; ms: number }
```

## Output parsing

Default parsing rules when the entry doesn't provide `parseOutput`:

- `output.default_format: json` — `JSON.parse(stdout)`. On parse error,
  return `error.code = "output_parse_failed"`.
- `output.default_format: yaml` — host-side YAML parser. Same fallback.
- `output.default_format: text` — return `stdout` as a string. No
  parsing.
- `output.default_format: binary` — return `stdout` as a `Buffer`.
  Hosts SHOULD warn about size and propose streaming for >10 MB.

When `output.json_flag` is set and the per-tool TOOL.md requests JSON
output, the host appends the flag (with `json_flag_args` if declared)
to the argv and parses as JSON.

Mixed-stream CLIs (success goes to stderr, e.g. `ffmpeg`) — the bundle
declares `output.stream: stderr` and the host reads stderr for both
parse and warning surfaces. Exit code remains the success/failure
discriminator.

## Audit log shape

Hosts SHOULD emit one audit entry per CLI invocation:

```json
{
  "type": "cli.invoked",
  "cli_id": "gh",
  "cli_version": "1.0.0",
  "binary_version": "2.40.1",
  "subcommand": "pr.create",
  "tool_id": "pr-create",
  "user_id": "u_abc",
  "workspace_id": "w_xyz",
  "argv_template": "pr create --title ${input.title} --body ${input.body} --base ${input.base}",
  "argv_count": 8,
  "exit_code": 0,
  "duration_ms": 1240,
  "auth_state": "authed",
  "ok": true,
  "ts": "2026-04-30T14:00:00Z"
}
```

`argv_count` is the number of tokens; the host MUST NOT log raw argv
(may contain user-supplied values that are PII or secrets). `argv_template`
captures the *template*, not the expanded form.

Mid-flight expiry is logged separately:

```json
{ "type": "cli.auth_expired", "cli_id": "gh", "user_id": "u_abc", "ts": "..." }
```

## Reference implementation

The canonical TypeScript implementation lives at
`packages/cli-runtime`.
It exposes:

- `defineCli(definition: CliDefinition): CliHandle`
- `loadCli(path: string): Promise<CliHandle>`
- `installCli(handle): Promise<InstallResult>`
- `verifyCli(handle): Promise<VerifyResult>` (version check)
- `loginCli(handle, context): Promise<LoginResult>`
- `runCliTool(handle, toolId, { input, context }): Promise<CliInvocationResult>`

Hosts in other languages should mirror this surface; the contract is
the manifest and the `defineCli` shape, not the package.

## Migration notes

### From hand-rolled CLI wrappers

Existing wrappers (Mastra MCP servers wrapping `gh`, LangChain
`ShellTool` instances) migrate by:

1. Authoring `CLI.md` from the wrapper's setup code:
   - Install: extract from the wrapper's bootstrap script.
   - Version: extract from the wrapper's preflight check.
   - Sandbox: read what network/fs the wrapper actually touches; codify.
   - Auth: extract the env-var / config-file dance; route through
     [SECRETS.md](/docs/aip-19).
2. Converting each wrapped subcommand to a TOOL.md sibling.
3. Moving auth + output-parsing logic into a `defineCli` entry.
4. Decommissioning the wrapper after the bundle covers the same surface.

### From containerised CLIs (Docker images)

Some hosts run CLIs inside Docker on every call. Migrate by:

1. Authoring CLI.md with `runner.engine: "docker"` + `runner.image: "..."`
   (per [AIP-17](/docs/aip-17)).
2. Setting `install: [{ method: vendored, path: <image-pull-script> }]`
   or trusting the runner to pull on first use.
3. Per-subcommand sandbox stays at the bundle level — the Docker image
   is the sandbox.

The bundle stays composable with non-Docker environments; the runner
declaration is the swap point.
