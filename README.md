# agentproto

Open standards for the AI-agent ecosystem — specifications (AIPs) plus a
reference TypeScript runtime that any agent framework can consume.

> **Status: 0.1.0-alpha.** APIs are stabilising; expect minor breaking
> changes between alpha releases.

## What's in this repo

```
agentproto/
├── packages/
│   ├── tool/                          @agentproto/tool         AIP-14 — defineTool, ToolHandle, validators
│   ├── tooling/                       @agentproto/tooling      Internal: shared TS + tsup config
│   └── provider/
│       ├── core/                      @agentproto/provider     AIP-30 — defineProvider, runTool, implementTool, resolver
│       ├── cli/                       @agentproto/provider-cli AIP-29 — CLI/subprocess specialisation
│       ├── http/                      @agentproto/provider-http  HTTP API specialisation
│       ├── mcp/                       @agentproto/provider-mcp   MCP server specialisation
│       └── sdk/                       @agentproto/provider-sdk   SDK / dynamic-import specialisation
└── adapters/
    ├── mastra/                        @agentproto/adapter-mastra Mastra createTool projection
    └── ai-sdk/                        @agentproto/adapter-ai-sdk Vercel AI SDK Tool projection
```

The two-axis design:

- **Providers** (`packages/provider/<kind>/`) implement TOOL contracts via
  a transport (cli, http, mcp, sdk, builtin). Each is a sibling under
  `provider/`.
- **Adapters** (`adapters/<framework>/`) re-express ToolImplementations
  in a host framework's tool shape. Each is a sibling under `adapters/`.

The test that splits them: does `defineProvider({ kind: "X" })` make
sense? For `cli`/`http`/`mcp`/`sdk`/`builtin` yes — they're transports.
For `mastra`/`ai-sdk` no — they're host frameworks that consume tools.

## Three-layer model

```
ITool        @agentproto/tool        defineTool(...)              the contract (no body)
Tool         @agentproto/provider    implementTool(handle, body)  contract + typed body
Provider     @agentproto/provider    defineProvider({...})        bundle of tools + shared infra
```

Same shape as `IERC20` ↔ `MyToken is IERC20`, ported to TypeScript.

## Getting started

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Author a tool:

```ts
import { defineTool } from "@agentproto/tool"
import { implementTool, defineProvider } from "@agentproto/provider"
import { z } from "zod"

const greetTool = defineTool({
  id: "greet",
  description: "Greets a name in the bound locale.",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ greeting: z.string() }),
  contextSchema: z.object({ locale: z.enum(["en", "fr"]) }),
})

const greetBuiltin = implementTool(greetTool, async ({ input, context }) => ({
  greeting:
    context.locale === "fr" ? `Bonjour ${input.name}` : `Hello ${input.name}`,
}))

const greetProvider = defineProvider({
  id: "greet-builtin",
  name: "Greet (builtin)",
  description: "In-process greeter.",
  kind: "builtin",
  implements: [{ tool: "greet", version: "0.1.0" }],
  implementations: [greetBuiltin],
})
```

Drop the same implementation into AI SDK or Mastra:

```ts
import { toAiSdkTool } from "@agentproto/adapter-ai-sdk"
import { toMastraTool } from "@agentproto/adapter-mastra"

const aiSdkTool = toAiSdkTool(greetBuiltin, { context: { locale: "en" } })
const mastraTool = toMastraTool(greetBuiltin, {
  source: { context: { locale: "en" } },
})
```

## Specifications

The AIP (Agent Improvement Proposals) markdown specs live alongside the
runtime so contract changes and reference implementation evolve in the
same repo. Browse them at <https://agentproto.sh/docs>.

Key specs:

- [AIP-14 — TOOL.md](https://agentproto.sh/docs/aip-14)
- [AIP-30 — PROVIDER.md](https://agentproto.sh/docs/aip-30)
- [AIP-29 — CLI.md](https://agentproto.sh/docs/aip-29)
- [AIP-17 — RUNNER.md](https://agentproto.sh/docs/aip-17)

## License

MIT (code). AIP markdown specifications are CC-BY-4.0 when shipped
alongside.

## Status & roadmap

This is an early open standard. Contributions, feedback, and PRs are
welcome. The roadmap tracks AIP progression at the spec level —
implementations follow as AIPs reach Review/Final status.
