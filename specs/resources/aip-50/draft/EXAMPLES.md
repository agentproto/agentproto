# AIP-50 EXAMPLES.md

Example `AUTH.md` manifests for the `defineAuthProvider` TS-literal and `.md` file paths.

---

## Example 1 — Guilde (service-auth, full)

```yaml
---
id: guilde
description: Guilde AI company platform — authenticate via the service_auth claim ceremony to obtain a scoped OAuth access token.
apiBase: https://api.guilde.work
auth:
  flow: service-auth
  clientId: agentproto-cli
  tokenStore:
    keychain: bureau-guilde
    account: "{server}"
install:
  sealKey: /guilde/api/v1/connectors/seal-key
  secretBacked: /guilde/api/v1/guilds/{guildId}/connectors/secret-backed
---

## Overview

Guilde is the AI company platform. This manifest authenticates the bureau CLI
or any agentproto tool to Guilde's API via the standard auth.md service_auth
claim ceremony. No personal API key is required — open your browser, click
Approve, done.

## Scopes

- `connectors:write` — install credentials via the provision flow
- `api.read` — read workspace and operator data

## Procurement

If the automated flow fails, generate a personal API key at
https://app.guilde.work/settings/api-keys and use `bureau login --token gld_...`.
---
```

---

## Example 2 — Simple PAT provider

```yaml
---
id: widget-cloud
description: Widget Cloud API — personal access token authentication.
apiBase: https://api.widget.cloud
auth:
  flow: pat
  tokenStore:
    keychain: agentproto-widget-cloud
    account: "{server}"
---

## Overview

Widget Cloud uses personal access tokens (PATs) for API authentication.
Generate one at https://app.widget.cloud/settings/tokens and paste it when
the login flow prompts.
---
```

---

## Example 3 — TS-literal builtin (code)

```typescript
import { defineAuthProvider } from "@agentproto/auth"

export const GUILDE_AUTH_PROVIDER = defineAuthProvider({
  id: "guilde",
  description: "Guilde AI company platform",
  apiBase: "https://api.guilde.work",
  auth: {
    flow: "service-auth",
    clientId: "agentproto-cli",
    tokenStore: {
      keychain: "bureau-guilde",
      account: "{server}",
    },
  },
  install: {
    sealKey: "/guilde/api/v1/connectors/seal-key",
    secretBacked: "/guilde/api/v1/guilds/{guildId}/connectors/secret-backed",
  },
})
```

---

## Example 4 — Dynamic discovery (runtime)

```typescript
import { discoverEndpoints, getAuthProvider, runAuthFlow } from "@agentproto/auth"

const server = "https://api.myserver.com"
const provider = getAuthProvider("myserver") // TS builtin as fallback

// Try discovery first; fall back to static manifest on DiscoveryError
let discovered = null
try {
  discovered = await discoverEndpoints(server)
} catch {
  // server doesn't publish /.well-known/oauth-protected-resource — use static config
}

const result = await runAuthFlow(provider, { server, discovered })
// result.identityAssertion or result.accessToken is now available
```
