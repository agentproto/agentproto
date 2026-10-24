# EXAMPLES.md — AIP-53 app/v1 in practice

Worked examples for the surfaces this AIP fixes. Every example round-trips
against [`./APP.schema.json`](./APP.schema.json) and the reference
implementation (`packages/app`, `packages/runtime`).

## 1. A UI-only app (empty `agents`, `ui` present)

The conformance rule legalised in the spec: `agents` MUST be non-empty
UNLESS `ui` is present. This is how the five daemon builtin panels ship
(`packages/apps/src/index.ts:14-20` — `agents: []`, UI-only).

```md
---
schema: app/v1
id: '@acme/pipeline-dashboard'
name: Pipeline Dashboard
version: 0.1.0
agents: []
ui:
  path: .agentproto/ui/index.html
  title: Pipeline Dashboard
  tools:
    - app_list
    - app_status
    - app_data_read
    - app_data_write
---

Live view of pipeline runs, backed entirely by the app data plane.
```

- `defineApp({ agents: [], ui: { html: "<html>…" } })` constructs — no error.
- `defineApp({ agents: [] })` (no `ui`) throws; so does `defineApp({})`.
- A UI-only app bundles zero workflows: a bundled workflow with no
  referencing agent would be an orphan (attachment invariant, rule 3).
- `ui.tools[]` is the UI's entire reach; the host enforces it on every
  call, server-side.

## 2. Declaring a data dir hint

`data` names where the app's durable data lives, relative to the app
dir. It is a hint — an explicit `dataDir` at install time overrides it.

```md
---
schema: app/v1
id: '@acme/trip-planner'
version: 0.1.0
agents:
  - id: '@acme/trip-scout'
    path: .agentproto/agents/trip-scout/AGENT.md
data:
  dir: "data"
category: travel
---
```

`category` is freeform — hosts surface it in catalogs/trees but MUST NOT
validate it against a fixed enum.

## 3. Data-plane addressing under the default layout

With `dataDir = <appDir>/data` (the default), both spellings name the
same file — the legacy `data/` prefix collapses:

| App-relative path | Resolves to |
|---|---|
| `trips/x.json` | `<appDir>/data/trips/x.json` |
| `data/trips/x.json` | `<appDir>/data/trips/x.json` (same file) |
| `../secret` | **rejected** — traversal |
| `/etc/passwd` | **rejected** — absolute |
| `C:temp/x` | **rejected** — drive-letter prefix |
| `docs/link.json` → symlink to `/etc/passwd` | **rejected** — realpath escapes the root |

A path that does not exist under `dataDir` but exists under the app's
source dir (a pre-`dataDir` install) still resolves there — writes
update it in place — and `app_data_list` merges both views, data-dir
entries winning on name clashes.

## 4. An atomic write, observed

`app_data_write { appId, path: "dossiers/42/job.json", content: {...} }`
creates parents, writes `<target>.tmp.<pid>`, then renames it over
`job.json`. A concurrent `app_data_read` sees either the previous
contents or the complete new ones — never a partial file. `.json` paths
are pretty-printed on write and parsed on read (raw text fallback when
the bytes do not parse).

## 5. Setup steps: Pygmalion as the reference app

An app that needs a model login, a Telegram bot paired to the user, and a
choice of cloud computer. Order matters: the choice comes first so later
steps can branch on it with `when`; the two Telegram steps are `optional`
so the app is `ready` without them.

```md
---
schema: app/v1
id: '@pygmalion/app'
name: Pygmalion
version: 0.4.0
agents: []
ui:
  path: .agentproto/ui/index.html
  title: Pygmalion
  tools: []
setup:
  - id: auth-profile
    kind: auth-profile
    title: A model subscription
    description: Pygmalion bills its own work against one login profile.
    min: 1
  - id: telegram-bot-token
    kind: prompt
    type: secret
    optional: true
    prompt: Telegram bot token (create one with @BotFather)
    persist: { secret_slug: pygmalion/telegram-bot-token }
  - id: telegram-pairing
    kind: pairing
    channel: telegram
    display: qr
    optional: true
    when: { step: telegram-bot-token, done: true }
    description: Scan the QR in Telegram, then press Start.
  - id: cloud-computer
    kind: choice
    prompt: Cloud computer
    options:
      - { value: none, label: None, description: Everything runs on this machine. }
      - { value: e2b, label: E2B, description: Use your own E2B account. }
      - { value: pygmalion-cloud, label: PygmalionCloud, description: Managed cloud computer. }
    default: pygmalion-cloud
    persist: { answer: cloud.provider }
  - id: e2b-api-key
    kind: prompt
    type: secret
    prompt: E2B API key
    when: { step: cloud-computer, equals: e2b }
    persist: { secret_slug: pygmalion/e2b-api-key }
  - id: pygmalion-cloud-login
    kind: oauth
    secret_slug: pygmalion/cloud-token
    when: { step: cloud-computer, equals: pygmalion-cloud }
  - id: bot-ready
    kind: check
    severity: warn
    when: { step: telegram-pairing, done: true }
    check:
      tool: { id: telegram_bot_token_status, expect: { configured: true } }
---

Pygmalion's configuration surface.
```

What a conforming host does:

- `agentproto app install @pygmalion/app` records the install, then
  reports `setupState: "required"` with `auth-profile` and `cloud-computer`
  pending (the two Telegram steps are `optional`; `e2b-api-key` /
  `pygmalion-cloud-login` are not applicable until `cloud-computer` is
  answered). `app_run` is refused with `setup_required` until those two
  are complete.
- Interactively, the host walks the steps in order. With `--yes`, it
  answers `cloud-computer` with its `default` (`pygmalion-cloud`), cannot
  answer the `auth-profile` or `oauth` steps without a human, and stops
  with `setup_required` and the pending list. It never hangs.
- No `cmd` step is present, so no `--allow-setup-cmd` consent is needed.
- Choosing `e2b` instead makes `pygmalion-cloud-login` `not-applicable`
  and `e2b-api-key` pending. The answer is recorded as
  `answers.cloud.provider = "e2b"`; the key lands in the secret slot and
  never in the ledger.
- `agentproto app setup @pygmalion/app --only cloud-computer --force`
  changes the choice later; steps depending on it are re-evaluated.
- Releasing 0.5.0 with one new step re-asks only that step (its
  fingerprint is new); every step the user already completed stays done.
