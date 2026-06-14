# AIP-50 ADAPTER.md — Implementer's Guide

This document walks implementers through building the two sides of AIP-50:

1. **Client side** — adding a new flow engine to `@agentproto/auth`
2. **Server side** — implementing the auth.md discovery surface on a new API server

---

## Adding a new flow engine

A flow engine is a plain object that implements the `FlowEngine` interface.
No base class, no framework. Register it in `FLOW_ENGINES` and dispatch is automatic.

### 1. Define the engine

```typescript
// src/flow-engines/my-flow.ts
import type { FlowEngine, FlowResult, FlowRunOptions, AuthProviderHandle, DiscoveredEndpoints } from "../types.js"

export const myFlowEngine: FlowEngine = {
  id: "my-flow",
  async run(
    provider: AuthProviderHandle,
    discovered: DiscoveredEndpoints | null,
    opts: FlowRunOptions,
  ): Promise<FlowResult> {
    // 1. Use discovered endpoints if available, fall back to static provider.apiBase
    const base = discovered?.authServerBase ?? provider.apiBase

    // 2. Do your auth ceremony
    const token = await doSomething(base, opts.server)

    // 3. Return FlowResult — the caller stores the credential
    return { accessToken: token, tokenKind: "oat" }
  },
}
```

### 2. Register it

```typescript
// src/flow-engines/index.ts
import { myFlowEngine } from "./my-flow.js"

export const FLOW_ENGINES: Readonly<Record<string, FlowEngine>> = {
  pat: patFlowEngine,
  "service-auth": serviceAuthFlowEngine,
  "my-flow": myFlowEngine,   // ← add here
}
```

### 3. Add the discriminant to `AuthConfig`

Extend the `AuthConfig` union in `src/types.ts`:

```typescript
export interface MyFlowAuthConfig {
  flow: "my-flow"
  tokenStore: TokenStoreSpec
  // … any flow-specific fields
}

export type AuthConfig = PATAuthConfig | ServiceAuthConfig | MyFlowAuthConfig
```

Extend the Zod schema in `src/schema.ts` to match.

---

## Implementing auth.md on a server

To make your API server discoverable by `@agentproto/auth`, expose these
three endpoints. They are all static (or near-static) JSON responses.

### `GET /.well-known/oauth-protected-resource` (PRM)

```json
{
  "resource": "https://api.yourserver.com/",
  "resource_name": "Your Server",
  "resource_logo_uri": "https://yourserver.com/logo.png",
  "authorization_servers": ["https://auth.yourserver.com/"],
  "scopes_supported": ["api.read", "api.write"],
  "bearer_methods_supported": ["header"]
}
```

If your API and auth server are on the same host, both URLs can be the same.

### `GET /.well-known/oauth-authorization-server` (AS metadata)

```json
{
  "issuer": "https://auth.yourserver.com",
  "token_endpoint": "https://auth.yourserver.com/oauth/token",
  "revocation_endpoint": "https://auth.yourserver.com/oauth/revoke",
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "urn:workos:agent-auth:grant-type:claim"
  ],
  "agent_auth": {
    "skill": "https://yourserver.com/auth.md",
    "identity_endpoint": "https://auth.yourserver.com/agent/identity",
    "claim_endpoint": "https://auth.yourserver.com/agent/identity/claim",
    "identity_types_supported": ["service_auth"],
    "identity_assertion": {
      "assertion_types_supported": []
    },
    "events_supported": []
  }
}
```

### `POST /agent/identity` (registration)

Accept `{ type: "service_auth", login_hint?: string }` and respond with:

```json
{
  "registration_id": "reg_...",
  "registration_type": "service_auth",
  "claim_token": "clm_...",
  "claim_token_expires": "2026-06-13T18:00:00.000Z",
  "post_claim_scopes": ["api.read", "api.write"],
  "claim": {
    "user_code": "ABC-1234",
    "expires_in": 600,
    "verification_uri": "https://auth.yourserver.com/cli/auth?code=ABC1234",
    "interval": 5
  }
}
```

Internally this wraps your existing device-authorization flow. The
`claim_token` is opaque state your server tracks; the `user_code` is
displayed to the user.

### `POST /oauth/token` (claim polling + assertion exchange)

Handle two grant types:

**Claim ceremony poll:**
```
grant_type=urn:workos:agent-auth:grant-type:claim
&claim_token=<clm_...>
```
Return `{ error: "authorization_pending" }` while the user hasn't approved.
On approval, return:
```json
{
  "access_token": "oat_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "api.read api.write",
  "identity_assertion": "<signed JWT>",
  "assertion_expires": "2026-06-13T19:00:00.000Z"
}
```

The `identity_assertion` is a short-lived JWT signed by your server, carrying
`{ sub: userId, aud: apiBase, iat, exp: now+3600 }`. The client stores this
assertion and re-exchanges it for a fresh `access_token` when needed.

**Assertion exchange (refresh path):**
```
grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
&assertion=<identity_assertion JWT>
&resource=https://api.yourserver.com/
```
Validate the JWT, return a new `access_token`. No `refresh_token` needed —
this IS the refresh path.

### `GET /auth.md`

Serve a human + machine readable description of the above flows. The
[auth.md standard template](https://github.com/workos/auth.md) is a good
starting point — substitute your real endpoint URLs.

---

## Keychain write on non-macOS platforms

The reference implementation uses `security add-generic-password` (macOS).
On other platforms:

| Platform | Command |
|----------|---------|
| Linux    | `secret-tool store --label='…' service <keychain> account <account>` |
| Windows  | `cmdkey /generic:<keychain> /user:<account> /pass:<token>` |

Implementations SHOULD use the platform's native Keychain API via N-API
bindings rather than shelling out to reduce argv leakage risk.
