# ADAPTER.md — implementing AIP-32 in a host runtime

Implementer's guide for `kind: mcp` drivers. Inherits all
[AIP-30 ADAPTER](../../../aip-30/draft/ADAPTER.md) responsibilities;
this doc covers MCP-specific dispatch.

## Server lifecycle

Per `server.kind`:

| `kind` | Spawn / connect | Lifecycle |
|---|---|---|
| `binary` | `spawn(server.path, server.args, { stdio: 'pipe', env: { ...host_env, ...server.env } })` | Long-lived subprocess; reused across calls; killed on idle timeout or host shutdown. |
| `npm`    | `spawn('npx', [server.package, ...server.args], { stdio: 'pipe', env })` | Same as binary. |
| `docker` | `docker run -i --rm -e KEY=VALUE server.image server.args` | Docker container with stdin attached for stdio. |
| `remote` | HTTP/SSE connection upgrade to `server.url` | Long-lived connection per driver; reconnect on drop with exponential backoff. |

For local servers (binary/npm/docker stdio), one subprocess per
driver per host process. Multi-tenant routing happens via
`tools/call.arguments` — never bind tenant state at spawn time.

## MCP protocol handshake

After connection:

1. Send `initialize` with `protocolVersion`, `capabilities`,
   `clientInfo`.
2. Wait for server's `initialize` response with its declared
   `capabilities` (tools, prompts, resources).
3. Send `notifications/initialized`.
4. Send `tools/list` and validate each declared `metadata.mcp.tool_name`
   in the driver's `implements[]` exists in the response.
   Mismatches fail the driver at registration.
5. (Optional) Send `prompts/list` and `resources/list` for the
   declared `prompts[]` / `resources[]` registrations.

## tools/call dispatch

```ts
async function dispatchMcp(handle, toolId, args) {
  const impl = handle.implements.find(i => i.toolId === toolId)
  const mcpToolName = impl.metadata.mcp.tool_name
  const mappedArgs = applyArgumentMapping(args.input, impl.metadata.mcp.argument_mapping)
  const response = await handle.mcpClient.callTool({
    name: mcpToolName,
    arguments: mappedArgs,
  })
  if (response.isError) {
    return { ok: false, error: { code: "upstream_error", message: response.content[0]?.text ?? "unknown" } }
  }
  const extracted = extractResponse(response, impl.metadata.mcp.result_extract ?? "$")
  return { ok: true, value: extracted }
}
```

The MCP `tools/call` response is wrapped in `{ content: [...], isError: bool }`.
`result_extract` operates on `response.content[0]` (text content) or
the structured `response.structuredContent` when present.

## Audit

MCP-specific audit fields:

```json
{
  "type": "driver.invoked",
  "kind": "mcp",
  "mcp_tool_name": "read_file",
  "transport": "stdio",
  "server_kind": "npm",
  "duration_ms": 24,
  "ok": true
}
```

## Reference implementation

`packages/mcp-runtime` exposes:

- `defineMcpDriver(...)` (sugar)
- `connectMcpServer(handle)` — spawn or connect per `server.kind` + `transport`
- `callMcpTool(handle, toolName, args)` — wraps `tools/call`
- `listMcpTools(handle)` — wraps `tools/list`
- `subscribeMcpPrompts(handle)` — wraps `prompts/list` + integration

The runtime composes with the official `@modelcontextprotocol/sdk`
client; the AIP layer adds contract validation, schema narrowing,
and registry binding.
