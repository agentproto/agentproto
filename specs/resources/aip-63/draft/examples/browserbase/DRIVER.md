---
name: browserbase
id: browserbase
description: A hosted browser service reached over HTTPS. A session create call returns a CDP connect URL. The provider is a credential sink, so any session material sent to it needs an explicit remote sink acknowledgement. Illustrative manifest with synthetic values; not a statement about any vendor's real capabilities.
version: 1.0.0
kind: http
endpoint: https://browser-service.example.test
auth:
  ref: ./SECRETS.md
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
  - tool: browser.list_requests
    version: "^1.0.0"
  - tool: browser.get_request_body
    version: "^1.0.0"
  - tool: browser.cdp_send
    version: "^1.0.0"
  - tool: browser.tabs
    version: "^1.0.0"
  - tool: browser.profile.list
    version: "^1.0.0"
  - tool: browser.profile.revoke
    version: "^1.0.0"
network:
  egress: ["browser-service.example.test"]
region: [EU]
policy_tags: [third-party-service]
browser:
  location: remote
  display: [headless]
  instances: multi
  endpoints:
    rest:
      url: https://browser-service.example.test
    cdp:
      discovered: true
  capabilities:
    cdp: true
    downloads: false
    recording: video
    stealth: true
    fullPageScreenshot: true
    trustedInput: true
    multiTarget: true
    aiActions: false
    cookies: true
    storageState: false
    persistentProfile: false
  profiles:
    modes: [ephemeral, import]
    storedBy: provider
  lifecycle:
    launch:
      idempotent: true
      budgetMs: 30000
    health:
      path: /v1/status
      intervalMs: 15000
    stop:
      graceMs: 5000
    supervision:
      crashLoop:
        maxFailures: 3
        windowMs: 300000
      orphanMarker: "agentproto-instance=browserbase"
  sinks:
    - id: browser-service
      kind: remote
      operator: Example Browser Service Inc.
      region: [EU]
      ack: required
  conformance: [core, interaction, network, profile]
---

## When to reach for this driver

Hosted, disposable browsers when no local machine is available.
Injecting a granted cookie into an instance is refused until the human
has acknowledged the `browser-service` sink (rule C6).
