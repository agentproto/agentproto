---
name: camofox
id: camofox
description: A stealth-oriented Firefox variant driven through a local REST service on loopback. There is no CDP endpoint, so network inspection tools are unsupported and return browser:unsupported naming the cdp capability. Illustrative manifest with synthetic values.
version: 1.0.0
kind: http
endpoint: http://127.0.0.1:9377
implements:
  - tool: browser.navigate
    version: "^1.0.0"
  - tool: browser.evaluate
    version: "^1.0.0"
  - tool: browser.get_dom
    version: "^1.0.0"
  - tool: browser.screenshot
    version: "^1.0.0"
  - tool: browser.click
    version: "^1.0.0"
  - tool: browser.fill
    version: "^1.0.0"
  - tool: browser.download
    version: "^1.0.0"
  - tool: browser.tabs
    version: "^1.0.0"
  - tool: browser.profile.list
    version: "^1.0.0"
  - tool: browser.profile.refresh
    version: "^1.0.0"
  - tool: browser.profile.revoke
    version: "^1.0.0"
network:
  egress: ["*"]
policy_tags: [self-hosted]
browser:
  location: local
  display: [headless, headed]
  instances: single
  endpoints:
    rest:
      url: http://127.0.0.1:9377
  capabilities:
    cdp: false
    downloads: true
    recording: none
    stealth: true
    fullPageScreenshot: false
    trustedInput: false
    multiTarget: true
    aiActions: false
    cookies: true
    storageState: true
    persistentProfile: true
  profiles:
    modes: [ephemeral, persistent, import, native-login]
    storedBy: provider
  lifecycle:
    launch:
      idempotent: true
      budgetMs: 120000
      progressWindowMs: 10000
    health:
      path: /health
      intervalMs: 10000
      timeoutMs: 5000
    stop:
      graceMs: 5000
    supervision:
      crashLoop:
        maxFailures: 3
        windowMs: 300000
      orphanMarker: "--agentproto-instance=camofox"
      idleReapMs: 300000
  conformance: [core, interaction, download, profile]
---

## When to reach for this driver

Sites that block stock automation builds. `list_requests`,
`get_request_body` and `cdp_send` are absent from `implements` and the
`cdp` flag is false, so a call that needs them fails with
`browser:unsupported` and `cause.capability: "cdp"`.

## Gotchas

The provider keeps its own session jar (`profiles.storedBy: provider`).
The host's at-rest protections do not cover it (see Security
considerations in AIP-63).
