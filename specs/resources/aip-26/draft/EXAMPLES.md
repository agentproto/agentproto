# AIP-26 — Worked examples

Six concrete manifests covering the source variants and run forms. Each is
complete and pasteable.

## 1. Inline-only Mastra tool, sandbox engine

The agent writes a self-contained tool. No external sources. Sandbox runner
because it shells out to `weasyprint`.

```yaml
kind: tool
name: render-pdf
description: Render HTML to PDF via WeasyPrint

code:
  sources:
    - inline:
        path: tool.ts
        content: |
          import { createTool } from "@mastra/core/tools"
          import { z } from "zod"
          import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
          import { execSync } from "node:child_process"
          import { randomUUID } from "node:crypto"
          export default createTool({
            id: "renderPdf",
            inputSchema: z.object({ html: z.string() }),
            outputSchema: z.object({ pdfBase64: z.string() }),
            execute: async ({ html }) => {
              const dir = `/tmp/${randomUUID()}`
              mkdirSync(dir, { recursive: true })
              writeFileSync(`${dir}/in.html`, html)
              execSync(`weasyprint ${dir}/in.html ${dir}/out.pdf`)
              return { pdfBase64: readFileSync(`${dir}/out.pdf`).toString("base64") }
            }
          })
    - inline:
        path: package.json
        content: |
          { "type": "module",
            "dependencies": { "@mastra/core": "^1.13.0", "zod": "^4.0.0" } }

run: tool.ts

runner:
  engine: sandbox
  needs:
    language: node
    native: [weasyprint]
  limits: { memory_mb: 1024, timeout_ms: 60000 }

inputs:
  { type: object, properties: { html: { type: string } }, required: [html] }
outputs: { type: object, properties: { pdfBase64: { type: string } } }

source: { origin: ai-draft }
```

## 2. Python tool with explicit `run` exec form

`run:` as exec ARGV instead of file path. Runner doesn't infer; the manifest
names the command.

```yaml
kind: tool
name: scrape-prices-csv
description: Scrape competitor pricing pages and emit a normalized CSV

code:
  sources:
    - inline:
        path: tool.py
        content: |
          import sys, json, csv, io, base64
          import requests
          from bs4 import BeautifulSoup
          # ... fetch + parse + write CSV ...
    - inline:
        path: requirements.txt
        content: |
          requests==2.31.0
          beautifulsoup4==4.12.0

run: ["python", "tool.py"]

runner:
  engine: sandbox
  needs:
    language: python
  limits: { memory_mb: 512, timeout_ms: 30000 }

network:
  egress: ["*.competitor.com"]

inputs:
  type: object
  properties:
    urls: { type: array, items: { type: string, format: uri } }
  required: [urls]

outputs:
  type: object
  properties:
    csvBase64: { type: string }

source: { origin: ai-draft }
```

## 3. GitHub shell + inline override (overlay pattern)

The agent maintains `mycompany/mastra-tool-shell` as a generic Node project
(package.json, lockfile, lib/). Each downstream tool fetches the shell at a SHA
and overrides only `tool.ts`.

```yaml
kind: tool
name: fetch-customer-orders

code:
  sources:
    - github:
        repo: mycompany/mastra-tool-shell
        ref: 4f3a2b1ca73b5e9f8d2c1a0b3e6f7d4c8b1a2e3f
    - inline:
        path: tool.ts
        content: |
          import { baseTool } from "./lib/base.ts"
          import { z } from "zod"
          import Stripe from "stripe"

          export default baseTool({
            id: "fetchCustomerOrders",
            inputSchema: z.object({ customerId: z.string() }),
            execute: async ({ customerId }) => {
              const stripe = new Stripe(process.env.STRIPE_KEY!)
              const orders = await stripe.charges.list({ customer: customerId })
              return { orders: orders.data }
            }
          })

run: tool.ts

runner:
  engine: sandbox
  needs:
    language: node
    npm: [stripe@^11.0.0] # added on top of the shell's package.json
  limits: { memory_mb: 1024, timeout_ms: 60000 }

secrets:
  STRIPE_KEY: { vault: stripe-api-key }

network:
  egress: [api.stripe.com]

inputs:
  {
    type: object,
    properties: { customerId: { type: string } },
    required: [customerId],
  }
outputs: { type: object, properties: { orders: { type: array } } }

source: { origin: ai-draft }
```

## 4. Tool referencing a shared code-workspace

The team maintains `./shared/render-utils/` as a `kind: code-workspace`.
Multiple tools reference it via the string shorthand, each providing only its
own `run` entry.

### The shared bundle

```yaml
# .code-workspaces/render-utils/manifest.yaml
kind: code-workspace
name: render-utils
description: PDF + image rendering utilities

code:
  sources:
    - github:
        repo: mycompany/render-utils
        ref: v1.4.0
    - local: { path: package-lock.json }

runner:
  engine: sandbox
  needs:
    language: node
    native: [weasyprint, ffmpeg]
  limits: { memory_mb: 2048, timeout_ms: 120000 }

secrets:
  CLOUDINARY_KEY: { vault: cloudinary-api-key }

network:
  egress: [api.cloudinary.com]

source: { origin: workspace }
```

### Two tools that reuse it

```yaml
# .tools/render-invoice/manifest.yaml
kind: tool
name: render-invoice

code: ./code-workspaces/render-utils # string shorthand
run: invoice.ts # bundle-internal entry

inputs:
  {
    type: object,
    properties: { invoiceId: { type: string } },
    required: [invoiceId],
  }
outputs: { type: object, properties: { pdfBase64: { type: string } } }

requiredCapabilities: [finance]
source: { origin: ai-draft }
```

```yaml
# .tools/render-receipt/manifest.yaml
kind: tool
name: render-receipt

code: ./code-workspaces/render-utils
run: receipt.ts

inputs: { type: object, properties: { receiptId: { type: string } } }
outputs: { type: object, properties: { pdfBase64: { type: string } } }

requiredCapabilities: [finance]
source: { origin: ai-draft }
```

Both tools share the same warm sandbox, the same `npm ci`, the same secrets
binding, the same egress allowlist.

## 5. `local` source with directory glob

Tool that includes a workspace directory of templates and a single shared
library file.

```yaml
kind: tool
name: send-templated-email

code:
  sources:
    - inline:
        path: tool.ts
        content: |
          import { createTool } from "@mastra/core/tools"
          import { readFileSync } from "node:fs"
          import { z } from "zod"
          // ... reads ./templates/<name>.html ...
    - local:
        path: shared/lib/render-mustache.ts
        as: lib/render-mustache.ts
    - local:
        path: shared/email-templates/
        as: templates/
        glob: "*.html"
    - inline:
        path: package.json
        content: |
          { "type": "module",
            "dependencies": { "@mastra/core": "^1.13.0", "mustache": "^4.2.0" } }

run: tool.ts

runner:
  engine: subprocess
  needs:
    language: node
  limits: { memory_mb: 512, timeout_ms: 10000 }

inputs:
  type: object
  properties:
    to: { type: string, format: email }
    template: { type: string }
    data: { type: object }
  required: [to, template]

outputs: { type: object, properties: { messageId: { type: string } } }

source: { origin: ai-draft }
```

## 6. Code-workspace composing two upstream sources

A code-workspace that merges a generic shell (github) with guild-specific
patches (local).

```yaml
# .code-workspaces/finance-tools/manifest.yaml
kind: code-workspace
name: finance-tools
description: Finance-team Mastra tools — extends the company shell

code:
  sources:
    - github:
        repo: mycompany/mastra-tool-shell
        ref: v2.0.1
    - local: { path: shared/finance/lib/ }       # adds finance-specific lib
    - local: { path: shared/finance/package.json }  # overrides shell's package.json
    - inline:
        path: config/region.ts
        content: |
          export const REGION = "EU"

runner:
  engine: sandbox
  needs:
    language: node
    npm: [stripe@^11.0.0, @anthropic-ai/sdk@^0.72.0]
  limits: { memory_mb: 1024, timeout_ms: 60000 }

source: { origin: workspace }
```

A finance-specific tool then references this workspace:

```yaml
# .tools/quarterly-report/manifest.yaml
kind: tool
name: quarterly-report

code: ./code-workspaces/finance-tools
run: reports/quarterly.ts

inputs:
  {
    type: object,
    properties: { quarter: { type: string } },
    required: [quarter],
  }
outputs: { type: object, properties: { reportUrl: { type: string } } }

requiredCapabilities: [finance, reports]
source: { origin: ai-draft }
```

The bundle materialization order:

1. github shell at `v2.0.1`
2. `shared/finance/lib/` overlays
3. `shared/finance/package.json` overlays (replaces shell's lockfile companion)
4. inline `config/region.ts` overlays

The tool sees the merged result; `run: reports/quarterly.ts` resolves inside the
merged tarball.
