# EXAMPLES.md — CLI.md reference patterns

Reference `CLI.md` files exemplifying common patterns. Each example is a
self-contained bundle a host could load as-is. Authors should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Cloud CLI with browser-callback auth (gh)](#1-cloud-cli-with-browser-callback-auth-gh)
2. [API-key CLI with simple env auth (stripe)](#2-api-key-cli-with-simple-env-auth-stripe)
3. [Pure binary, no auth (ffmpeg)](#3-pure-binary-no-auth-ffmpeg)
4. [Vendored CLI with custom output parser (legacy)](#4-vendored-cli-with-custom-output-parser-legacy)
5. [CLI with TTY-required auth flow (kubectl + krew)](#5-cli-with-tty-required-auth-flow-kubectl--krew)

---

## 1. Cloud CLI with browser-callback auth (gh)

The canonical case: third-party CLI with multiple install paths, browser-based
auth, structured JSON output, and a tree of subcommands.

```md
---
name: GitHub CLI
id: gh
description:
  GitHub command-line interface — operate PRs, issues, releases, repos, and
  gists from a single binary against any GitHub host (github.com or GHES).
version: 1.0.0
bin: gh
install:
  - { method: brew,     package: gh }
  - { method: apt,      package: gh }
  - { method: choco,    package: gh }
  - { method: download, url: "https://github.com/cli/cli/releases/download/v2.40.0/gh_2.40.0_linux_amd64.tar.gz", extract_bin: "gh_2.40.0_linux_amd64/bin/gh", verify_sha256: "abc123def456…" }
version_check:
  cmd: "gh --version"
  parse: 'gh version (\S+)'
  range: ">=2.40 <3"
auth:
  ref: ./SECRETS.md
  state:
    paths: ["~/.config/gh"]
    env:   ["GH_TOKEN", "GITHUB_TOKEN"]
  login:
    cmd: "gh auth login --web"
    interactive: true
    completes_when:
      cmd: "gh auth status"
      exit_code: 0
  refresh:
    cmd: "gh auth refresh -s repo,read:org"
    every: "PT24H"
  expiry:
    detect: "exit_code:4"
sandbox:
  network:
    egress:
      - api.github.com
      - github.com
      - "*.githubusercontent.com"
  fs:
    read:  ["**/.git/**", "~/.config/gh/**"]
    write: ["~/.config/gh/**"]
    deny:  ["~/.ssh/**"]
  exec:
    allow: true
    spawn: ["git"]
  env:
    pass: ["GH_TOKEN", "GITHUB_TOKEN", "HOME"]
    set:
      GH_PROMPT_DISABLED: "1"
output:
  default_format: text
  json_flag: "--json"
  json_flag_args: ["number,title,body,state,author"]
  exit_codes:
    0: ok
    1: error
    2: usage_error
    4: auth_required
  stream: stdout
  error_stream: stderr
commands:
  pr:
    create: ./tools/pr-create/TOOL.md
    list:   ./tools/pr-list/TOOL.md
    merge:  ./tools/pr-merge/TOOL.md
    view:   ./tools/pr-view/TOOL.md
  issue:
    list:   ./tools/issue-list/TOOL.md
    view:   ./tools/issue-view/TOOL.md
    create: ./tools/issue-create/TOOL.md
  auth:
    status: ./tools/auth-status/TOOL.md
intents:
  - { ref: ./intents/open-pr/INTENT.md }
  - { ref: ./intents/triage-issues/INTENT.md }
tags: [git, github, devops]
examples:
  - { goal: "list open PRs",   cmd: "gh pr list --state open --json number,title" }
  - { goal: "merge PR #42",    cmd: "gh pr merge 42 --squash --delete-branch" }
  - { goal: "view issue #100", cmd: "gh issue view 100" }
---

## When to reach for this CLI

Use `gh` whenever the agent needs to operate against a GitHub repo or org —
list/merge PRs, triage issues, manage releases, fetch repo metadata. Prefer
it over raw `git` for any operation that touches GitHub's web surface.

## Gotchas

- `gh auth refresh -s <new-scope>` is required after asking for a new scope;
  the existing token does not auto-upgrade.
- `gh --json <fields>` requires the comma-list to be supplied; bare `--json`
  errors. `output.json_flag_args` declares the default.
- `gh` shells out to `git`; `sandbox.exec.spawn: [git]` allowlists this.
```

---

## 2. API-key CLI with simple env auth (stripe)

Stripe CLI uses a single API key from the environment. No browser flow,
no refresh, just an env var resolved from a vault.

```md
---
name: Stripe CLI
id: stripe
description:
  Stripe command-line tool — list/create payments, products, customers,
  subscriptions, and webhooks from a single binary against any Stripe
  account (live or test).
version: 1.0.0
bin: stripe
install:
  - { method: brew, package: stripe/stripe-cli/stripe }
  - { method: apt,  package: stripe }
  - { method: choco, package: stripe }
  - { method: download, url: "https://github.com/stripe/stripe-cli/releases/download/v1.20.0/stripe_1.20.0_linux_x86_64.tar.gz", extract_bin: "stripe", verify_sha256: "789abc…" }
version_check:
  cmd: "stripe --version"
  parse: 'stripe version (\S+)'
  range: ">=1.18 <2"
auth:
  ref: ./SECRETS.md
  state:
    env: ["STRIPE_API_KEY", "STRIPE_DEVICE_NAME"]
  expiry:
    detect: "exit_code:1"             # stripe doesn't have a dedicated auth code
sandbox:
  network:
    egress:
      - api.stripe.com
      - stripe.com
  fs:
    read:  []
    write: []
  exec:
    allow: false
  env:
    pass: ["STRIPE_API_KEY", "STRIPE_DEVICE_NAME"]
output:
  default_format: text
  json_flag: "--json"                 # supported on most subcommands
  exit_codes:
    0: ok
    1: error
  stream: stdout
  error_stream: stderr
commands:
  customers:
    list:   ./tools/customers-list/TOOL.md
    create: ./tools/customers-create/TOOL.md
  products:
    list:   ./tools/products-list/TOOL.md
    create: ./tools/products-create/TOOL.md
  prices:
    list:   ./tools/prices-list/TOOL.md
    create: ./tools/prices-create/TOOL.md
  invoices:
    list:   ./tools/invoices-list/TOOL.md
    send:   ./tools/invoices-send/TOOL.md
tags: [billing, stripe, payments]
examples:
  - { goal: "list customers",       cmd: "stripe customers list --limit 20" }
  - { goal: "create product",       cmd: "stripe products create --name 'Pro plan'" }
  - { goal: "send invoice",         cmd: "stripe invoices send in_1ABC" }
---

## When to reach for this CLI

Use `stripe` for ad-hoc reads (listing customers, debugging webhooks) and
for one-shot administrative writes the dashboard supports awkwardly
(bulk operations, programmatic invoice sends). Prefer the SDK for
production write paths.

## Gotchas

- `STRIPE_API_KEY` MUST start with `sk_test_` or `sk_live_`. The bundle
  doesn't validate the prefix; the host SHOULD route test vs live keys
  via separate auth refs.
- `--json` works on most subcommands but not all. When a subcommand
  doesn't support it, the runner falls back to text and surfaces a
  warning; the per-subcommand TOOL.md MUST declare `output.format: text`
  to opt out.
```

---

## 3. Pure binary, no auth (ffmpeg)

Some CLIs are stateless utilities — no auth, no config, just transform
inputs. The bundle skips the `auth:` block entirely.

```md
---
name: FFmpeg
id: ffmpeg
description:
  FFmpeg media transcoder — read and write virtually any audio/video
  format. Used for trimming, resizing, transcoding, extracting frames,
  and stream remuxing.
version: 1.0.0
bin: ffmpeg
install:
  - { method: brew,   package: ffmpeg }
  - { method: apt,    package: ffmpeg }
  - { method: choco,  package: ffmpeg }
  - { method: scoop,  package: ffmpeg }
version_check:
  cmd: "ffmpeg -version"
  parse: 'ffmpeg version (\S+)'
  range: ">=4.4"
sandbox:
  network:
    egress: []                      # works fully offline
  fs:
    read:  ["**/*.mp3", "**/*.mp4", "**/*.mov", "**/*.wav", "**/*.webm", "**/*.mkv"]
    write: ["**/*.mp3", "**/*.mp4", "**/*.mov", "**/*.wav", "**/*.webm", "**/*.mkv", "**/*.gif", "**/*.png", "**/*.jpg"]
  exec:
    allow: false
  env:
    pass: ["HOME", "TMPDIR"]
output:
  default_format: text
  exit_codes:
    0: ok
    1: error
  stream: stderr                    # ffmpeg writes progress + output info to stderr
  error_stream: stderr              # same channel; classification is by exit code
commands:
  transcode: ./tools/ffmpeg-transcode/TOOL.md
  trim:      ./tools/ffmpeg-trim/TOOL.md
  resize:    ./tools/ffmpeg-resize/TOOL.md
  extract-frames: ./tools/ffmpeg-extract-frames/TOOL.md
  concat:    ./tools/ffmpeg-concat/TOOL.md
tags: [media, audio, video, transcoding, offline]
examples:
  - { goal: "transcode mp4 → mp3", cmd: "ffmpeg -i input.mp4 -vn -ab 192k output.mp3" }
  - { goal: "trim 0:10 → 1:30",    cmd: "ffmpeg -i input.mp4 -ss 00:00:10 -to 00:01:30 -c copy output.mp4" }
  - { goal: "resize to 720p",      cmd: "ffmpeg -i input.mp4 -vf scale=-1:720 output.mp4" }
---

## When to reach for this CLI

Any time the agent needs to transform media. ffmpeg is unmatched at format
breadth; reach for it before alternatives unless a specific use-case
demands a wrapper (whisper for transcription, yt-dlp for downloads).

## Gotchas

- ffmpeg writes ALL output to stderr — including progress, codec info, and
  errors. `output.stream: stderr` declares this; the runner reads stderr
  for both happy and sad paths and uses exit code to classify.
- ffmpeg is single-threaded by default. For batch jobs, the host SHOULD
  parallelise with `xargs` or per-file invocations rather than relying on
  ffmpeg's `-threads` flag.
- Some codec features depend on build-time options (`--enable-libx264`).
  The bundle's tools SHOULD declare codec needs in their own TOOL.md and
  fail-fast when the installed build lacks them.
```

---

## 4. Vendored CLI with custom output parser (legacy)

A legacy in-house CLI shipped as a binary in the workspace. No package
manager, custom output format, manual parsing via a `defineCli` entry.

`CLI.md`:

```md
---
name: Acme Legacy CLI
id: acme-legacy
description:
  In-house tool for manipulating the Acme inventory system. Vendored
  binary; no public install. Custom output format requires the entry
  parser to read.
version: 1.0.0
bin: acme
install:
  - { method: vendored, path: "./bin/acme" }
version_check:
  cmd: "./bin/acme --version"
  parse: 'AcmeCLI v(\S+)'
  range: ">=3.2 <4"
auth:
  ref: ./SECRETS.md
  state:
    env: ["ACME_TOKEN"]
sandbox:
  network:
    egress: ["acme-internal.corp"]
  fs:
    read:  ["./inventory/**"]
    write: ["./inventory/**"]
  exec:
    allow: false
  env:
    pass: ["ACME_TOKEN"]
output:
  default_format: text                # acme writes pseudo-CSV; entry parses
  exit_codes:
    0: ok
    1: error
    2: validation_error
    7: stale_inventory
  stream: stdout
  error_stream: stderr
commands:
  inventory:
    list:    ./tools/inventory-list/TOOL.md
    update:  ./tools/inventory-update/TOOL.md
    audit:   ./tools/inventory-audit/TOOL.md
tags: [internal, acme, legacy]
---

## When to reach for this CLI

Internal-only — Acme inventory ops where the new HTTP API doesn't yet
expose the legacy field set. Migrate to the HTTP API as soon as the
needed endpoints exist; this bundle exists to bridge the gap, not to
last forever.
```

`cli.ts` (custom output parser):

```ts
import { defineCli } from "@agentproto/cli-runtime"

export default defineCli({
  id: "acme-legacy",
  name: "Acme Legacy CLI",
  description: "In-house tool for the Acme inventory system.",
  bin: "./bin/acme",
  parseOutput: ({ exitCode, stdout, stderr, expected }) => {
    void expected
    if (exitCode === 0) {
      // acme writes pseudo-CSV: pipe-delimited, escaped backticks for cells
      const rows = stdout
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => line.split("|").map(cell => cell.replace(/`(.)/g, "$1")))
      return { ok: true, value: rows }
    }
    if (exitCode === 7) {
      return { ok: false, error: { code: "stale_inventory", message: stderr.trim(), retryable: true } }
    }
    if (exitCode === 2) {
      return { ok: false, error: { code: "input_invalid", message: stderr.trim() } }
    }
    return { ok: false, error: { code: "upstream_error", message: stderr.trim() || "unknown" } }
  },
})
```

---

## 5. CLI with TTY-required auth flow (kubectl + krew)

Some CLIs need a real terminal for auth. `kubectl` itself doesn't, but
its OIDC plugin (`kubectl oidc-login`) opens a browser AND requires a
TTY for input. Bundle declares both.

```md
---
name: kubectl
id: kubectl
description:
  Kubernetes command-line client — operate against any Kubernetes
  cluster. Bundle assumes OIDC auth via kubectl-oidc-login plugin; for
  static-token auth, fork or override sandbox.
version: 1.0.0
bin: kubectl
install:
  - { method: brew,    package: kubernetes-cli }
  - { method: apt,     package: kubectl }
  - { method: choco,   package: kubernetes-cli }
  - { method: download, url: "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl", extract_bin: "kubectl", verify_sha256: "def456…" }
version_check:
  cmd: "kubectl version --client --output=json"
  parse: '"gitVersion":"v(\S+?)"'
  range: ">=1.28 <1.32"
auth:
  ref: ./SECRETS.md
  state:
    paths: ["~/.kube"]
    env:   ["KUBECONFIG"]
  login:
    cmd: "kubectl oidc-login get-token --oidc-issuer-url=$OIDC_ISSUER --oidc-client-id=$OIDC_CLIENT_ID"
    interactive: true
    completes_when:
      cmd: "kubectl auth whoami"
      exit_code: 0
  refresh:
    cmd: "kubectl oidc-login get-token --token-cache-dir=~/.kube/cache/oidc-login --refresh"
    every: "PT8H"
  expiry:
    detect: "exit_code:1"             # kubectl uses 1 for both errors and auth
sandbox:
  network:
    egress:
      - "*.googleapis.com"            # GKE
      - "*.eks.amazonaws.com"         # EKS
      - "*.azmk8s.io"                 # AKS
      - "kube-apiserver.*"            # generic
  fs:
    read:  ["~/.kube/**"]
    write: ["~/.kube/**"]
    deny:  ["~/.ssh/**", "/etc/**"]
  exec:
    allow: true
    spawn: ["kubectl-oidc-login"]      # plugin invocation
  env:
    pass: ["KUBECONFIG", "OIDC_ISSUER", "OIDC_CLIENT_ID", "HOME"]
  tty:
    required: true                    # OIDC plugin reads from stdin during login
output:
  default_format: text
  json_flag: "-o"
  json_flag_args: ["json"]            # kubectl uses positional value: -o json
  exit_codes:
    0: ok
    1: error
  stream: stdout
  error_stream: stderr
commands:
  get:      ./tools/kubectl-get/TOOL.md
  describe: ./tools/kubectl-describe/TOOL.md
  logs:     ./tools/kubectl-logs/TOOL.md
  apply:    ./tools/kubectl-apply/TOOL.md
  delete:   ./tools/kubectl-delete/TOOL.md
  exec:     ./tools/kubectl-exec/TOOL.md
tags: [kubernetes, devops, sre]
examples:
  - { goal: "list pods in namespace prod", cmd: "kubectl get pods -n prod -o json" }
  - { goal: "tail logs for pod foo",       cmd: "kubectl logs -f foo -n prod" }
---

## When to reach for this CLI

Any time the agent needs to interrogate or modify a Kubernetes cluster.
The bundle's tools cover read, describe, logs, and gated apply/delete;
hosts SHOULD treat `apply`/`delete`/`exec` as `risk_level: 2+` and
require explicit approval per [AIP-7](/docs/aip-7).

## Gotchas

- OIDC `kubectl-oidc-login` plugin must be on `$PATH`. The host SHOULD
  bundle it as a sibling install or refuse with `tool_unavailable`.
- `tty.required: true` means the host MUST allocate a PTY for login.
  Headless hosts (CI, server) need a service-account fallback — fork
  this bundle and replace `auth.login` with a token-based flow.
- The exit-code mapping is coarse (`1: error` covers everything bad).
  Per-subcommand TOOL.md SHOULD parse stderr to surface specific
  diagnostics (e.g. `not_found`, `forbidden`).
```

---

## Anti-patterns

A few things authors are tempted to do but should NOT:

- **Wildcard everything in `sandbox.network.egress`.** A bundle that
  declares `egress: ["*"]` defeats the point. Be specific. If the CLI
  truly needs the open internet, document why in the body and consider
  whether tools using it should require `risk_level: 2+`.

- **Shell metacharacters in subcommand `argv`.** Bundles MUST NOT
  rely on `&&`, `|`, `;`, `>`. Compose multi-step invocations via
  [WORKFLOW.md (AIP-15)](/docs/aip-15). Each subcommand is a single
  process invocation.

- **Embedding secrets in `examples`.** The `examples` block is
  documentation; values appear in catalog UIs and LLM contexts. Use
  placeholder values (`<TOKEN>`, `sk_test_…`) and never real keys.

- **Skipping `verify_sha256` for `curl` / `download` installs.**
  Production hosts MUST decline these without a hash. CI tooling MAY
  warn; bundles SHOULD always supply.

- **Forgetting `state` paths in `auth`.** The CLI's stateful auth
  files (`~/.config/gh`, `~/.aws/credentials`, `~/.kube`) MUST appear
  in `auth.state.paths` AND in `sandbox.fs.read`/`write`. Otherwise
  the login flow appears to succeed but state never persists.
