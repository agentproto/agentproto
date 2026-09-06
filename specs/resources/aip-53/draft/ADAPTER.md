# ADAPTER.md — implementing AIP-53 (app/v1) in a host runtime

This document is the implementer's guide for any runtime, framework, or
language that wants to **author, load, validate, install, and serve**
AIP-53 apps — [`APP.md`](/docs/aip-53) bundles. It is normative for the
parts marked **MUST** and informative for the parts marked **SHOULD**.

The audience is a runtime author — someone exposing `defineApp` to app
authors or an install/run surface to users. App authors should read the
AIP's [Emitted layout](/docs/aip-53#emitted-layout) section, not this
file.

The canonical TypeScript implementation lives at
[`packages/app-kit`](https://github.com/agentproto/ts/tree/main/packages/app-kit)
(bundle authoring, `emit`/`load`) and
[`packages/runtime`](https://github.com/agentproto/ts/tree/main/packages/runtime)
(install/run lifecycle, UI bridge, data plane). This guide is the
language-agnostic projection of what those packages actually do.

## Contract overview

A conforming host implements five responsibilities:

1. **Author** — accept an `AppDefinition` through a `defineApp`-shaped
   constructor, enforce the conformance rules (below), and return a
   frozen handle.
2. **Emit / load** — write the bundle layout to disk and read it back,
   re-validating on every load.
3. **Install / run** — validate an emitted dir, persist an installed
   record, spawn sessions per agent, and report/stop them.
4. **Serve the UI** — static files + the `window.McpApp` bridge +
   server-side allowlist enforcement.
5. **Operate the data plane** — app-scoped durable storage with the
   traversal guard, resolution rules, and atomic writes.

Responsibilities 4 and 5 are each specified normatively in the AIP
([The UI surface contract](/docs/aip-53#the-ui-surface-contract), [The
app data plane](/docs/aip-53#the-app-data-plane-app_data_)); this guide
focuses on 1–3 and points at the rest.

## Bundle validation — the conformance rules a host MUST enforce

Validate at `defineApp` time AND again on every load. The reference
implementation enforces these in `defineApp`
(`packages/app-kit/src/define-app.ts`) and re-runs the same construction
path in `loadAppHandle`:

1. **Agents-or-UI.** `agents` MUST be non-empty unless `ui` is present.
   A UI-only app (empty/omitted `agents` + a `ui` block) is conforming
   and first-class — this codifies `define-app.ts:49-52` and the five
   builtin panels in `packages/apps/src/index.ts` that ship as
   `agents: []`. An app with neither agents nor `ui` MUST be refused.
2. **Unique ids.** Duplicate agent ids or duplicate workflow ids in one
   bundle MUST be refused.
3. **Attachment invariant, both directions.** Every agent
   `workflows[]` ref resolves to a bundled workflow; every bundled
   workflow is referenced by at least one agent. A UI-only app bundles
   zero workflows (a workflow nobody references is an orphan).
4. **`id` non-empty when present.** Omitted `id` = anonymous bundle —
   emittable and runnable in-process, but not installable by id.
5. **`ui.html` non-empty when `ui` is present.**
6. **`dev.launch` non-empty when `dev` is present.**
7. **`artifact.path` / `skill.path` non-empty when present.** (The
   reference implementation currently checks non-emptiness only;
   absolute-path enforcement is a known follow-up — do not ship a host
   that silently accepts a relative path into `emit`.)
8. **Version default.** `id` set + `version` omitted → `"0.1.0"`.
   Anonymous bundles carry no default version.
9. **No I/O at `defineApp` time.** I/O is confined to `emit(dir)` and
   `loadAppHandle(dir)`.

Error style: name the offending field and what was received (the
reference `AppDefinitionError` prefixes every message with
`defineApp (app-kit):`). A bare "invalid app" is not sufficient.

## Emission and loading

`emit(dir)` writes exactly the [Emitted
layout](/docs/aip-53#emitted-layout): `AGENT.md` per agent (id with any
`@owner/` prefix stripped), `WORKFLOW.md` per workflow (written once,
shared), `ui/index.html` when `ui` is set, `artifact/` and `skill/`
copies when set, and `APP.md` always. Fields the definition omitted MUST
NOT appear in the frontmatter — no `undefined`/`null` placeholders.

`loadAppHandle(dir)` MUST:

- reject frontmatter whose `schema` is not exactly `app/v1`;
- reject `agents`/`workflows` entries that are not `{ id, path }`;
- resolve every ref against `dir` and parse each `AGENT.md` /
  `WORKFLOW.md` through the AIP-42 / AIP-15 readers;
- re-run the loaded handles through the same construction path as
  `defineApp`, so the conformance rules re-validate on every load;
- name the offending path in every failure.

## Install and run lifecycle

The reference daemon exposes `app_install`, `app_run`, `app_status`,
`app_stop`, `app_apply` / `app_unapply`, `app_list` / `app_list_applied`
/ `app_uninstall`, `app_catalog`, `app_artifact_get`, `app_skill_get`,
and the data/external/state tools — 22 `app_*` tools in total (see the
AIP's [Reference tooling](/docs/aip-53#reference-tooling-informative)
table). None of these names is normative; the following behaviour is:

- **Install validates before persisting.** The reference install path
  re-loads the bundle, checks the skill surface (`SKILL.md` present,
  non-empty `name`/`description` frontmatter), cross-checks every
  `WORKFLOW.md` `tool` step id against the host's dispatchable tools,
  validates `externalReadRoots` (must exist as real directories), and
  resolves the data dir. It does NOT validate agent-declared `tools[]`
  — surface `unvalidatedAgentTools` on the install result so callers
  know.
- **Run is per-agent sessions.** `app_run` spawns one session per
  selected agent (all by default); an app with zero agents has nothing
  to run — its UI panel is the surface. Sessions are addressable through
  `app_status` / `app_stop`.
- **Apply gates run.** The reference refuses to run an app that isn't
  applied to the requested scope.

## Serving the UI

Three things, all normative in the AIP and all shipped in the reference
implementation:

1. **Static-first.** `.agentproto/ui/index.html` is the entry point;
   relative asset paths only; no server-side routing.
2. **The bridge.** Inject `window.McpApp` (`connect()` →
   `{ callTool, updateModelContext, openLink, onTeardown }`) before the
   page's scripts run. Return the raw MCP `tools/call` envelope from
   `callTool` — unwrapping is the client library's job.
3. **Allowlist enforcement, server-side, every call.** A UI-originated
   call to a tool id absent from the app's `ui.tools[]` MUST be refused
   before dispatch, naming the tool and the full allowlist. This is the
   security boundary — a client-side check is not a boundary.

## The data plane

Implement [The app data
plane](/docs/aip-53#the-app-data-plane-app_data_) verbatim — the
resolution rules (persisted `dataDir`, legacy `data/` collapse under the
default layout, legacy-root fallback, merged listing), the traversal
guard (no absolute paths, no drive-letter prefixes, resolved-target
containment, plus a realpath check so symlinks cannot escape), and the
atomic write (tmp + `rename`, never a partial file). The guard runs on
every call, read and write alike. `app_state_append` never reaches
agent sessions or a UI allowlist by default.

## Packaging

Ship `pack`/`unpack` per [The `.agentapp` package
format](/docs/aip-53#the-agentapp-package-format-agentappv1): aggregate
SHA-256 over sorted concatenated bytes, `node_modules`/`.git` excluded
unconditionally, digest mismatch refuses the unpack.

## Validation checklist

- [ ] `APP.md` frontmatter validates against [`./APP.schema.json`](./APP.schema.json)
- [ ] All nine conformance rules enforced at define-time and load-time
- [ ] UI-only apps (empty `agents`, `ui` present) construct, emit, and install
- [ ] An app with neither agents nor `ui` is refused with a named error
- [ ] Every attachment violation names the dangling ref or orphan
- [ ] `window.McpApp` injected before page scripts; raw envelope returned
- [ ] Allowlist enforced server-side on every UI call
- [ ] Traversal guard rejects `../`, absolute, drive-letter, and symlink-escape paths
- [ ] Writes are atomic (tmp + rename)
