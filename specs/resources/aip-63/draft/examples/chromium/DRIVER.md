---
name: chromium
id: chromium
description: Playwright-managed Chromium launched in process by an SDK function, with a CDP endpoint, downloads, video recording and a persistent profile stored by the host. Illustrative manifest with synthetic values.
version: 1.0.0
kind: sdk
package: "@agentproto/adapter-browser-chromium"
package_manager: npm
function_ref: launch
install:
  - method: npm
    package: "@agentproto/adapter-browser-chromium"
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
  - tool: browser.profile.refresh
    version: "^1.0.0"
  - tool: browser.profile.revoke
    version: "^1.0.0"
requires:
  os: [darwin, linux]
browser:
  location: local
  display: [headless, headed]
  instances: multi
  endpoints:
    cdp:
      discovered: true
  capabilities:
    cdp: true
    downloads: true
    recording: video
    stealth: false
    fullPageScreenshot: true
    trustedInput: true
    multiTarget: true
    aiActions: false
    cookies: true
    storageState: true
    persistentProfile: true
  profiles:
    modes: [ephemeral, persistent, import, native-login]
    storedBy: host
  lifecycle:
    launch:
      idempotent: true
      budgetMs: 60000
    health:
      intervalMs: 5000
    stop:
      graceMs: 3000
    supervision:
      crashLoop:
        maxFailures: 3
        windowMs: 300000
      orphanMarker: "--agentproto-instance=chromium"
  conformance: [core, interaction, network, download, profile]
---

## When to reach for this driver

Local automation that needs network inspection over CDP, video, or
several isolated instances. The CDP URL is only known after launch, so
the manifest declares `endpoints.cdp.discovered: true`.
