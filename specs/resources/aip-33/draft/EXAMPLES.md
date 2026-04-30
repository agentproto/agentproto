# EXAMPLES.md — SDK provider patterns

Reference `PROVIDER.md` files for `kind: sdk`. Each loads an in-process
package and dispatches contracts to its named functions.

## Patterns covered

1. [Object-arg npm SDK (OpenAI)](#1-object-arg-npm-sdk-openai)
2. [Workspace-local SDK (self-hosted SDXL)](#2-workspace-local-sdk-self-hosted-sdxl)
3. [Python SDK with constructor auth (Anthropic)](#3-python-sdk-with-constructor-auth-anthropic)
4. [Streaming async generator (local Llama)](#4-streaming-async-generator-local-llama)

---

## 1. Object-arg npm SDK (OpenAI)

The official `openai` npm package. Uses constructor auth; method
takes a single object argument that maps to the contract input.

```md
---
name: OpenAI SDK (in-process)
id: openai-sdk
description:
  OpenAI SDK as in-process provider. Wraps the `openai` npm package;
  implements image.create and chat.completion via direct method calls.
version: 1.0.0
kind: sdk

package: "openai"
package_manager: "npm"
package_version: "^4.50.0"
import_style: "esm"

install:
  - { method: npm, package: "openai", global: false }
version_check:
  cmd: "node -e \"console.log(require('openai/package.json').version)\""
  parse: '(\d+\.\d+\.\d+)'
  range: ">=4.50 <5"

auth:
  ref: ./SECRETS.md
  state: { env: ["OPENAI_API_KEY"] }
  expiry: { detect: "exception:AuthenticationError" }

network:
  egress: ["api.openai.com"]
region: ["global"]
policy_tags: ["third-party-llm"]

implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    schema_narrowing:
      drop_inputs: [seed, negative_prompt]
    cost_override: { cost_units_per_call: 4 }
    metadata:
      sdk:
        function_ref: "Client.images.generate"
        args_template:
          model: "dall-e-3"
          prompt: "${input.prompt}"
          size: "${input.aspect | default('1024x1024')}"
        result_extract: "$.data[0].url"
  - tool: ./tools/chat-completion/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.5 }
    metadata:
      sdk:
        function_ref: "Client.chat.completions.create"
        args_template:
          model: "${input.model | default('gpt-4o')}"
          messages: "${input.messages}"
          stream: false
        result_extract: "$.choices[0].message.content"

tags: [openai, in-process, sdk]
---
```

---

## 2. Workspace-local SDK (self-hosted SDXL)

Self-hosted Stable Diffusion XL running in-process on a local GPU.
Workspace-local package, no registry install, no third-party network.

```md
---
name: Local SDXL (SDK)
id: host-sdxl-sdk
description:
  In-process Stable Diffusion XL model. Uses host's GPU. PII-safe.
version: 1.0.0
kind: sdk

package: "@host/sdxl-runner"
package_manager: "local"
import_style: "esm"

install:
  - { method: vendored, path: "./packages/sdxl-runner" }

network:
  egress: []
region: ["self-hosted"]
policy_tags: ["self-hosted", "pii-safe", "no-third-party"]

auth:
  ref: ./SECRETS.md
  state: { env: ["SDXL_MODEL_PATH", "SDXL_DEVICE"] }

implements:
  - tool: ./tools/image-create/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.5 }
    metadata:
      sdk:
        function_ref: "default"
        result_extract: "$.imagePath"

tags: [sdxl, self-hosted, pii-safe]
---
```

---

## 3. Python SDK with constructor auth (Anthropic)

Python SDK loaded via pip. Constructor takes the API key; the
provider's entry handles instantiation.

```md
---
name: Anthropic Python SDK
id: anthropic-py-sdk
description:
  Anthropic SDK as in-process Python provider. Constructor-based auth.
  Implements chat-completion via Client.messages.create.
version: 1.0.0
kind: sdk

package: "anthropic"
package_manager: "pip"
package_version: ">=0.40,<1"
import_style: "python"

install:
  - { method: pip, package: "anthropic", user: false }
version_check:
  cmd: "python -c \"import anthropic; print(anthropic.__version__)\""
  parse: '(\d+\.\d+\.\d+)'
  range: ">=0.40 <1"

auth:
  ref: ./SECRETS.md
  state: { env: ["ANTHROPIC_API_KEY"] }
  expiry: { detect: "exception:AuthenticationError" }

network:
  egress: ["api.anthropic.com"]
region: ["global"]
policy_tags: ["third-party-llm"]

implements:
  - tool: ./tools/chat-completion/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 1.5 }
    metadata:
      sdk:
        function_ref: "Client.messages.create"
        args_template:
          model: "${input.model | default('claude-3-5-sonnet-20241022')}"
          messages: "${input.messages}"
          max_tokens: 4096
        result_extract: "$.content[0].text"

tags: [anthropic, python, sdk]
---
```

The `Client.messages.create` ref tells the SDK runtime to instantiate
`anthropic.Client(api_key=...)` once per provider load (using the
resolved `ANTHROPIC_API_KEY`) and call `.messages.create(...)` per
invocation.

---

## 4. Streaming async generator (local Llama)

Local Llama inference exposing chat as an async generator. Streams
token-by-token to the caller.

```md
---
name: Local Llama 3 (SDK, streaming)
id: host-llama-sdk
description:
  In-process Llama 3 (70B) running on local GPU. Streams chat
  completions token-by-token via async iterator.
version: 1.0.0
kind: sdk

package: "@host/llama-runner"
package_manager: "local"
import_style: "esm"
streaming:
  mode: async-iterator

install:
  - { method: vendored, path: "./packages/llama-runner" }

network:
  egress: []
region: ["self-hosted"]
policy_tags: ["self-hosted", "pii-safe"]

auth:
  ref: ./SECRETS.md
  state: { env: ["LLAMA_MODEL_PATH"] }

implements:
  - tool: ./tools/chat-completion/TOOL.md
    version: "^1.0.0"
    cost_override: { cost_units_per_call: 0.1 }
    metadata:
      sdk:
        function_ref: "Client.streamChat"
        args_template:
          messages: "${input.messages}"
          maxTokens: "${input.maxTokens | default(4096)}"
        result_extract: "$.delta.content"
        streaming:
          mode: async-iterator

tags: [llama, self-hosted, streaming, pii-safe]
---
```

The runtime iterates `streamChat({...})` and yields each `delta.content`
to the caller, terminating when the generator returns.
